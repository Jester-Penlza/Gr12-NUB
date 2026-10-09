-- Keep payment confirmation, receipts, status changes, and stock restoration atomic.

create or replace function public.staff_confirm_payment(
  p_order_id uuid,
  p_provider_reference text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public, private, auth
as $$
declare
  v_order public.orders%rowtype;
  v_receipt_number text;
begin
  if not private.is_staff() then raise exception 'UNAUTHORIZED'; end if;

  select * into v_order from public.orders where id = p_order_id for update;
  if not found then raise exception 'ORDER_NOT_FOUND'; end if;
  if v_order.status = 'CANCELLED' then raise exception 'ORDER_CANCELLED'; end if;

  update public.payments
  set status = 'CONFIRMED',
      provider_reference = nullif(left(coalesce(p_provider_reference, ''), 120), ''),
      confirmed_at = coalesce(confirmed_at, now()),
      confirmed_by = auth.uid(),
      updated_at = now()
  where order_id = p_order_id;

  update public.orders
  set status = case when status = 'AWAITING_PAYMENT' then 'PAID' else status end,
      updated_at = now()
  where id = p_order_id;

  v_receipt_number := 'UNIVUE-' || regexp_replace(v_order.reference, '^UNIVUE-', '');
  insert into public.receipts(order_id, receipt_number)
  values (p_order_id, v_receipt_number)
  on conflict (order_id) do update set receipt_number = excluded.receipt_number;

  return jsonb_build_object(
    'receiptNumber', v_receipt_number,
    'confirmedAt', now(),
    'status', 'CONFIRMED'
  );
end;
$$;

create or replace function public.staff_set_order_status(p_order_id uuid, p_status text)
returns jsonb
language plpgsql
security definer
set search_path = public, private, auth
as $$
declare
  v_order public.orders%rowtype;
  v_payment_status text;
  v_line record;
begin
  if not private.is_staff() then raise exception 'UNAUTHORIZED'; end if;
  if p_status not in ('AWAITING_PAYMENT', 'PAID', 'PREPARING', 'READY', 'COMPLETED', 'CANCELLED') then
    raise exception 'INVALID_ORDER_STATUS';
  end if;

  select * into v_order from public.orders where id = p_order_id for update;
  if not found then raise exception 'ORDER_NOT_FOUND'; end if;
  if v_order.status = 'CANCELLED' and p_status <> 'CANCELLED' then raise exception 'CANCELLED_ORDER_IS_FINAL'; end if;

  if p_status = 'CANCELLED' and v_order.status <> 'CANCELLED' then
    select status into v_payment_status from public.payments where order_id = p_order_id for update;
    if v_payment_status = 'CONFIRMED' then raise exception 'PAID_ORDER_REQUIRES_REFUND'; end if;
    for v_line in select product_code, size, quantity from public.order_items where order_id = p_order_id
    loop
      update public.inventory
      set quantity = least(30, quantity + v_line.quantity), updated_at = now()
      where product_code = v_line.product_code and size = v_line.size;
    end loop;
    update public.payments set status = 'CANCELLED', updated_at = now() where order_id = p_order_id;
  end if;

  update public.orders set status = p_status, updated_at = now() where id = p_order_id;
  return jsonb_build_object('id', p_order_id, 'status', p_status);
end;
$$;

revoke update on public.orders, public.payments from authenticated;
revoke insert, update on public.receipts from authenticated;
drop policy if exists orders_staff_update on public.orders;
drop policy if exists payments_staff_update on public.payments;
drop policy if exists receipts_staff_insert on public.receipts;
drop policy if exists receipts_staff_update on public.receipts;

revoke all on function public.staff_confirm_payment(uuid, text) from public, anon;
revoke all on function public.staff_set_order_status(uuid, text) from public, anon;
grant execute on function public.staff_confirm_payment(uuid, text) to authenticated;
grant execute on function public.staff_set_order_status(uuid, text) to authenticated;
