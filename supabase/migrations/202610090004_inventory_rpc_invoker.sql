-- Inventory reads already have safe public RLS policies, so they do not need elevated execution.

alter function public.inventory_overview(text) security invoker;
alter function public.check_inventory(text, text) security invoker;
