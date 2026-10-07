# Wiring and Upload Guide

Disconnect USB and external power before changing any wire. The Arduino Uno uses 5 V logic; the ESP32 uses 3.3 V logic.

## Arduino Uno hardware

| Function | Uno pin | Connection |
| --- | --- | --- |
| Assistance button | D2 | Button between D2 and GND. Firmware uses `INPUT_PULLUP`. |
| Green LED | D6 | D6 → 220 Ω resistor → LED anode; cathode → GND. |
| Yellow LED | D7 | D7 → 220 Ω resistor → LED anode; cathode → GND. |
| Red LED | D8 | D8 → 220 Ω resistor → LED anode; cathode → GND. |
| Active buzzer control | D9 | Drive through a suitable transistor when buzzer current exceeds the pin rating. |
| Serial RX | D10 | Connect to ESP32 TX (GPIO 17). |
| Serial TX | D11 | Connect to ESP32 RX (GPIO 16) only through the level converter described below. |

All grounds must be common: Uno GND, ESP32 GND, LED ground, button ground, and buzzer-driver ground.

## Mandatory serial level conversion

Never connect Uno D11 directly to ESP32 GPIO 16. Use a verified bidirectional logic-level converter or a resistor divider that reduces 5 V to approximately 3.3 V. One common divider is:

```text
Uno D11 TX ---- 1 kΩ ----+---- ESP32 GPIO 16 RX
                         |
                        2 kΩ
                         |
                        GND
```

Confirm the divider with a meter before attaching the ESP32. ESP32 GPIO 17 can connect directly to Uno D10 because a 3.3 V HIGH is accepted by the Uno input.

Do not power the boards from two supplies unless their grounding and back-feed behavior have been checked. During bench testing, separate USB cables with a shared signal ground are the simplest arrangement.

## Arduino Uno upload

1. Open `firmware/arduino/cutte_stock_controller/cutte_stock_controller.ino` in Arduino IDE.
2. Select **Arduino Uno** and the correct serial port.
3. Upload the sketch.
4. Open Serial Monitor at 115200 baud. It should report that the controller is ready.
5. Initial stock is deliberately zero. EEPROM addresses 0–35 hold the 36 quantities; addresses 36–37 hold the initialization marker and layout version.

## ESP32 upload

1. Install the current Espressif ESP32 board package in Arduino IDE.
2. Open `firmware/esp32/cutte_kiosk_bridge/cutte_kiosk_bridge.ino`.
3. Change `AP_PASSWORD` and `ADMIN_PIN`. The PIN remains demonstration-only protection.
4. Select the exact ESP32 board and its port, then upload the sketch.
5. Upload the sketch's `data/` directory to LittleFS using the IDE's ESP32 filesystem upload tool. The interface will return `WEB_FILES_MISSING` if this step is skipped.
6. Open Serial Monitor at 115200 baud and confirm the displayed kiosk address.

## Serial bench check

Before opening the web interface, verify the line protocol at 9600 baud:

```text
GET|T_SHIRT|M

PEEK|T_SHIRT|M
STOCK|0|OUT_OF_STOCK
SET|T_SHIRT|M|15
UPDATED|T_SHIRT|M|15
GET|T_SHIRT|M
STOCK|15|AVAILABLE
```

Each command and response ends with a newline. A successful update is not shown in the browser until the exact `UPDATED` confirmation is received.

## Assistance circuit behavior

The button rests HIGH and reads LOW when pressed. Firmware debounces for 35 ms, emits one `ASSIST|REQUESTED` message per press, and drives the buzzer for about 220 ms without blocking command processing. If a passive buzzer is used instead of an active buzzer, replace the HIGH/LOW drive with an appropriate `tone`/`noTone` implementation and update the test record.
