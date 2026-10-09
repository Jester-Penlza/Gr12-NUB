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

Install the optional hardware libraries and start the service:

```bash
python3 -m venv .venv
.venv/bin/pip install -r hardware/pi/requirements.txt
export UNIVUE_SUPABASE_PUBLISHABLE_KEY='your publishable key'
.venv/bin/python hardware/pi/univue_hardware_service.py
```

The server binds only to `127.0.0.1:8787`. Configure `hardwareBaseUrl` in `supabase-config.js` as `http://127.0.0.1:8787` when the browser and service run on the same Raspberry Pi.

To enable a supported USB ESC/POS receipt printer, set `UNIVUE_PRINTER_USB_VENDOR` and `UNIVUE_PRINTER_USB_PRODUCT` to its hexadecimal USB IDs. Without those values, receipt requests are logged in simulation mode and no physical receipt is claimed.
