-- Add the covering index separately for projects that already applied the archive migration.

create index if not exists orders_archived_by_idx
  on public.orders(archived_by)
  where archived_by is not null;
