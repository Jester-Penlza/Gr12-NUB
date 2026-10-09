# UNIVUE Raspberry Pi hardware service

This local-only service connects the physical assistance button, three stock-status LEDs, buzzer, and optional USB thermal printer to the UNIVUE website.

Default BCM pins:

| Function | BCM pin |
| --- | ---: |
| Assistance button | 17 |
| Available LED | 22 |
| Low-stock LED | 27 |
| Out-of-stock LED | 24 |
| Buzzer | 23 |

Raspberry Pi GPIO is 3.3 V only. Use current-limiting resistors for LEDs and an appropriate driver for any buzzer, speaker, or printer load.

Connect the assistance push button between BCM 17 and GND. The service enables the Pi's internal pull-up resistor and debounces the input in software. Use an active 3.3 V buzzer module on BCM 23 through a suitable transistor/driver when its current exceeds the GPIO limit. Do not connect a raw loudspeaker directly to a GPIO pin.

Install the optional hardware libraries and start the service:

```bash
python3 -m venv .venv
.venv/bin/pip install -r hardware/pi/requirements.txt
export UNIVUE_SUPABASE_PUBLISHABLE_KEY='your publishable key'
.venv/bin/python hardware/pi/univue_hardware_service.py
```

The server binds only to `127.0.0.1:8787`. Configure `hardwareBaseUrl` in `supabase-config.js` as `http://127.0.0.1:8787` when the browser and service run on the same Raspberry Pi.

## Assistance flow

The physical button does not need the kiosk website to be hosted by the Pi. Pressing it makes the local buzzer chirp for confirmation, then the Python service sends a restricted `request_assistance` call directly to Supabase. The GitHub Pages staff dashboard receives the new row through Supabase Realtime, adds it to the assistance queue, shows a toast, vibrates supported devices, and plays a two-tone alert after staff enables sound. Internet access is required for the Pi and the staff device.

The on-screen **Request help** button follows the same database path from the browser. Staff can acknowledge and resolve either kind of request. The kiosk page then displays the updated status.

For the three stock LEDs and a directly attached printer, run the kiosk frontend locally at `http://127.0.0.1:8080` with `npm start`. The local frontend automatically uses the hardware service at `http://127.0.0.1:8787`. The deployed HTTPS page can still create orders and assistance requests, but browsers intentionally prevent it from controlling an unsecured loopback hardware endpoint.

## Thermal printer trigger

The existing print trigger is the staff dashboard's **Confirm payment** button for a cash order. UNIVUE confirms the payment, creates the receipt record, and sends the receipt to `POST /hardware/print-receipt`. Printing succeeds when the staff dashboard is opened locally on the same Raspberry Pi as this service and a supported USB ESC/POS printer is configured.

If staff use the public GitHub Pages dashboard on a separate computer, the browser cannot securely call the Pi's loopback URL. A production remote setup should add a Supabase print-job queue that the Pi claims with a device-specific credential; do not expose port 8787 to the public internet.

To enable a supported USB ESC/POS receipt printer, set `UNIVUE_PRINTER_USB_VENDOR` and `UNIVUE_PRINTER_USB_PRODUCT` to its hexadecimal USB IDs. Without those values, receipt requests are logged in simulation mode and no physical receipt is claimed.
