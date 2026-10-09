-- An order cannot enter fulfilment until staff has confirmed its payment.

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

  select status into v_payment_status from public.payments where order_id = p_order_id for update;

  if p_status in ('PAID', 'PREPARING', 'READY', 'COMPLETED') and v_payment_status is distinct from 'CONFIRMED' then
    raise exception 'CONFIRM_PAYMENT_FIRST';
  end if;

  if p_status = 'AWAITING_PAYMENT' and v_payment_status = 'CONFIRMED' then
    raise exception 'CONFIRMED_PAYMENT_CANNOT_BE_REVERSED';
  end if;

  if p_status = 'CANCELLED' and v_order.status <> 'CANCELLED' then
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

revoke all on function public.staff_set_order_status(uuid, text) from public, anon;
grant execute on function public.staff_set_order_status(uuid, text) to authenticated;
