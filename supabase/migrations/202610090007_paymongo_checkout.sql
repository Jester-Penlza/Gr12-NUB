-- Add secure, server-managed PayMongo checkout state.

alter table public.orders
  add column if not exists payment_access_token uuid not null default gen_random_uuid();

alter table public.payments
  add column if not exists provider text,
  add column if not exists provider_session_id text,
  add column if not exists provider_payment_id text,
  add column if not exists checkout_url text,
  add column if not exists provider_session_created_at timestamptz;

create unique index if not exists payments_provider_session_id_key
  on public.payments(provider_session_id)
  where provider_session_id is not null;

create unique index if not exists payments_provider_payment_id_key
  on public.payments(provider_payment_id)
  where provider_payment_id is not null;

create or replace function public.place_order(
  p_kiosk_code text,
  p_customer jsonb,
  p_items jsonb,
  p_fulfillment text,
  p_payment_method text,
  p_notes text default ''
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_kiosk_id uuid;
  v_order_id uuid;
  v_access_token uuid;
  v_reference text;
  v_item jsonb;
  v_product public.products%rowtype;
  v_code text;
  v_size text;
  v_quantity integer;
  v_total numeric(10, 2) := 0;
begin
  if jsonb_typeof(p_items) <> 'array' or jsonb_array_length(p_items) = 0 or jsonb_array_length(p_items) > 20 then
    raise exception 'INVALID_ITEMS';
  end if;
  if p_fulfillment not in ('PICKUP', 'CAMPUS_DELIVERY') then raise exception 'INVALID_FULFILLMENT'; end if;
  if p_payment_method not in ('CASH', 'GCASH') then raise exception 'INVALID_PAYMENT_METHOD'; end if;
  if nullif(trim(p_customer->>'customerName'), '') is null
    or nullif(trim(p_customer->>'studentId'), '') is null
    or nullif(trim(p_customer->>'collegeDepartment'), '') is null
    or nullif(trim(p_customer->>'contactNumber'), '') is null then
    raise exception 'MISSING_CUSTOMER_DETAILS';
  end if;

  select id into v_kiosk_id from public.kiosks where code = p_kiosk_code and active;
  if v_kiosk_id is null then raise exception 'UNKNOWN_KIOSK'; end if;

  v_reference := 'UNIVUE-' || to_char(clock_timestamp(), 'YYMMDD') || '-' || upper(substr(md5(random()::text || clock_timestamp()::text), 1, 6));
  insert into public.orders(reference, kiosk_id, customer_name, student_id, college_department, contact_number, fulfillment, notes, payment_method)
  values (
    v_reference, v_kiosk_id,
    left(trim(p_customer->>'customerName'), 120),
    left(trim(p_customer->>'studentId'), 60),
    left(trim(p_customer->>'collegeDepartment'), 120),
    left(trim(p_customer->>'contactNumber'), 40),
    p_fulfillment,
    left(coalesce(p_notes, ''), 500),
    p_payment_method
  ) returning id, payment_access_token into v_order_id, v_access_token;

  for v_item in select value from jsonb_array_elements(p_items)
  loop
    v_code := v_item->>'item';
    v_size := upper(v_item->>'size');
    begin
      v_quantity := (v_item->>'quantity')::integer;
    exception when others then
      raise exception 'INVALID_QUANTITY';
    end;
    if v_quantity < 1 or v_quantity > 30 or v_size not in ('XS','S','M','L','XL','XXL') then
      raise exception 'INVALID_ORDER_ITEM';
    end if;

    select * into v_product from public.products where code = v_code and active;
    if not found then raise exception 'UNKNOWN_PRODUCT:%', v_code; end if;

    update public.inventory
    set quantity = quantity - v_quantity, updated_at = now()
    where product_code = v_code and size = v_size and quantity >= v_quantity;
    if not found then raise exception 'INSUFFICIENT_STOCK:%:%', v_code, v_size; end if;

    insert into public.order_items(order_id, product_code, size, quantity, unit_price)
    values (v_order_id, v_code, v_size, v_quantity, v_product.price);
    v_total := v_total + (v_product.price * v_quantity);
  end loop;

  update public.orders set subtotal = v_total, total = v_total where id = v_order_id;
  insert into public.payments(order_id, method, amount) values (v_order_id, p_payment_method, v_total);

  return jsonb_build_object(
    'id', v_order_id,
    'reference', v_reference,
    'accessToken', v_access_token,
    'total', v_total,
    'status', 'AWAITING_PAYMENT',
    'paymentStatus', 'PENDING'
  );
end;
$$;

create or replace function public.attach_paymongo_checkout(
  p_order_id uuid,
  p_session_id text,
  p_checkout_url text
)
returns jsonb
language plpgsql
security definer
set search_path = public, auth
as $$
declare
  v_payment public.payments%rowtype;
begin
  if auth.role() <> 'service_role' then raise exception 'UNAUTHORIZED'; end if;

  select p.* into v_payment
  from public.payments p
  join public.orders o on o.id = p.order_id
  where p.order_id = p_order_id
    and p.method = 'GCASH'
    and o.status = 'AWAITING_PAYMENT'
  for update of p;

  if not found then raise exception 'ORDER_NOT_AVAILABLE_FOR_ONLINE_PAYMENT'; end if;
  if v_payment.provider_session_id is not null and v_payment.provider_session_id <> p_session_id then
    raise exception 'PAYMENT_SESSION_ALREADY_ATTACHED';
  end if;

  update public.payments
  set provider = 'PAYMONGO',
      provider_session_id = left(p_session_id, 120),
      checkout_url = left(p_checkout_url, 1000),
      provider_session_created_at = coalesce(provider_session_created_at, now()),
      updated_at = now()
  where order_id = p_order_id;

  return jsonb_build_object('attached', true, 'sessionId', p_session_id);
end;
$$;

create or replace function public.confirm_paymongo_payment(
  p_order_reference text,
  p_session_id text,
  p_payment_id text,
  p_amount_centavos integer
)
returns jsonb
language plpgsql
security definer
set search_path = public, auth
as $$
declare
  v_order public.orders%rowtype;
  v_payment public.payments%rowtype;
  v_receipt_number text;
begin
  if auth.role() <> 'service_role' then raise exception 'UNAUTHORIZED'; end if;

  select * into v_order from public.orders where reference = p_order_reference for update;
  if not found then raise exception 'ORDER_NOT_FOUND'; end if;
  if v_order.payment_method <> 'GCASH' then raise exception 'INVALID_PAYMENT_METHOD'; end if;
  if v_order.status = 'CANCELLED' then raise exception 'ORDER_CANCELLED'; end if;

  select * into v_payment from public.payments where order_id = v_order.id for update;
  if v_payment.provider <> 'PAYMONGO' or v_payment.provider_session_id is distinct from p_session_id then
    raise exception 'PAYMENT_SESSION_MISMATCH';
  end if;
  if round(v_payment.amount * 100)::integer <> p_amount_centavos then
    raise exception 'PAYMENT_AMOUNT_MISMATCH';
  end if;

  update public.payments
  set status = 'CONFIRMED',
      provider_reference = left(p_payment_id, 120),
      provider_payment_id = left(p_payment_id, 120),
      confirmed_at = coalesce(confirmed_at, now()),
      confirmed_by = null,
      updated_at = now()
  where order_id = v_order.id;

  update public.orders
  set status = case when status = 'AWAITING_PAYMENT' then 'PAID' else status end,
      updated_at = now()
  where id = v_order.id;

  v_receipt_number := 'UNIVUE-' || regexp_replace(v_order.reference, '^UNIVUE-', '');
  insert into public.receipts(order_id, receipt_number)
  values (v_order.id, v_receipt_number)
  on conflict (order_id) do update set receipt_number = excluded.receipt_number;

  return jsonb_build_object(
    'orderId', v_order.id,
    'receiptNumber', v_receipt_number,
    'status', 'CONFIRMED'
  );
end;
$$;

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
  if v_order.payment_method <> 'CASH' then raise exception 'ONLINE_PAYMENT_REQUIRES_PAYMONGO_CONFIRMATION'; end if;

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

revoke all on function public.attach_paymongo_checkout(uuid, text, text) from public, anon, authenticated;
revoke all on function public.confirm_paymongo_payment(text, text, text, integer) from public, anon, authenticated;
grant execute on function public.attach_paymongo_checkout(uuid, text, text) to service_role;
grant execute on function public.confirm_paymongo_payment(text, text, text, integer) to service_role;

revoke all on function public.staff_confirm_payment(uuid, text) from public, anon;
grant execute on function public.staff_confirm_payment(uuid, text) to authenticated;
