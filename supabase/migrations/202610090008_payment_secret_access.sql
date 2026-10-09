-- Edge Functions read encrypted payment secrets from Supabase Vault.
-- Only the service role can execute this function.

create or replace function public.get_payment_server_secrets()
returns jsonb
language plpgsql
security definer
set search_path = public, vault, auth
as $$
declare
  v_result jsonb;
begin
  if auth.role() <> 'service_role' then raise exception 'UNAUTHORIZED'; end if;

  select coalesce(jsonb_object_agg(name, decrypted_secret), '{}'::jsonb)
  into v_result
  from vault.decrypted_secrets
  where name in ('PAYMONGO_SECRET_KEY_TEST', 'PAYMONGO_WEBHOOK_SECRET_TEST');

  return v_result;
end;
$$;

revoke all on function public.get_payment_server_secrets() from public, anon, authenticated;
grant execute on function public.get_payment_server_secrets() to service_role;
