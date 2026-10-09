-- Store short-lived PayMongo QR Ph test artifacts without exposing server secrets.

alter table public.payments
  add column if not exists provider_payment_method_id text,
  add column if not exists provider_qr_image text,
  add column if not exists provider_expires_at timestamptz;

create or replace function public.attach_paymongo_qr(
  p_order_id uuid,
  p_payment_intent_id text,
  p_payment_method_id text,
  p_qr_image text,
  p_expires_at timestamptz
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
  if p_payment_intent_id !~ '^pi_[A-Za-z0-9]+$' then raise exception 'INVALID_PAYMENT_INTENT'; end if;
  if p_payment_method_id !~ '^pm_[A-Za-z0-9]+$' then raise exception 'INVALID_PAYMENT_METHOD_ID'; end if;
  if p_qr_image !~ '^data:image/(png|svg\+xml);base64,' or length(p_qr_image) > 100000 then
    raise exception 'INVALID_QR_IMAGE';
  end if;
  if p_expires_at <= now() or p_expires_at > now() + interval '3 hours' then
    raise exception 'INVALID_QR_EXPIRY';
  end if;

  select p.* into v_payment
  from public.payments p
  join public.orders o on o.id = p.order_id
  where p.order_id = p_order_id
    and p.method = 'GCASH'
    and p.status = 'PENDING'
    and o.status = 'AWAITING_PAYMENT'
  for update of p;

  if not found then raise exception 'ORDER_NOT_AVAILABLE_FOR_ONLINE_PAYMENT'; end if;

  update public.payments
  set provider = 'PAYMONGO',
      provider_session_id = left(p_payment_intent_id, 120),
      provider_payment_method_id = left(p_payment_method_id, 120),
      provider_qr_image = p_qr_image,
      provider_expires_at = p_expires_at,
      checkout_url = null,
      provider_session_created_at = now(),
      updated_at = now()
  where order_id = p_order_id;

  return jsonb_build_object(
    'attached', true,
    'paymentIntentId', p_payment_intent_id,
    'expiresAt', p_expires_at
  );
end;
$$;

revoke all on function public.attach_paymongo_qr(uuid, text, text, text, timestamptz) from public, anon, authenticated;
grant execute on function public.attach_paymongo_qr(uuid, text, text, text, timestamptz) to service_role;
