# Functional Acceptance Test Plan

Automated tests validate the reference model and local HTTP contract. Real LED behavior, EEPROM persistence, serial voltage safety, button debounce, buzzer output, and ESP32/Uno timing require physical hardware testing.

Run the software checks first:

```powershell
npm.cmd test
```

For every hardware test, record the date, Arduino sketch version, ESP32 sketch version, tester, actual result, pass/fail status, and corrective action. Do not mark a row passed from expected behavior alone.

| ID | Test procedure | Expected result | Date/version | Actual result | Pass/Fail | Corrective action |
| --- | --- | --- | --- | --- | --- | --- |
| HW-01 | Measure Uno D11 signal after the level converter before connecting ESP32. | Signal is within ESP32-safe logic voltage; boards share ground. |  |  |  |  |
| HW-02 | Power up with a new EEPROM layout marker. | All 36 quantities initialize to 0; no quantity is invented. |  |  |  |  |
| HW-03 | Set `T_SHIRT/M` to 15, restart the Uno, then GET it. | Reply remains `STOCK|15|AVAILABLE`. |  |  |  |  |
| HW-04 | Check quantities 0, 1, 3, and 4. | 0 = red/OUT OF STOCK; 1–3 = yellow/LOW STOCK; 4 = green/AVAILABLE; only one LED is on. |  |  |  |  |
| HW-05 | Press and hold the assistance button once, then release. | One short buzzer event and exactly one assistance message. |  |  |  |  |
| HW-06 | Rapidly tap the assistance button twice as separate presses. | Exactly two buzzer events and two assistance messages. |  |  |  |  |
| SER-01 | Send every valid GET combination (6 items × 6 sizes). | All 36 return their stored quantity and correct status. |  |  |  |  |
| SER-02 | Repeat a GET 20 times. | Quantity never changes. |  |  |  |  |
| SER-03 | Send blank, negative, decimal, 31, unknown-item, and unknown-size SET values. | Clear ERROR response; previous quantity remains unchanged. |  |  |  |  |
| SER-04 | Send `PEEK` for every size, then send `GET` for one selected size. | `PEEK` returns stock without changing LEDs; `GET` lights only the selected size status. |  |  |  |  |
| SER-04 | Send an overlong or malformed command. | `ERROR|BAD_REQUEST`; controller remains responsive. |  |  |  |  |
| WEB-01 | Open the ESP32 access point and browse to `192.168.4.1`. | Home screen loads from LittleFS and controls are readable by touch. |  |  |  |  |
| WEB-02 | Choose Formal → Male. | Only Male Polo and Male Pants appear. |  |  |  |  |
| WEB-03 | Choose Formal → Female. | Only Female Blouse and Female Skirt appear. |  |  |  |  |
| WEB-04 | Choose School T-Shirt and PE Uniform separately. | Both skip the gender screen. |  |  |  |  |
| WEB-05 | Complete a valid student check. | Item, size, quantity, status words, and guidance appear; status is not color-only. |  |  |  |  |
| WEB-06 | Disconnect or power off the Arduino and check stock. | Timeout/controller error appears; no stock result is invented. |  |  |  |  |
| ADM-01 | Submit an incorrect PIN, then the configured PIN. | Incorrect PIN is rejected; configured PIN opens inventory management. |  |  |  |  |
| ADM-02 | Choose item/size and attempt save before reading current value. | Save remains blocked until the current Arduino quantity is read. |  |  |  |  |
| ADM-03 | Read a quantity, enter a valid replacement, and save. | Success appears only after exact Arduino `UPDATED` response. |  |  |  |  |
| ADM-04 | Try blank, negative, decimal, and 31 in browser and direct HTTP requests. | Browser and controller reject them; old quantity remains. |  |  |  |  |
| WEB-06 | Open a specific product. | All six sizes show their current quantity and word status; maximum 30 is visible. |  |  |  |  |
| ADM-05 | Log out or wait 30 minutes, then call POST `/update`. | Request returns `UNAUTHORIZED`; stock is unchanged. |  |  |  |  |
| AST-01 | Press the physical assistance button while the kiosk page is open. | One local assistance banner appears for the one press. |  |  |  |  |
| ACC-01 | Navigate using keyboard only and inspect visible focus. | Every interactive control is reachable and has a visible focus indicator. |  |  |  |  |

## Completion rule

The prototype is complete only when every required row has an actual result. Any failed safety row—especially voltage conversion or grounding—must be corrected before further powered testing. Keep this sheet with the final wiring photos and the exact source versions used during the test.
