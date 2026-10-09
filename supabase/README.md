# UNIVUE Supabase setup

The live database is managed through versioned SQL migrations in `supabase/migrations/`.

The first migration creates the product catalog, 36 size-level inventory records, orders, payments, receipts, assistance requests, staff profiles, kiosk records, and inquiry logs. Every product and size starts at 10 units, with a hard database limit of 30.

Public kiosk actions use restricted database functions. Staff actions require a Supabase Auth user whose UUID is present in `public.staff_profiles`. Never place a service-role key in the website or Raspberry Pi browser.

After creating a staff user in Supabase Authentication, promote that account with:

```sql
insert into public.staff_profiles (user_id, full_name, role)
select id, 'UNIVUE Administrator', 'ADMIN'
from auth.users
where email = 'replace-with-your-staff-email@example.com';
```
