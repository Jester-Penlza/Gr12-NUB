# CUTTE Uniform Stock Kiosk

This repository contains the complete prototype software for a local school-uniform stock availability kiosk:

- `firmware/arduino/cutte_stock_controller/` — Arduino Uno stock, EEPROM, LEDs, button, and buzzer controller.
- `firmware/esp32/cutte_kiosk_bridge/` — ESP32 access point, web server, administrator session, and serial bridge.
- `firmware/esp32/cutte_kiosk_bridge/data/` — touchscreen-friendly HTML, CSS, and JavaScript uploaded to ESP32 LittleFS.
- `simulator/` — no-database development server that lets the full browser flow run without hardware.
- `tests/` — automated model and HTTP contract tests.
- `docs/` — wiring, setup, and acceptance-test instructions.

The production architecture remains: browser → ESP32 → serial → Arduino Uno → 6×6 stock array and EEPROM. Every item-and-size count is limited to 0–30. Product pages show all six counts without changing the lights; confirming one size activates green for 4–30, yellow for 1–3, or red for 0. Student checks, carts, and orders never reduce stock automatically. No database or online payment processing is included; payment is completed with school staff.

## Verify the software

Install Node.js 20 or newer, then run:

```powershell
npm.cmd test
```

The tests cover all 36 stock combinations, exact stock thresholds, read-only checks, validation, authentication, confirmed updates, and HTTP error behavior.

## Run without hardware

```powershell
$env:CUTTE_ADMIN_PIN = "2468"
npm.cmd start
```

Open `http://127.0.0.1:8080`. The simulator keeps quantities only in memory and resets when stopped; it is not the production stock owner.

## Upload to hardware

1. Follow [docs/WIRING.md](docs/WIRING.md), including the mandatory Uno-TX-to-ESP32-RX level conversion.
2. Upload `cutte_stock_controller.ino` to the Arduino Uno.
3. Change the placeholder access-point password and administrator PIN in `cutte_kiosk_bridge.ino`.
4. Upload the ESP32 sketch and its `data/` directory to LittleFS.
5. Connect to the `CUTTE-KIOSK` Wi-Fi access point and open `http://192.168.4.1`.
6. Execute [docs/TEST_PLAN.md](docs/TEST_PLAN.md) on the real hardware and record actual results before claiming the prototype works.

Initial EEPROM quantities are deliberately zero. An administrator must enter physically verified quantities; the code never invents school stock.

## GitHub Pages online demo

The repository includes an automated GitHub Pages workflow. Every push to `main` runs the tests, builds the frontend from the ESP32 `data/` directory, and deploys the generated static site.

```powershell
npm.cmd run build:pages
npm.cmd run preview:pages
```

The expected project URL is `https://jester-penlza.github.io/Gr12-NUB/` after GitHub Pages is enabled with **GitHub Actions** as its publishing source.

GitHub Pages is a browser demonstration, not the physical stock authority. Its 36 sample quantities begin at 10 and browser-local admin changes use prototype PIN `2468`. Those changes remain only in that browser. The real kiosk still runs at `http://192.168.4.1` while connected to the ESP32 and uses Arduino EEPROM plus the physical LEDs.
