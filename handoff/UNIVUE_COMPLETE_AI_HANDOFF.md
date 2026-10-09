# UNIVUE Complete AI Project Handoff

Last updated 10 October 2026 in Asia Manila time

This document is the current transfer reference for the UNIVUE school merchandise kiosk. Give this file and the repository to a new AI account, developer, group member, or adviser before asking them to continue the system. It records the implemented architecture, behavior, design rules, deployment process, credentials policy, hardware plan, known limitations, and safe next steps.

The current system is a web kiosk and staff workspace backed by Supabase. A Raspberry Pi is the recommended kiosk computer and hardware controller. Older Arduino and ESP32 documents remain in the repository for historical reference and tests, but they do not describe the current deployed architecture.

## Immediate transfer instructions

1. Open this repository at `C:\Users\Acer\Desktop\CUTTE KIOSK` or clone `https://github.com/Jester-Penlza/Gr12-NUB.git`.
2. Read this file, then read `README.md` and `supabase/README.md`.
3. Run `git status --short` and `git log -5 --oneline` before changing anything.
4. When `graphify-out/graph.json` exists, run `graphify query "your question"` before broad code browsing.
5. Run `npm.cmd test` before and after a code change.
6. Edit the source in `firmware/esp32/cutte_kiosk_bridge/data`. Do not edit `dist` directly because the Pages build recreates it.
7. Apply new database DDL as a new migration in `supabase/migrations` and through the authenticated Supabase project tools.
8. Never paste PayMongo secret keys, Supabase service-role keys, staff passwords, or webhook secrets into the repository, browser code, issue tracker, or AI handoff.
9. Preserve the UNIVUE name, NU Baliwag and Bulldogs Exchange identity, NU shield, product photographs, shirt artwork, colors, and current product branding unless the user explicitly authorizes a rebrand.
10. Do not claim physical hardware is complete until the exact Raspberry Pi, GPIO wiring, buzzer, button, LEDs, touchscreen, and printer are tested on the real device.

## Project identity and purpose

UNIVUE means Uniform View. It is an NU Baliwag Bulldogs Exchange kiosk that lets students and employees browse official uniforms and merchandise, check live stock for a selected size, add available items to a cart, submit an order, use a classroom PayMongo QR simulation, and request staff assistance. Authorized staff use a separate interface for assistance calls, orders, payments, fulfillment, receipts, and inventory.

The central purpose is accurate size-level stock visibility and staff-supported ordering. It is more than a stock viewer because it includes a cart, checkout, stock reservation, payment state, receipts, order fulfillment, staff notifications, and hardware integration. It is still a school prototype, not a production commerce platform.

## Current online services

| Service | Current value | Purpose |
| --- | --- | --- |
| GitHub repository | `https://github.com/Jester-Penlza/Gr12-NUB` | Version control and GitHub Actions |
| Student kiosk | `https://jester-penlza.github.io/Gr12-NUB/` | Public student and employee interface |
| Staff workspace | `https://jester-penlza.github.io/Gr12-NUB/staff.html` | Supabase authenticated operations |
| Supabase project reference | `scvwqyoyzosgavegjwhh` | Database Auth Realtime Vault and Edge Functions |
| Supabase URL | `https://scvwqyoyzosgavegjwhh.supabase.co` | Browser and Raspberry Pi API endpoint |
| Kiosk code | `UNIVUE-01` | Identifies the primary kiosk |
| Application baseline before this handoff | `bb94633` | Safe order history archive controls |

Always verify the newest commit and deployment instead of assuming the baseline above is still current.

## Fixed product and stock rules

The catalog contains six products and six sizes. The database seeds every product and size combination at 10 units, giving 36 inventory rows. Live quantities may now differ because staff updates and placed orders change them.

| Product code | Display name | Group | Price |
| --- | --- | --- | ---: |
| `MALE_POLO` | Male Polo | Male formal | PHP 450 |
| `FEMALE_BLOUSE` | Female Blouse | Female formal | PHP 450 |
| `MALE_PANTS` | Male Pants | Male formal | PHP 500 |
| `FEMALE_SKIRT` | Female Skirt | Female formal | PHP 480 |
| `T_SHIRT` | School T Shirt Unisex | Unisex | PHP 250 |
| `PE_UNIFORM` | PE Uniform Unisex | Unisex | PHP 550 |

Sizes are `XS`, `S`, `M`, `L`, `XL`, and `XXL`.

Stock rules are enforced in both the interface and database:

- Available is 4 to 30 units.
- Low stock is 1 to 3 units.
- Out of stock is 0 units.
- The maximum is 30 units for each product and size.
- A stock check is read only and does not reserve or reduce inventory.
- Adding to the browser cart does not reserve inventory.
- Placing an order performs a final database check and atomically reserves the ordered quantities.
- Cancelling an unpaid order restores its reserved stock.
- A paid order cannot be cancelled through the current workflow without a separate refund process.

The student interface can show or hide the numeric stock quantities. The physical green, yellow, and red LEDs represent the selected stock result on the Raspberry Pi. The frontend must use readable text and quantities; it must not pretend that an on-screen colored light is the physical LED.

## Current architecture

```text
Student touchscreen browser on Raspberry Pi or another device
        | HTTPS
        v
GitHub Pages frontend ---- Supabase database Auth and Realtime
        |                         |
        |                         +---- Staff browser workspace
        |                         |
        |                         +---- PayMongo Edge Functions and webhook
        |
        +---- local HTTP only when page is hosted on the same Pi
                       |
                       v
             Raspberry Pi hardware service
             button LEDs buzzer and USB printer

Physical assistance button on Pi ---- restricted Supabase RPC ---- staff Realtime queue
```

The deployed website does not run on the ESP32. A Raspberry Pi with Chromium is the recommended 14 inch touchscreen host because it can render the complete HTML CSS JavaScript interface and run the local Python hardware service. The Pi and staff device require internet access for live Supabase operations.

The frontend is static. GitHub Pages serves the files, while Supabase performs persistent data, authentication, authorization, transactional stock reservation, Realtime events, and payment integration.

## User interfaces

### Student kiosk

The student interface is `index.html`, `styles.css`, and `app.js`. The normal flow is:

1. Home and product collection
2. Category selection
3. Male or female selection for formal uniforms
4. Product selection
5. Size selection with six live size quantities
6. Read only stock verification
7. Add to cart
8. Cart quantity adjustment or removal
9. Checkout details
10. Cash or PayMongo test QR selection
11. Order creation and stock reservation
12. Order reference and optional PayMongo test QR display

Checkout collects a full name, student or employee ID, college or department, contact number, pickup or campus delivery choice, and optional office notes. It never collects a card number, CVV, wallet PIN, or OTP.

The `Need help` button creates an assistance request and shows its progress. The `Staff` button opens `staff.html` whenever the live database client is available. In offline or local demo mode, the older prototype inventory interface remains accessible.

### Staff workspace

The staff workspace is `staff.html`, `staff.css`, and `staff.js`. Supabase Auth verifies the email and password, and the application then requires an active row in `public.staff_profiles`.

The workspace contains:

- Dashboard metrics for pending assistance, awaiting payment, low or empty stock, and database status.
- Assistance queue with acknowledge and resolve actions.
- Optional browser two-tone alert, toast, and vibration for new Realtime assistance requests.
- Recent orders with payment confirmation and fulfillment status changes.
- A per-order X control for cancelled or completed orders.
- A Clear closed history control for all cancelled and completed orders.
- Inventory replacement updates from 0 to 30 for every product and size.

Order cleanup is an archive operation. It sets `archived_at` and `archived_by`; it does not delete order, payment, item, or receipt records. Active orders cannot be archived. There is currently no archived-order viewer or restore button in the staff interface.

## Branding and design rules

The visual direction was inspired by the merchandise layout and checkout ideas in `websites-master`, but UNIVUE is not a copy of that site's brand. The current identity must remain:

- Product name is UNIVUE.
- School identity is NU Baliwag.
- Store identity is Bulldogs Exchange.
- Use the existing NU shield and current uniform photographs.
- Do not change logos or artwork printed on the shirts and uniforms.
- Keep the established navy, royal blue, white, and gold visual language.
- Keep layouts responsive for a large touchscreen, laptop, and phone.
- Keep visible focus states, accessible labels, status text, and live regions.
- Do not remove the cart, checkout, staff portal, assistance control, or live stock functions for cosmetic redesigns.

Current brand assets are under `firmware/esp32/cutte_kiosk_bridge/data/images`. `websites-master` is a design reference only and is not copied into the GitHub Pages build.

## Database design

Supabase PostgreSQL is the source of truth. Row Level Security is enabled on all public tables.

| Table | Purpose | Public or staff access |
| --- | --- | --- |
| `products` | Six merchandise records and image paths | Public active catalog read staff management |
| `kiosks` | Kiosk code display name and location | Public active kiosk read staff management |
| `staff_profiles` | Maps Supabase users to STAFF or ADMIN | Authenticated and staff protected |
| `inventory` | Quantity for each product and size | Public read staff update |
| `orders` | Customer fulfillment totals status and archive metadata | Staff read protected RPC writes |
| `order_items` | Product size quantity and price lines | Staff read protected order creation |
| `payments` | Method amount provider state QR metadata and confirmation | Staff read protected workflows |
| `receipts` | One receipt number per confirmed order | Staff read protected workflows |
| `assistance_requests` | Help request context and status | Restricted public RPC staff queue |
| `inquiry_logs` | Stock query result timing and status | Staff read restricted RPC writes |

The public kiosk uses narrowly scoped RPC functions rather than direct writes. Important functions include:

| Function | Caller | Purpose |
| --- | --- | --- |
| `inventory_overview` | Public kiosk | Read all six sizes for one product |
| `check_inventory` | Public kiosk | Check one product and size |
| `record_inquiry` | Public kiosk | Record a bounded inquiry log |
| `place_order` | Public kiosk | Validate cart reserve stock create order and pending payment |
| `request_assistance` | Browser or Pi | Create one assistance request and access token |
| `assistance_status` | Request owner | Read the status with ID and access token |
| `staff_confirm_payment` | Authorized staff | Confirm cash payment create receipt and mark order paid |
| `staff_set_order_status` | Authorized staff | Enforce the order state workflow and safe cancellation |
| `staff_archive_order` | Authorized staff | Archive one cancelled or completed order |
| `staff_archive_closed_orders` | Authorized staff | Archive all visible cancelled and completed orders |
| `get_payment_server_secrets` | Service role only | Let Edge Functions read encrypted payment secrets |
| `attach_paymongo_qr` | Service role only | Store PayMongo intent method QR and expiry metadata |
| `confirm_paymongo_payment` | Service role only | Confirm a signed PayMongo payment and create the receipt |

Realtime publishes changes from `assistance_requests`, `orders`, `payments`, and `inventory`. The staff client subscribes to these tables and also refreshes periodically.

## Order and payment state

Normal paid order progression is:

```text
AWAITING_PAYMENT -> PAID -> PREPARING -> READY -> COMPLETED
```

An unpaid order may change from `AWAITING_PAYMENT` to `CANCELLED`. Cancellation restores reserved inventory and marks its payment cancelled. A confirmed payment cannot be cancelled by the status function because a refund workflow does not yet exist.

Cash flow:

1. `place_order` reserves inventory and creates a pending cash payment.
2. Staff selects Confirm payment.
3. `staff_confirm_payment` confirms the payment and creates a receipt in one database transaction.
4. The staff browser tries `POST /hardware/print-receipt` if a local hardware base URL is configured.
5. Staff progresses the order through preparation, ready, and completed.

PayMongo classroom simulation flow:

1. `place_order` reserves stock and creates the order.
2. The authenticated Edge Function creates a PayMongo test Payment Intent and QR Ph payment method for the exact total.
3. The Edge Function attaches the method and stores the returned short-lived QR image and expiry.
4. The browser displays the actual PayMongo generated test QR inside the order success screen.
5. PayMongo calls the webhook after a simulated payment event.
6. The webhook verifies the raw-body HMAC signature before it calls the service-role confirmation RPC.
7. The database marks the payment confirmed, marks the order paid, and creates the receipt.

Only test secret keys are accepted by the current checkout function. No real money should be collected. Do not switch to live keys until the school approves the merchant account, PayMongo onboarding is complete, the live webhook is registered, and the full payment and refund process is designed and tested.

## Staff authentication and credentials

The demonstration staff email is `staff@school.edu.ph`. The password is intentionally excluded from this handoff and from GitHub. A user taking over the project should reset or confirm the password in Supabase Dashboard under Authentication and Users, then make sure the user's UUID has an active `staff_profiles` row.

To promote a user after creating it in Supabase Auth:

```sql
insert into public.staff_profiles (user_id, full_name, role)
select id, 'UNIVUE Administrator', 'ADMIN'
from auth.users
where email = 'replace-with-the-authorized-email@example.com';
```

The offline simulator has a public demonstration PIN of `2468`. It is not used by the live Supabase staff page and must never be described as production authentication.

## PayMongo and secret handling

The repository contains only the Supabase browser publishable key. A publishable key is expected in browser code because database policies enforce authorization. Never place any of the following in the repository or handoff:

- Supabase service-role key
- PayMongo `sk_test` or `sk_live` key
- PayMongo webhook signing secret
- Staff password
- GitHub personal access token
- Supabase database password

PayMongo test secrets are stored in Supabase Vault and read only by service-role Edge Functions. A previously created desktop file named `api.txt` is outside the repository and may contain private keys. Do not copy it, quote it, commit it, or upload it. Rotate a key if it may have been exposed.

The checkout function allows the production GitHub Pages origin and expected localhost development origins. If the site moves to a new domain, update and redeploy its origin allowlist.

## Raspberry Pi hardware behavior

The recommended hardware is one Raspberry Pi capable of running Chromium and Python. The local service is `hardware/pi/univue_hardware_service.py`. It binds only to `127.0.0.1:8787`.

Default BCM pins are:

| Hardware | BCM pin | Behavior |
| --- | ---: | --- |
| Assistance button | 17 | Button to ground with internal pull up and debounce |
| Available LED | 22 | Turns on for 4 to 30 units |
| Low stock LED | 27 | Turns on for 1 to 3 units |
| Out of stock LED | 24 | Turns on for 0 units |
| Active buzzer | 23 | Short local chirp after a physical help press |

Raspberry Pi GPIO is 3.3 V only. Use LED resistors and a transistor or correct driver when the buzzer or other load exceeds the pin current limit. Do not connect a raw loudspeaker or thermal printer directly to GPIO.

### Physical assistance button

The Pi button works even when the kiosk opens the GitHub Pages site. The Python service chirps the local buzzer and directly calls the restricted Supabase `request_assistance` RPC. Staff receive the new row through Realtime. The staff page shows a toast, can vibrate a supported device, and plays a two-tone browser alert after staff enables sound.

Browser autoplay rules require a user gesture before audio. Staff should click Enable alert sound after signing in. If the button request reaches the queue but no sound plays, this is the first setting to check.

### Stock LEDs

The local kiosk browser posts the selected stock result to `/hardware/indicator`. The Python service turns on one LED and turns the other two off. The deployed HTTPS page does not call the unsecured loopback endpoint; to demonstrate LEDs, host the kiosk locally on the Pi.

### Thermal printer

The current printer trigger occurs when staff confirm a cash payment. The page posts the receipt to `/hardware/print-receipt`, and the service uses an optional USB ESC POS printer. Set `UNIVUE_PRINTER_USB_VENDOR` and `UNIVUE_PRINTER_USB_PRODUCT` to its hexadecimal USB IDs. Without them, the service reports simulation mode and does not claim a physical print.

Printing works only when the staff page and hardware service run locally on the same Pi. A staff computer using the public GitHub Pages page cannot securely reach the Pi loopback address. The correct future solution is a Supabase print-job queue claimed by the Pi with a device-specific credential. Do not expose port 8787 to the internet.

## Local setup and commands

Node.js 20 or newer is required.

```powershell
git clone https://github.com/Jester-Penlza/Gr12-NUB.git
Set-Location Gr12-NUB
npm.cmd test
npm.cmd run preview:pages
```

Open `http://127.0.0.1:4173/` for the Pages preview and `http://127.0.0.1:4173/staff.html` for staff.

The local simulator can be started with:

```powershell
npm.cmd start
```

It normally serves the kiosk at `http://127.0.0.1:8080` and enables the local hardware base URL.

On Raspberry Pi OS:

```bash
python3 -m venv .venv
.venv/bin/pip install -r hardware/pi/requirements.txt
export UNIVUE_SUPABASE_PUBLISHABLE_KEY='the browser publishable key'
.venv/bin/python hardware/pi/univue_hardware_service.py
```

Optional Pi environment variables are `UNIVUE_SUPABASE_URL`, `UNIVUE_KIOSK_CODE`, `UNIVUE_ALLOWED_ORIGIN`, `UNIVUE_HARDWARE_PORT`, the five GPIO pin variables, and the two printer USB ID variables.

## Supabase access from a new Codex account

The new account must authenticate itself. Do not transfer an old access token.

```powershell
codex mcp add supabase --url "https://mcp.supabase.com/mcp?project_ref=scvwqyoyzosgavegjwhh&features=docs%2Caccount%2Cdatabase%2Cdebugging%2Cdevelopment%2Cfunctions%2Cbranching"
codex mcp login supabase
```

After login, verify that the project contains 11 migrations through `order_history_archive_index`, the two active Edge Functions `create-paymongo-checkout` and `paymongo-webhook`, and the ten RLS-enabled public tables listed above.

## Testing and verification

The normal verification command is:

```powershell
npm.cmd test
```

As of this handoff, 22 automated tests pass. They cover the simulator API, inventory model, web screens, checkout contract, Raspberry Pi service contract, legacy Arduino and ESP32 references, GitHub Pages build, staff alerts, safe history archiving, and PayMongo secret and webhook rules.

For every code change:

1. Run the relevant focused check while editing.
2. Run `npm.cmd test` before committing.
3. Run `graphify update .` after source changes.
4. Run `git diff --check` and inspect `git status --short`.
5. Scan changed browser files for secret-key prefixes.
6. Push `main` only after the working tree contains the intended files.
7. Wait for the Test and deploy GitHub Pages workflow to finish successfully.
8. Fetch the live files or hard refresh the browser to verify the new markers.

Do not treat a successful local build as proof that a Supabase migration, Edge Function, GitHub Pages deployment, or physical device is working. Verify each changed layer.

## Deployment process

Every push to `main` runs `.github/workflows/pages.yml`:

1. Check out the repository.
2. Install Node.js 20.
3. Run `npm test`.
4. Build `dist` from `firmware/esp32/cutte_kiosk_bridge/data`.
5. Rewrite root absolute asset paths to GitHub Pages relative paths.
6. Upload and deploy the `dist` artifact.

The build deletes and recreates `dist`. Make all frontend changes in the source data directory.

Database migrations and Edge Function deployments are separate from GitHub Pages. Committing a migration does not automatically apply it to Supabase. Apply it through the authenticated Supabase tool, confirm the schema, and run security and performance advisers.

## Key file map

| Path | Responsibility |
| --- | --- |
| `README.md` | Current short architecture and operating overview |
| `firmware/esp32/cutte_kiosk_bridge/data/index.html` | Student screens and checkout markup |
| `firmware/esp32/cutte_kiosk_bridge/data/styles.css` | Student and shared design |
| `firmware/esp32/cutte_kiosk_bridge/data/app.js` | Student state cart checkout stock and assistance logic |
| `firmware/esp32/cutte_kiosk_bridge/data/staff.html` | Staff login and dashboard markup |
| `firmware/esp32/cutte_kiosk_bridge/data/staff.css` | Staff workspace design |
| `firmware/esp32/cutte_kiosk_bridge/data/staff.js` | Staff Auth Realtime orders alerts archive and inventory logic |
| `firmware/esp32/cutte_kiosk_bridge/data/univue-data.js` | Supabase browser data access and local print request |
| `firmware/esp32/cutte_kiosk_bridge/data/supabase-config.js` | Public project URL key kiosk code and local hardware URL |
| `supabase/migrations` | Versioned schema RLS RPC and payment changes |
| `supabase/functions/create-paymongo-checkout` | Server-side PayMongo test QR creation |
| `supabase/functions/paymongo-webhook` | Signed payment confirmation webhook |
| `hardware/pi/univue_hardware_service.py` | GPIO help button LEDs buzzer and receipt bridge |
| `simulator/server.js` | Local demo and hardware endpoint simulator |
| `scripts/build-pages.js` | GitHub Pages build and path rewriting |
| `tests` | Automated contract and behavior checks |
| `.github/workflows/pages.yml` | Test and deploy workflow |
| `graphify-out/graph.json` | Queryable code knowledge graph |

## Legacy files and source of truth

Several files describe the original CUTTE Arduino Uno and ESP32 prototype. They are not the current architecture:

- `CUTTE_Kiosk_Master_Builder_Brief.md`
- `CUTTE_Kiosk_Complete_Build_and_Transfer_Manual.docx`
- `Arduino_Uniform_Stock_Kiosk_Formal_Beginner_Guide.docx`
- `Arduino_Uniform_Stock_Kiosk_System_Development_Guide.docx`
- Most files under `firmware/arduino`
- The ESP32 `.ino` bridge implementation

Those materials claim that there is no database, payment, cloud synchronization, or real staff account. That was true for the first prototype but is false for current UNIVUE. They also assign inventory ownership to Arduino EEPROM and webpage hosting to ESP32. Current UNIVUE uses Supabase as the source of truth, GitHub Pages for the public frontend, and Raspberry Pi for the recommended kiosk and hardware controller.

The current web source still lives under the legacy named `firmware/esp32/cutte_kiosk_bridge/data` directory. Do not assume that location means the deployed site runs on ESP32. Moving the directory would require coordinated updates to the simulator, build script, tests, and Pages workflow.

## Known limitations and unfinished work

- PayMongo is test mode only. It does not collect real money.
- Physical hardware has been exercised in software simulation, but final GPIO and printer acceptance must be done on the exact Raspberry Pi and components.
- The public HTTPS page cannot directly control the Pi loopback LEDs or printer.
- The thermal printer is triggered automatically only for local staff cash confirmation. PayMongo webhook confirmation creates a database receipt but does not remotely print it.
- There is no secure Supabase print-job queue or permanent device credential yet.
- Archived orders remain in the database but there is no archived-history screen or restore action.
- The staff snapshot loads the newest 50 orders and assistance records rather than using pagination.
- Browser alert sound must be enabled by staff after a user gesture.
- There is no barcode, RFID, weight sensor, or automatic physical stock counter. Inventory is a managed database count with transactional order reservation.
- There is no refund workflow for confirmed payments.
- Contact details and student IDs are prototype data. A real deployment needs school privacy approval, retention rules, and an operational owner.
- The static frontend can be copied by anyone. Security must continue to rely on RLS, restricted RPCs, verified webhooks, and server-side secrets.

## Troubleshooting guide

### Staff login works but dashboard is unauthorized

Confirm the Auth user has an active row in `public.staff_profiles` and that the UUID matches. Creating an Auth account alone is not enough.

### Items cannot be added to cart

Check that the selected size has at least one unit, the stock request completed, and the Supabase client initialized. A cart line cannot exceed the latest verified stock. Inspect the browser console and the `check_inventory` response.

### Order creation fails

The final reservation can fail even after a previous successful check if another order reduced stock. Verify customer fields, active products, inventory quantities, RLS and RPC availability, and network access.

### PayMongo QR does not appear

Confirm that the order uses GCASH, `create-paymongo-checkout` is active with JWT verification, the test key and webhook secret exist in Vault, the request origin is allowed, and PayMongo returned a QR Ph image. Do not paste the secret into browser JavaScript to fix this.

### Physical button does not notify staff

Check the Pi publishable key environment variable, internet access, kiosk code, service logs, Supabase RPC response, Realtime subscription, and staff session. Use the local test-assistance endpoint only during controlled testing and remove test records afterward if needed.

### Staff sees the request but hears no alert

Click Enable alert sound. Browser audio cannot start automatically before interaction. Also check device volume and notification settings.

### LEDs do not change

Use the locally hosted kiosk on the same Pi, verify `hardwareBaseUrl`, allowed origin, service port, BCM numbering, GPIO permissions, resistor wiring, and LED polarity. The public GitHub Pages origin intentionally does not use the unsecured loopback bridge.

### Receipt does not print

Confirm that the staff page is local to the Pi, payment method is cash, USB vendor and product IDs are set, the printer is ESC POS compatible, USB permissions are correct, and the hardware service reports `printed: true` rather than simulation mode.

### New frontend code is not visible online

Check the newest GitHub Actions run, confirm the deployed commit, then hard refresh with `Ctrl F5`. Verify `dist` was rebuilt from the source directory. Do not patch the old cached page or `dist` directly.

### History controls are missing or fail

Confirm migrations `order_history_archive` and `order_history_archive_index` are applied, the deployed `staff.js` calls both archive RPCs, and the account is authorized staff. The X appears only on `CANCELLED` and `COMPLETED` orders.

## Safe continuation rules for another AI

- Begin with read-only inspection and evidence.
- Preserve unrelated user edits in a dirty worktree.
- Use additive migrations. Do not reset the production database.
- Never delete orders to clean a demo. Use the archive functions.
- Do not confirm or cancel real-looking orders during interface testing unless the user authorizes the exact records.
- Use PayMongo test mode for demonstrations.
- Never expose a service-role key or payment secret to the browser.
- Keep staff-only actions behind Supabase Auth and `private.is_staff()` checks.
- Maintain atomic stock reservation and cancellation behavior.
- Keep public stock checks read only.
- Keep maximum stock at 30 unless the research specification and database constraints are intentionally revised together.
- Keep the physical LED as the hardware indicator while retaining text status on screen.
- Do not remove or replace the NU shield or product artwork.
- Validate responsive behavior and keyboard focus when changing the design.
- Run tests, update Graphify, deploy, and verify the live result before declaring completion.

## Recommended next development phases

1. Build and test the physical Raspberry Pi kiosk with the selected touchscreen, GPIO button, three LEDs, active buzzer, and supported USB thermal printer.
2. Add Raspberry Pi service installation, autostart, Chromium kiosk launch, and recovery instructions.
3. Add a device-authenticated Supabase print-job queue so remote staff payment confirmation can trigger the kiosk printer safely.
4. Add an archived-order viewer with restore support for administrators.
5. Add paginated staff history and operational filters.
6. Prepare a school privacy and data-retention plan before using real student data.
7. Consider live payments only after school approval, PayMongo merchant approval, refund design, webhook production testing, and financial reconciliation ownership.

## Presentation explanation

A short explanation for a defense or demonstration is:

> UNIVUE is an NU Baliwag uniform and merchandise kiosk. The frontend was built with HTML, CSS, and JavaScript and is deployed through GitHub Pages. Supabase provides the live database, staff authentication, secured database functions, and Realtime notifications. Students can check size-level stock, add products to a cart, submit an order, and generate a PayMongo test QR. Placing an order rechecks and reserves stock. Staff use a protected workspace to receive assistance calls, confirm payments, prepare orders, issue receipts, and update inventory. A Raspberry Pi runs the touchscreen and connects the physical assistance button, stock LEDs, buzzer, and optional thermal printer. The maximum stock per product and size is 30, with available, low-stock, and out-of-stock thresholds.

When asked about the main purpose, emphasize that UNIVUE reduces uncertainty before a student goes to the merchandise office and gives staff one interface for stock, orders, payments, and assistance.

## New AI startup prompt

The separate `UNIVUE_NEW_AI_START_PROMPT.txt` file contains a ready-to-paste takeover prompt. Attach this handoff file or give the new AI access to the repository, paste that prompt, and provide any new task after it confirms the current branch, working tree, tests, Supabase access, and live deployment.

## Handoff checklist

- Repository access works.
- GitHub authentication is performed with the new account rather than transferring a token.
- Supabase MCP access is authenticated with the new account.
- The new AI has read this handoff and the current README files.
- The new AI knows which older documents are legacy.
- Staff password and payment secrets were transferred only through an approved private method or reset.
- `npm.cmd test` passes.
- The live student and staff URLs open.
- The latest GitHub Pages action succeeds.
- Database migrations and Edge Functions match the repository.
- Real hardware status is described honestly.
