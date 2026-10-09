-- UNIVUE hardening and index pass after Supabase advisor review.

alter function public.set_updated_at() set search_path = public;

create schema if not exists private;
revoke all on schema private from public, anon, authenticated;

create or replace function private.is_staff()
returns boolean
language sql
stable
security definer
set search_path = public, auth
as $$
  select exists (
    select 1 from public.staff_profiles
    where user_id = (select auth.uid()) and active
  );
$$;

grant usage on schema private to authenticated;
grant execute on function private.is_staff() to authenticated;

drop policy if exists products_public_read on public.products;
drop policy if exists kiosks_public_read on public.kiosks;
drop policy if exists inventory_public_read on public.inventory;
drop policy if exists staff_profiles_self_read on public.staff_profiles;
drop policy if exists products_staff_all on public.products;
drop policy if exists kiosks_staff_all on public.kiosks;
drop policy if exists staff_profiles_staff_all on public.staff_profiles;
drop policy if exists inventory_staff_all on public.inventory;
drop policy if exists orders_staff_read on public.orders;
drop policy if exists orders_staff_update on public.orders;
drop policy if exists order_items_staff_read on public.order_items;
drop policy if exists payments_staff_read on public.payments;
drop policy if exists payments_staff_update on public.payments;
drop policy if exists receipts_staff_all on public.receipts;
drop policy if exists assistance_staff_read on public.assistance_requests;
drop policy if exists assistance_staff_update on public.assistance_requests;
drop policy if exists inquiry_logs_staff_read on public.inquiry_logs;

create policy products_public_read on public.products for select to anon, authenticated
using (active or private.is_staff());
create policy products_staff_insert on public.products for insert to authenticated
with check (private.is_staff());
create policy products_staff_update on public.products for update to authenticated
using (private.is_staff()) with check (private.is_staff());
create policy products_staff_delete on public.products for delete to authenticated
using (private.is_staff());

create policy kiosks_public_read on public.kiosks for select to anon, authenticated
using (active or private.is_staff());
create policy kiosks_staff_insert on public.kiosks for insert to authenticated
with check (private.is_staff());
create policy kiosks_staff_update on public.kiosks for update to authenticated
using (private.is_staff()) with check (private.is_staff());
create policy kiosks_staff_delete on public.kiosks for delete to authenticated
using (private.is_staff());

create policy inventory_public_read on public.inventory for select to anon, authenticated using (true);
create policy inventory_staff_insert on public.inventory for insert to authenticated
with check (private.is_staff());
create policy inventory_staff_update on public.inventory for update to authenticated
using (private.is_staff()) with check (private.is_staff());
create policy inventory_staff_delete on public.inventory for delete to authenticated
using (private.is_staff());

create policy staff_profiles_read on public.staff_profiles for select to authenticated
using (user_id = (select auth.uid()) or private.is_staff());
create policy staff_profiles_staff_insert on public.staff_profiles for insert to authenticated
with check (private.is_staff());
create policy staff_profiles_staff_update on public.staff_profiles for update to authenticated
using (private.is_staff()) with check (private.is_staff());
create policy staff_profiles_staff_delete on public.staff_profiles for delete to authenticated
using (private.is_staff());

create policy orders_staff_read on public.orders for select to authenticated using (private.is_staff());
create policy orders_staff_update on public.orders for update to authenticated
using (private.is_staff()) with check (private.is_staff());
create policy order_items_staff_read on public.order_items for select to authenticated using (private.is_staff());
create policy payments_staff_read on public.payments for select to authenticated using (private.is_staff());
create policy payments_staff_update on public.payments for update to authenticated
using (private.is_staff()) with check (private.is_staff());
create policy receipts_staff_select on public.receipts for select to authenticated using (private.is_staff());
create policy receipts_staff_insert on public.receipts for insert to authenticated with check (private.is_staff());
create policy receipts_staff_update on public.receipts for update to authenticated
using (private.is_staff()) with check (private.is_staff());
create policy assistance_staff_read on public.assistance_requests for select to authenticated using (private.is_staff());
create policy assistance_staff_update on public.assistance_requests for update to authenticated
using (private.is_staff()) with check (private.is_staff());
create policy inquiry_logs_staff_read on public.inquiry_logs for select to authenticated using (private.is_staff());

revoke all on function public.is_staff() from public, anon, authenticated;

create index if not exists assistance_requests_handled_by_idx on public.assistance_requests(handled_by);
create index if not exists assistance_requests_kiosk_id_idx on public.assistance_requests(kiosk_id);
create index if not exists assistance_requests_product_code_idx on public.assistance_requests(product_code);
create index if not exists inquiry_logs_kiosk_id_idx on public.inquiry_logs(kiosk_id);
create index if not exists inquiry_logs_product_code_idx on public.inquiry_logs(product_code);
create index if not exists inventory_updated_by_idx on public.inventory(updated_by);
create index if not exists order_items_order_id_idx on public.order_items(order_id);
create index if not exists order_items_product_code_idx on public.order_items(product_code);
create index if not exists orders_kiosk_id_idx on public.orders(kiosk_id);
create index if not exists payments_confirmed_by_idx on public.payments(confirmed_by);
