-- Keep anonymous catalog reads independent from the private staff helper.

drop policy if exists products_public_read on public.products;
create policy products_public_read on public.products for select to anon, authenticated using (active);

drop policy if exists kiosks_public_read on public.kiosks;
create policy kiosks_public_read on public.kiosks for select to anon, authenticated using (active);
