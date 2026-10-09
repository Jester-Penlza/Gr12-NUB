#!/usr/bin/env python3
"""UNIVUE Raspberry Pi GPIO, assistance-button, and receipt bridge.

The service binds to loopback only. It accepts structured local requests from the
UNIVUE browser and sends physical help-button events to the restricted Supabase
RPC using the public publishable key.
"""

from __future__ import annotations

import json
import os
import threading
import time
import urllib.error
import urllib.request
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from typing import Any


SUPABASE_URL = os.environ.get("UNIVUE_SUPABASE_URL", "https://scvwqyoyzosgavegjwhh.supabase.co").rstrip("/")
SUPABASE_KEY = os.environ.get("UNIVUE_SUPABASE_PUBLISHABLE_KEY", "")
KIOSK_CODE = os.environ.get("UNIVUE_KIOSK_CODE", "UNIVUE-01")
ALLOWED_ORIGIN = os.environ.get("UNIVUE_ALLOWED_ORIGIN", "http://127.0.0.1:8080")
PORT = int(os.environ.get("UNIVUE_HARDWARE_PORT", "8787"))


class DummyOutput:
    def on(self) -> None: pass
    def off(self) -> None: pass
    def close(self) -> None: pass


class Hardware:
    def __init__(self) -> None:
        self.available = False
        self.green: Any = DummyOutput()
        self.yellow: Any = DummyOutput()
        self.red: Any = DummyOutput()
        self.buzzer: Any = DummyOutput()
        self.button: Any = None
        try:
            from gpiozero import Button, LED, Buzzer

            self.green = LED(int(os.environ.get("UNIVUE_GREEN_LED_PIN", "22")))
            self.yellow = LED(int(os.environ.get("UNIVUE_YELLOW_LED_PIN", "27")))
            self.red = LED(int(os.environ.get("UNIVUE_RED_LED_PIN", "24")))
            self.buzzer = Buzzer(int(os.environ.get("UNIVUE_BUZZER_PIN", "23")))
            self.button = Button(
                int(os.environ.get("UNIVUE_ASSIST_BUTTON_PIN", "17")),
                pull_up=True,
                bounce_time=0.15,
            )
            self.button.when_pressed = self._button_pressed
            self.available = True
        except (ImportError, OSError, ValueError) as error:
            print(f"GPIO simulation mode: {error}")

    def set_indicator(self, status: str) -> None:
        self.green.off()
        self.yellow.off()
        self.red.off()
        {"AVAILABLE": self.green, "LOW_STOCK": self.yellow, "OUT_OF_STOCK": self.red}[status].on()

    def _button_pressed(self) -> None:
        threading.Thread(target=self.request_assistance, daemon=True).start()

    def request_assistance(self) -> None:
        self.buzzer.on()
        time.sleep(0.12)
        self.buzzer.off()
        if not SUPABASE_KEY:
            print("Assistance not sent: UNIVUE_SUPABASE_PUBLISHABLE_KEY is missing")
            return
        payload = json.dumps({
            "p_kiosk_code": KIOSK_CODE,
            "p_product_code": None,
            "p_size": None,
            "p_order_reference": None,
            "p_message": "Student pressed the physical assistance button.",
        }).encode("utf-8")
        request = urllib.request.Request(
            f"{SUPABASE_URL}/rest/v1/rpc/request_assistance",
            data=payload,
            headers={
                "apikey": SUPABASE_KEY,
                "Authorization": f"Bearer {SUPABASE_KEY}",
                "Content-Type": "application/json",
            },
            method="POST",
        )
        try:
            with urllib.request.urlopen(request, timeout=12) as response:
                print(f"Assistance request sent: HTTP {response.status}")
        except (urllib.error.URLError, TimeoutError) as error:
            print(f"Assistance request failed: {error}")

    def print_receipt(self, receipt: dict[str, Any]) -> bool:
        vendor = os.environ.get("UNIVUE_PRINTER_USB_VENDOR")
        product = os.environ.get("UNIVUE_PRINTER_USB_PRODUCT")
        if not vendor or not product:
            print(f"Receipt simulation: {receipt.get('reference', 'UNIVUE')} — {receipt.get('total', 0)}")
            return False
        try:
            from escpos.printer import Usb

            printer = Usb(int(vendor, 0), int(product, 0))
            printer.set(align="center", bold=True, width=2, height=2)
            printer.text("UNIVUE\n")
            printer.set(align="center", bold=False, width=1, height=1)
            printer.text("NU Baliwag Bulldogs Exchange\n")
            printer.text(f"Receipt: {receipt['reference']}\n")
            printer.text("-" * 32 + "\n")
            printer.set(align="left")
            for item in receipt.get("items", []):
                printer.text(f"{item['name']} {item['size']} x{item['quantity']}\n")
            printer.text("-" * 32 + "\n")
            printer.set(align="right", bold=True)
            printer.text(f"TOTAL PHP {float(receipt['total']):.2f}\n")
            printer.set(align="center", bold=False)
            printer.text("Payment confirmed by authorized staff\n\n")
            printer.cut()
            return True
        except (ImportError, OSError, KeyError, TypeError, ValueError) as error:
            print(f"Receipt printing failed: {error}")
            return False

    def close(self) -> None:
        for device in (self.green, self.yellow, self.red, self.buzzer, self.button):
            if device is not None:
                device.close()


HARDWARE = Hardware()


class Handler(BaseHTTPRequestHandler):
    server_version = "UNIVUE-Hardware/1.0"

    def _headers(self, status: int = 200) -> None:
        self.send_response(status)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Access-Control-Allow-Origin", ALLOWED_ORIGIN)
        self.send_header("Access-Control-Allow-Headers", "Content-Type")
        self.send_header("Access-Control-Allow-Methods", "GET, POST, OPTIONS")
        self.send_header("Cache-Control", "no-store")
        self.end_headers()

    def _json(self, status: int, payload: dict[str, Any]) -> None:
        self._headers(status)
        self.wfile.write(json.dumps(payload).encode("utf-8"))

    def _body(self) -> dict[str, Any]:
        length = int(self.headers.get("Content-Length", "0"))
        if length < 1 or length > 32_768:
            raise ValueError("BAD_BODY_LENGTH")
        return json.loads(self.rfile.read(length).decode("utf-8"))

    def do_OPTIONS(self) -> None:  # noqa: N802
        self._headers(204)

    def do_GET(self) -> None:  # noqa: N802
        if self.path == "/health":
            self._json(200, {"ok": True, "gpio": HARDWARE.available, "kiosk": KIOSK_CODE})
            return
        self._json(404, {"error": "NOT_FOUND"})

    def do_POST(self) -> None:  # noqa: N802
        try:
            body = self._body()
            if self.path == "/hardware/indicator":
                status = str(body.get("status", ""))
                if status not in ("AVAILABLE", "LOW_STOCK", "OUT_OF_STOCK"):
                    raise ValueError("BAD_STATUS")
                HARDWARE.set_indicator(status)
                self._json(200, {"confirmed": True, "status": status, "gpio": HARDWARE.available})
                return
            if self.path == "/hardware/print-receipt":
                if not body.get("reference") or not isinstance(body.get("items"), list):
                    raise ValueError("BAD_RECEIPT")
                printed = HARDWARE.print_receipt(body)
                self._json(200, {"confirmed": True, "printed": printed})
                return
            if self.path == "/hardware/test-assistance":
                threading.Thread(target=HARDWARE.request_assistance, daemon=True).start()
                self._json(202, {"accepted": True})
                return
            self._json(404, {"error": "NOT_FOUND"})
        except (ValueError, json.JSONDecodeError) as error:
            self._json(400, {"error": str(error)})

    def log_message(self, format_string: str, *args: Any) -> None:
        print(f"{self.client_address[0]} — {format_string % args}")


def main() -> None:
    server = ThreadingHTTPServer(("127.0.0.1", PORT), Handler)
    print(f"UNIVUE hardware service: http://127.0.0.1:{PORT} (GPIO: {HARDWARE.available})")
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        pass
    finally:
        server.server_close()
        HARDWARE.close()


if __name__ == "__main__":
    main()
