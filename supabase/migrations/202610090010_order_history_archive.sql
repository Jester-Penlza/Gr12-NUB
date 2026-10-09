-- Let authorized staff hide closed orders from the active workspace without deleting audit data.

alter table public.orders
  add column if not exists archived_at timestamptz,
  add column if not exists archived_by uuid references auth.users(id);

create index if not exists orders_active_history_idx
  on public.orders(created_at desc)
  where archived_at is null;

create index if not exists orders_archived_by_idx
  on public.orders(archived_by)
  where archived_by is not null;

create or replace function public.staff_archive_order(p_order_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public, private, auth
as $$
declare
  v_order public.orders%rowtype;
begin
  if not private.is_staff() then raise exception 'UNAUTHORIZED'; end if;

  select * into v_order from public.orders where id = p_order_id for update;
  if not found then raise exception 'ORDER_NOT_FOUND'; end if;
  if v_order.status not in ('CANCELLED', 'COMPLETED') then
    raise exception 'ONLY_CLOSED_ORDERS_CAN_BE_ARCHIVED';
  end if;

  update public.orders
  set archived_at = coalesce(archived_at, now()),
      archived_by = coalesce(archived_by, auth.uid()),
      updated_at = now()
  where id = p_order_id;

  return jsonb_build_object(
    'archived', true,
    'orderId', p_order_id,
    'reference', v_order.reference
  );
end;
$$;

create or replace function public.staff_archive_closed_orders()
returns jsonb
language plpgsql
security definer
set search_path = public, private, auth
as $$
declare
  v_count integer;
begin
  if not private.is_staff() then raise exception 'UNAUTHORIZED'; end if;

  update public.orders
  set archived_at = now(),
      archived_by = auth.uid(),
      updated_at = now()
  where archived_at is null
    and status in ('CANCELLED', 'COMPLETED');

  get diagnostics v_count = row_count;
  return jsonb_build_object('archived', v_count);
end;
$$;

revoke all on function public.staff_archive_order(uuid) from public, anon;
revoke all on function public.staff_archive_closed_orders() from public, anon;
grant execute on function public.staff_archive_order(uuid) to authenticated;
grant execute on function public.staff_archive_closed_orders() to authenticated;
