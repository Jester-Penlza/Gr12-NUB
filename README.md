# UNIVUE — NU Baliwag Uniform View

UNIVUE is a student-facing uniform kiosk and a separate staff workspace for NU Baliwag. It keeps the existing Bulldogs Exchange visual identity, NU shield, and product photographs while adding a real Supabase database, live size-level inventory, cart and checkout, order records, payment confirmation, receipts, and staff-assistance notifications.

## What is included

- `firmware/esp32/cutte_kiosk_bridge/data/` — the responsive student kiosk and staff dashboard used by the Raspberry Pi browser and GitHub Pages.
- `supabase/migrations/` — versioned PostgreSQL schema, functions, RLS policies, realtime tables, and initial data.
- `simulator/` — local web server and optional hardware-indicator endpoint for development on a computer or Raspberry Pi.
- `tests/` — inventory, HTTP, build, and frontend contract checks.
- `firmware/arduino/` and `firmware/esp32/` — the earlier two-controller prototype, kept as a hardware reference. The current recommended build uses one Raspberry Pi.

## Current architecture

```text
Student touchscreen kiosk ─┐
                           ├─ Supabase database and realtime ─ Staff dashboard
Physical help button ─ Pi ─┘
                 └─ GPIO stock LEDs / speaker / thermal receipt printer
```

The Raspberry Pi runs Chromium in kiosk mode and can run the local Node server. The browser reads the Supabase inventory and creates orders through restricted database functions. Staff sign in with Supabase Auth. Row Level Security prevents student browsers from changing stock, confirming payments, or reading staff-only records.

Every product has XS, S, M, L, XL, and XXL quantities. The database enforces a maximum of 30 units. The thresholds are:

- Available: 4–30
- Low stock: 1–3
- Out of stock: 0

The first migration seeds all 36 product-and-size combinations at 10 units.

## Run and verify locally

Install Node.js 20 or newer, then run:

```powershell
npm.cmd test
npm.cmd run preview:pages
```

Open `http://127.0.0.1:4173/` for the student kiosk and `http://127.0.0.1:4173/staff.html` for staff.

The website uses the public values in `supabase-config.js`. A Supabase publishable key is intentionally safe for browser use; never place a secret or service-role key in this repository or in the browser.

## Create the first staff account

1. In Supabase Authentication, create a user with the staff member's real school email and a temporary password.
2. Run the promotion query in [`supabase/README.md`](supabase/README.md), replacing the example email.
3. Sign in at `/staff.html`.

Only users with an active row in `public.staff_profiles` can read orders, handle assistance requests, confirm payments, issue receipts, or update inventory.

## Checkout and payment behavior

Placing an order rechecks and reserves stock in one database transaction. Cash and GCash remain `PENDING` until staff confirms payment. A receipt record is created after confirmation. UNIVUE never collects a card number, CVV, GCash PIN, or OTP.

To show the school's official GCash QR, set `gcashQrImageUrl` in `supabase-config.js` to an approved school-controlled image URL. It is deliberately blank by default so the prototype never displays an invented payment destination.

## Assistance button and Raspberry Pi

The on-screen **Need help?** button creates a realtime assistance request. The service in `hardware/pi/` sends the same request when the physical GPIO button is pressed and can drive the three status LEDs, buzzer, and optional receipt printer. Staff can acknowledge and resolve the request in `/staff.html`; the student kiosk displays the updated status.

GPIO on the Raspberry Pi is 3.3 V only. Use the correct resistor, driver, and power arrangement for LEDs, speakers, buzzers, and printers. Hardware behavior must be validated on the actual device before claiming the physical prototype is complete.

## GitHub Pages

Every push to `main` runs the test suite, builds the static frontend, and publishes it with GitHub Actions. The public URL is:

<https://jester-penlza.github.io/Gr12-NUB/>

The public kiosk and staff page both use the live Supabase database. Staff-only operations still require an authorized Supabase account.
