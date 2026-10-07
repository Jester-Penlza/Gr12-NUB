#include <EEPROM.h>
#include <SoftwareSerial.h>

// Arduino Uno pin contract.
constexpr uint8_t PIN_ASSIST_BUTTON = 2;
constexpr uint8_t PIN_LED_GREEN = 6;
constexpr uint8_t PIN_LED_YELLOW = 7;
constexpr uint8_t PIN_LED_RED = 8;
constexpr uint8_t PIN_BUZZER = 9;
constexpr uint8_t PIN_SERIAL_RX = 10;  // Receives ESP32 TX (3.3 V is safe for Uno input).
constexpr uint8_t PIN_SERIAL_TX = 11;  // Must pass through level conversion to ESP32 RX.

constexpr uint8_t ITEM_COUNT = 6;
constexpr uint8_t SIZE_COUNT = 6;
constexpr uint8_t MAX_QUANTITY = 30;
constexpr int EEPROM_MARKER_ADDRESS = 36;
constexpr int EEPROM_VERSION_ADDRESS = 37;
constexpr uint8_t EEPROM_MARKER = 0xC7;
constexpr uint8_t EEPROM_LAYOUT_VERSION = 1;
constexpr unsigned long DEBOUNCE_MS = 35;
constexpr unsigned long BUZZER_MS = 220;
constexpr size_t COMMAND_BUFFER_SIZE = 64;

const char *const ITEM_CODES[ITEM_COUNT] = {
  "MALE_POLO", "FEMALE_BLOUSE", "MALE_PANTS",
  "FEMALE_SKIRT", "T_SHIRT", "PE_UNIFORM"
};
const char *const SIZE_CODES[SIZE_COUNT] = { "XS", "S", "M", "L", "XL", "XXL" };

uint8_t inventory[ITEM_COUNT][SIZE_COUNT];
SoftwareSerial bridgeSerial(PIN_SERIAL_RX, PIN_SERIAL_TX);

char commandBuffer[COMMAND_BUFFER_SIZE];
size_t commandLength = 0;
bool commandOverflow = false;

bool lastRawButton = HIGH;
bool stableButton = HIGH;
unsigned long lastButtonChangeAt = 0;
unsigned long buzzerOffAt = 0;

int eepromAddress(uint8_t itemIndex, uint8_t sizeIndex) {
  return (itemIndex * SIZE_COUNT) + sizeIndex;
}

void initializeInventory() {
  const bool initialized = EEPROM.read(EEPROM_MARKER_ADDRESS) == EEPROM_MARKER
    && EEPROM.read(EEPROM_VERSION_ADDRESS) == EEPROM_LAYOUT_VERSION;
  if (initialized) return;

  // A safe first run never invents school stock. Administrators enter verified counts.
  for (uint8_t item = 0; item < ITEM_COUNT; ++item) {
    for (uint8_t size = 0; size < SIZE_COUNT; ++size) {
      EEPROM.update(eepromAddress(item, size), 0);
    }
  }
  EEPROM.update(EEPROM_VERSION_ADDRESS, EEPROM_LAYOUT_VERSION);
  EEPROM.update(EEPROM_MARKER_ADDRESS, EEPROM_MARKER);
}

void loadInventory() {
  for (uint8_t item = 0; item < ITEM_COUNT; ++item) {
    for (uint8_t size = 0; size < SIZE_COUNT; ++size) {
      const int address = eepromAddress(item, size);
      const uint8_t stored = EEPROM.read(address);
      inventory[item][size] = stored > MAX_QUANTITY ? MAX_QUANTITY : stored;
      if (stored > MAX_QUANTITY) EEPROM.update(address, MAX_QUANTITY);
    }
  }
}

int8_t findItemCode(const char *code) {
  if (code == nullptr) return -1;
  for (uint8_t i = 0; i < ITEM_COUNT; ++i) {
    if (strcmp(code, ITEM_CODES[i]) == 0) return i;
  }
  return -1;
}

int8_t findSizeCode(const char *code) {
  if (code == nullptr) return -1;
  for (uint8_t i = 0; i < SIZE_COUNT; ++i) {
    if (strcmp(code, SIZE_CODES[i]) == 0) return i;
  }
  return -1;
}

const char *statusFor(uint8_t quantity) {
  if (quantity == 0) return "OUT_OF_STOCK";
  if (quantity <= 3) return "LOW_STOCK";
  return "AVAILABLE";
}

void setStatusLeds(const char *status) {
  digitalWrite(PIN_LED_GREEN, LOW);
  digitalWrite(PIN_LED_YELLOW, LOW);
  digitalWrite(PIN_LED_RED, LOW);

  if (strcmp(status, "AVAILABLE") == 0) digitalWrite(PIN_LED_GREEN, HIGH);
  else if (strcmp(status, "LOW_STOCK") == 0) digitalWrite(PIN_LED_YELLOW, HIGH);
  else if (strcmp(status, "OUT_OF_STOCK") == 0) digitalWrite(PIN_LED_RED, HIGH);
}

void sendError(const char *code) {
  bridgeSerial.print(F("ERROR|"));
  bridgeSerial.println(code);
}

void sendStock(const char *itemCode, const char *sizeCode, bool signalStatus) {
  const int8_t itemIndex = findItemCode(itemCode);
  if (itemIndex < 0) {
    sendError("UNKNOWN_ITEM");
    return;
  }
  const int8_t sizeIndex = findSizeCode(sizeCode);
  if (sizeIndex < 0) {
    sendError("UNKNOWN_SIZE");
    return;
  }

  const uint8_t quantity = inventory[itemIndex][sizeIndex];
  const char *status = statusFor(quantity);
  if (signalStatus) setStatusLeds(status);
  bridgeSerial.print(F("STOCK|"));
  bridgeSerial.print(quantity);
  bridgeSerial.print('|');
  bridgeSerial.println(status);
}

void processGet(const char *itemCode, const char *sizeCode) {
  sendStock(itemCode, sizeCode, true);
}

void processPeek(const char *itemCode, const char *sizeCode) {
  sendStock(itemCode, sizeCode, false);
}

bool parseQuantityStrict(const char *text, uint8_t &quantity) {
  if (text == nullptr || *text == '\0') return false;
  unsigned long value = 0;
  for (const char *cursor = text; *cursor != '\0'; ++cursor) {
    if (*cursor < '0' || *cursor > '9') return false;
    value = (value * 10UL) + static_cast<unsigned long>(*cursor - '0');
    if (value > MAX_QUANTITY) return false;
  }
  quantity = static_cast<uint8_t>(value);
  return true;
}

void processSet(const char *itemCode, const char *sizeCode, const char *quantityText) {
  const int8_t itemIndex = findItemCode(itemCode);
  if (itemIndex < 0) {
    sendError("UNKNOWN_ITEM");
    return;
  }
  const int8_t sizeIndex = findSizeCode(sizeCode);
  if (sizeIndex < 0) {
    sendError("UNKNOWN_SIZE");
    return;
  }

  uint8_t quantity = 0;
  if (!parseQuantityStrict(quantityText, quantity)) {
    sendError("BAD_QUANTITY");
    return;
  }

  inventory[itemIndex][sizeIndex] = quantity;
  EEPROM.update(eepromAddress(itemIndex, sizeIndex), quantity);
  setStatusLeds(statusFor(quantity));

  // This confirmation is emitted only after the RAM value and EEPROM byte are updated.
  bridgeSerial.print(F("UPDATED|"));
  bridgeSerial.print(itemCode);
  bridgeSerial.print('|');
  bridgeSerial.print(sizeCode);
  bridgeSerial.print('|');
  bridgeSerial.println(quantity);
}

void processCommand(char *line) {
  char *savePointer = nullptr;
  char *parts[5] = { nullptr, nullptr, nullptr, nullptr, nullptr };
  uint8_t count = 0;
  char *token = strtok_r(line, "|", &savePointer);
  while (token != nullptr && count < 5) {
    parts[count++] = token;
    token = strtok_r(nullptr, "|", &savePointer);
  }

  if (token != nullptr || count == 0) {
    sendError("BAD_REQUEST");
  } else if (strcmp(parts[0], "GET") == 0 && count == 3) {
    processGet(parts[1], parts[2]);
  } else if (strcmp(parts[0], "PEEK") == 0 && count == 3) {
    processPeek(parts[1], parts[2]);
  } else if (strcmp(parts[0], "SET") == 0 && count == 4) {
    processSet(parts[1], parts[2], parts[3]);
  } else {
    sendError("BAD_REQUEST");
  }
}

void readBridgeCommands() {
  while (bridgeSerial.available() > 0) {
    const char incoming = static_cast<char>(bridgeSerial.read());
    if (incoming == '\r') continue;
    if (incoming == '\n') {
      if (commandOverflow) sendError("BAD_REQUEST");
      else if (commandLength > 0) {
        commandBuffer[commandLength] = '\0';
        processCommand(commandBuffer);
      }
      commandLength = 0;
      commandOverflow = false;
      continue;
    }
    if (commandOverflow) continue;
    if (commandLength < COMMAND_BUFFER_SIZE - 1) commandBuffer[commandLength++] = incoming;
    else commandOverflow = true;
  }
}

void monitorAssistanceButton() {
  const unsigned long now = millis();
  const bool rawButton = digitalRead(PIN_ASSIST_BUTTON);
  if (rawButton != lastRawButton) {
    lastRawButton = rawButton;
    lastButtonChangeAt = now;
  }

  if ((now - lastButtonChangeAt) >= DEBOUNCE_MS && rawButton != stableButton) {
    stableButton = rawButton;
    if (stableButton == LOW) {
      digitalWrite(PIN_BUZZER, HIGH);
      buzzerOffAt = now + BUZZER_MS;
      bridgeSerial.println(F("ASSIST|REQUESTED"));
    }
  }

  if (buzzerOffAt != 0 && static_cast<long>(now - buzzerOffAt) >= 0) {
    digitalWrite(PIN_BUZZER, LOW);
    buzzerOffAt = 0;
  }
}

void setup() {
  pinMode(PIN_LED_GREEN, OUTPUT);
  pinMode(PIN_LED_YELLOW, OUTPUT);
  pinMode(PIN_LED_RED, OUTPUT);
  pinMode(PIN_BUZZER, OUTPUT);
  pinMode(PIN_ASSIST_BUTTON, INPUT_PULLUP);
  setStatusLeds("");
  digitalWrite(PIN_BUZZER, LOW);

  Serial.begin(115200);       // USB diagnostics only.
  bridgeSerial.begin(9600);   // ESP32 bridge contract.
  initializeInventory();
  loadInventory();
  Serial.println(F("CUTTE Arduino stock controller ready"));
}

void loop() {
  readBridgeCommands();
  monitorAssistanceButton();
}
