#include <Arduino.h>
#include <FS.h>
#include <LittleFS.h>
#include <WebServer.h>
#include <WiFi.h>

// Replace these placeholders before demonstration.
const char *AP_NAME = "CUTTE-KIOSK";
const char *AP_PASSWORD = "CHANGE-ME-1234";  // WPA2 requires at least 8 characters.
const char *ADMIN_PIN = "2468";              // CHANGE before demo; not production authentication.

constexpr int ARDUINO_RX_PIN = 16;  // Receives Uno TX through verified level conversion.
constexpr int ARDUINO_TX_PIN = 17;  // ESP32 3.3 V TX to Uno RX.
constexpr uint32_t SERIAL_BAUD = 9600;
constexpr uint8_t MAX_QUANTITY = 30;
constexpr unsigned long CONTROLLER_TIMEOUT_MS = 1800;
constexpr unsigned long SESSION_TTL_MS = 30UL * 60UL * 1000UL;

const char *const ITEM_CODES[] = {
  "MALE_POLO", "FEMALE_BLOUSE", "MALE_PANTS",
  "FEMALE_SKIRT", "T_SHIRT", "PE_UNIFORM"
};
const char *const SIZE_CODES[] = { "XS", "S", "M", "L", "XL", "XXL" };

WebServer server(80);
HardwareSerial controllerSerial(2);
String sessionToken;
unsigned long sessionExpiresAt = 0;
uint32_t assistanceSequence = 0;
unsigned long lastAssistanceAt = 0;
unsigned long lastControllerReplyAt = 0;
String serialLineBuffer;

bool isKnown(const String &value, const char *const *allowed, size_t count) {
  for (size_t i = 0; i < count; ++i) {
    if (value == allowed[i]) return true;
  }
  return false;
}

bool isKnownItem(const String &item) {
  return isKnown(item, ITEM_CODES, sizeof(ITEM_CODES) / sizeof(ITEM_CODES[0]));
}

bool isKnownSize(const String &size) {
  return isKnown(size, SIZE_CODES, sizeof(SIZE_CODES) / sizeof(SIZE_CODES[0]));
}

bool parseQuantity(const String &text, uint8_t &quantity) {
  if (text.length() == 0 || text.length() > 3) return false;
  unsigned int value = 0;
  for (size_t i = 0; i < text.length(); ++i) {
    if (!isDigit(text[i])) return false;
    value = (value * 10U) + static_cast<unsigned int>(text[i] - '0');
    if (value > MAX_QUANTITY) return false;
  }
  quantity = static_cast<uint8_t>(value);
  return true;
}

const char *statusFor(uint8_t quantity) {
  if (quantity == 0) return "OUT_OF_STOCK";
  if (quantity <= 3) return "LOW_STOCK";
  return "AVAILABLE";
}

String jsonEscape(const String &value) {
  String escaped;
  escaped.reserve(value.length() + 4);
  for (size_t i = 0; i < value.length(); ++i) {
    const char c = value[i];
    if (c == '\\' || c == '"') escaped += '\\';
    if (c >= 0x20) escaped += c;
  }
  return escaped;
}

void sendJson(int statusCode, const String &body) {
  server.sendHeader("Cache-Control", "no-store");
  server.send(statusCode, "application/json", body);
}

void sendError(int statusCode, const String &code) {
  sendJson(statusCode, "{\"error\":\"" + jsonEscape(code) + "\"}");
}

String jsonValue(const String &body, const String &key) {
  const String needle = "\"" + key + "\"";
  int position = body.indexOf(needle);
  if (position < 0) return "";
  position = body.indexOf(':', position + needle.length());
  if (position < 0) return "";
  ++position;
  while (position < static_cast<int>(body.length()) && isspace(body[position])) ++position;
  if (position >= static_cast<int>(body.length())) return "";

  if (body[position] == '"') {
    ++position;
    const int end = body.indexOf('"', position);
    return end < 0 ? "" : body.substring(position, end);
  }
  int end = position;
  while (end < static_cast<int>(body.length()) && body[end] != ',' && body[end] != '}') ++end;
  String value = body.substring(position, end);
  value.trim();
  return value;
}

String cookieValue(const String &name) {
  if (!server.hasHeader("Cookie")) return "";
  const String cookie = server.header("Cookie");
  const String needle = name + "=";
  int start = cookie.indexOf(needle);
  if (start < 0) return "";
  start += needle.length();
  int end = cookie.indexOf(';', start);
  if (end < 0) end = cookie.length();
  String value = cookie.substring(start, end);
  value.trim();
  return value;
}

bool sessionIsValid() {
  if (sessionToken.length() == 0 || cookieValue("cutte_session") != sessionToken) return false;
  if (static_cast<long>(millis() - sessionExpiresAt) >= 0) {
    sessionToken = "";
    return false;
  }
  sessionExpiresAt = millis() + SESSION_TTL_MS;
  return true;
}

String newSessionToken() {
  char buffer[33];
  snprintf(buffer, sizeof(buffer), "%08lx%08lx%08lx%08lx",
    static_cast<unsigned long>(esp_random()), static_cast<unsigned long>(esp_random()),
    static_cast<unsigned long>(esp_random()), static_cast<unsigned long>(esp_random()));
  return String(buffer);
}

void recordAssistance() {
  ++assistanceSequence;
  lastAssistanceAt = millis();
}

bool receiveControllerLine(String &line, unsigned long timeoutMs) {
  const unsigned long startedAt = millis();
  while ((millis() - startedAt) < timeoutMs) {
    while (controllerSerial.available() > 0) {
      const char c = static_cast<char>(controllerSerial.read());
      if (c == '\r') continue;
      if (c == '\n') {
        line = serialLineBuffer;
        serialLineBuffer = "";
        line.trim();
        if (line == "ASSIST|REQUESTED") {
          recordAssistance();
          line = "";
          continue;
        }
        if (line.length() > 0) {
          lastControllerReplyAt = millis();
          return true;
        }
      } else if (serialLineBuffer.length() < 95) {
        serialLineBuffer += c;
      } else {
        serialLineBuffer = "";
      }
    }
    delay(1);
  }
  return false;
}

void pollController() {
  while (controllerSerial.available() > 0) {
    String line;
    if (!receiveControllerLine(line, 2)) break;
    // Non-assistance lines outside a request are intentionally discarded as stale.
  }
}

bool sendControllerCommand(const String &command, String &reply) {
  pollController();
  serialLineBuffer = "";
  controllerSerial.print(command);
  controllerSerial.print('\n');
  return receiveControllerLine(reply, CONTROLLER_TIMEOUT_MS);
}

bool splitReply(const String &reply, String parts[], size_t expectedCount) {
  size_t partIndex = 0;
  int start = 0;
  while (start <= static_cast<int>(reply.length()) && partIndex < expectedCount) {
    int separator = reply.indexOf('|', start);
    if (separator < 0) separator = reply.length();
    parts[partIndex++] = reply.substring(start, separator);
    start = separator + 1;
    if (separator == static_cast<int>(reply.length())) break;
  }
  return partIndex == expectedCount && start > static_cast<int>(reply.length());
}

void mapControllerError(const String &reply) {
  if (reply.startsWith("ERROR|")) sendError(400, reply.substring(6));
  else sendError(502, "BAD_CONTROLLER_RESPONSE");
}

void serveFile(const char *path, const char *contentType) {
  File file = LittleFS.open(path, "r");
  if (!file) {
    sendError(500, "WEB_FILES_MISSING");
    return;
  }
  server.streamFile(file, contentType);
  file.close();
}

void handleCheck() {
  const String item = server.arg("item");
  const String size = server.arg("size");
  if (!isKnownItem(item)) {
    sendError(400, "UNKNOWN_ITEM");
    return;
  }
  if (!isKnownSize(size)) {
    sendError(400, "UNKNOWN_SIZE");
    return;
  }

  String reply;
  if (!sendControllerCommand("GET|" + item + "|" + size, reply)) {
    sendError(504, "TIMEOUT");
    return;
  }
  String parts[3];
  if (!splitReply(reply, parts, 3) || parts[0] != "STOCK") {
    mapControllerError(reply);
    return;
  }
  uint8_t quantity = 0;
  if (!parseQuantity(parts[1], quantity) || parts[2] != statusFor(quantity)) {
    sendError(502, "BAD_CONTROLLER_RESPONSE");
    return;
  }
  sendJson(200, "{\"item\":\"" + item + "\",\"size\":\"" + size
    + "\",\"quantity\":" + String(quantity) + ",\"status\":\"" + parts[2] + "\"}");
}

void handleInventory() {
  const String item = server.arg("item");
  if (!isKnownItem(item)) {
    sendError(400, "UNKNOWN_ITEM");
    return;
  }

  String body = "{\"item\":\"" + item + "\",\"maxQuantity\":" + String(MAX_QUANTITY) + ",\"sizes\":[";
  for (size_t i = 0; i < sizeof(SIZE_CODES) / sizeof(SIZE_CODES[0]); ++i) {
    const String size = SIZE_CODES[i];
    String reply;
    if (!sendControllerCommand("PEEK|" + item + "|" + size, reply)) {
      sendError(504, "TIMEOUT");
      return;
    }
    String parts[3];
    uint8_t quantity = 0;
    if (!splitReply(reply, parts, 3) || parts[0] != "STOCK"
        || !parseQuantity(parts[1], quantity) || parts[2] != statusFor(quantity)) {
      mapControllerError(reply);
      return;
    }
    if (i > 0) body += ',';
    body += "{\"item\":\"" + item + "\",\"size\":\"" + size
      + "\",\"quantity\":" + String(quantity) + ",\"status\":\"" + parts[2] + "\"}";
  }
  body += "]}";
  sendJson(200, body);
}

void handleLogin() {
  const String pin = jsonValue(server.arg("plain"), "pin");
  if (pin != ADMIN_PIN) {
    sendError(401, "INVALID_PIN");
    return;
  }
  sessionToken = newSessionToken();
  sessionExpiresAt = millis() + SESSION_TTL_MS;
  server.sendHeader("Set-Cookie", "cutte_session=" + sessionToken + "; HttpOnly; SameSite=Strict; Path=/; Max-Age=1800");
  sendJson(200, "{\"authenticated\":true}");
}

void handleLogout() {
  sessionToken = "";
  sessionExpiresAt = 0;
  server.sendHeader("Set-Cookie", "cutte_session=; HttpOnly; SameSite=Strict; Path=/; Max-Age=0");
  sendJson(200, "{\"authenticated\":false}");
}

void handleUpdate() {
  if (!sessionIsValid()) {
    sendError(401, "UNAUTHORIZED");
    return;
  }
  const String body = server.arg("plain");
  const String item = jsonValue(body, "item");
  const String size = jsonValue(body, "size");
  const String quantityText = jsonValue(body, "quantity");
  if (!isKnownItem(item)) {
    sendError(400, "UNKNOWN_ITEM");
    return;
  }
  if (!isKnownSize(size)) {
    sendError(400, "UNKNOWN_SIZE");
    return;
  }
  uint8_t quantity = 0;
  if (!parseQuantity(quantityText, quantity)) {
    sendError(400, "BAD_QUANTITY");
    return;
  }

  String reply;
  if (!sendControllerCommand("SET|" + item + "|" + size + "|" + quantityText, reply)) {
    sendError(504, "TIMEOUT");
    return;
  }
  String parts[4];
  if (!splitReply(reply, parts, 4) || parts[0] != "UPDATED"
      || parts[1] != item || parts[2] != size || parts[3] != quantityText) {
    mapControllerError(reply);
    return;
  }
  sendJson(200, "{\"item\":\"" + item + "\",\"size\":\"" + size
    + "\",\"quantity\":" + String(quantity) + ",\"status\":\"" + statusFor(quantity)
    + "\",\"confirmed\":true}");
}

void handleStatus() {
  pollController();
  const bool recentlyOnline = lastControllerReplyAt != 0 && (millis() - lastControllerReplyAt) < 15000UL;
  const String controller = recentlyOnline ? "ONLINE" : "NOT YET VERIFIED";
  sendJson(200, "{\"controller\":\"" + controller + "\",\"assistanceSequence\":"
    + String(assistanceSequence) + ",\"assistanceRequestedAtMs\":" + String(lastAssistanceAt)
    + ",\"authenticated\":" + String(sessionIsValid() ? "true" : "false") + "}");
}

void setupRoutes() {
  const char *headerKeys[] = { "Cookie" };
  server.collectHeaders(headerKeys, 1);
  server.on("/", HTTP_GET, []() { serveFile("/index.html", "text/html"); });
  server.on("/styles.css", HTTP_GET, []() { serveFile("/styles.css", "text/css"); });
  server.on("/app.js", HTTP_GET, []() { serveFile("/app.js", "application/javascript"); });
  server.serveStatic("/images/", LittleFS, "/images/");
  server.on("/check", HTTP_GET, handleCheck);
  server.on("/inventory", HTTP_GET, handleInventory);
  server.on("/status", HTTP_GET, handleStatus);
  server.on("/login", HTTP_POST, handleLogin);
  server.on("/logout", HTTP_POST, handleLogout);
  server.on("/update", HTTP_POST, handleUpdate);
  server.onNotFound([]() { sendError(404, "NOT_FOUND"); });
}

void setup() {
  Serial.begin(115200);
  controllerSerial.begin(SERIAL_BAUD, SERIAL_8N1, ARDUINO_RX_PIN, ARDUINO_TX_PIN);
  controllerSerial.setTimeout(50);

  if (!LittleFS.begin(true)) {
    Serial.println("LittleFS mount failed");
  }

  WiFi.mode(WIFI_AP);
  if (!WiFi.softAP(AP_NAME, AP_PASSWORD)) {
    Serial.println("Access point creation failed");
  }
  Serial.print("Kiosk address: http://");
  Serial.println(WiFi.softAPIP());

  setupRoutes();
  server.begin();
  Serial.println("CUTTE ESP32 bridge ready");
}

void loop() {
  server.handleClient();
  pollController();
  delay(1);
}
