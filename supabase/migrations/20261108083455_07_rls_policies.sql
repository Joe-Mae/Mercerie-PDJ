grant usage on schema public to anon, authenticated, service_role;

alter table public.boutiques enable row level security;
alter table public.profiles enable row level security;
alter table public.devices enable row level security;
alter table public.user_devices enable row level security;
alter table public.categories enable row level security;
alter table public.articles enable row level security;
alter table public.variants enable row level security;
alter table public.variant_costs enable row level security;
alter table public.price_history enable row level security;
alter table public.services enable row level security;
alter table public.stock_levels enable row level security;
alter table public.stock_movements enable row level security;
alter table public.cash_sessions enable row level security;
alter table public.sales enable row level security;
alter table public.sale_lines enable row level security;
alter table public.sale_line_costs enable row level security;
alter table public.payments enable row level security;
alter table public.sale_cancellations enable row level security;
alter table public.refunds enable row level security;
alter table public.cash_movements enable row level security;
alter table public.inventories enable row level security;
alter table public.inventory_lines enable row level security;
alter table public.alerts enable row level security;
alter table public.audit_log enable row level security;
alter table public.imports enable row level security;
alter table public.import_rows enable row level security;
alter table public.push_subscriptions enable row level security;
alter table public.settings enable row level security;

create policy boutiques_select on public.boutiques
  for select to authenticated
  using (id = (select app_private.current_boutique_id()));

create policy profiles_select on public.profiles
  for select to authenticated
  using (
    id = (select auth.uid())
    or (
      (select app_private.is_admin())
      and boutique_id = (select app_private.current_boutique_id())
    )
  );

create policy profiles_update_admin on public.profiles
  for update to authenticated
  using (
    (select app_private.is_admin())
    and boutique_id = (select app_private.current_boutique_id())
  )
  with check (
    (select app_private.is_admin())
    and boutique_id = (select app_private.current_boutique_id())
  );

create policy devices_select_admin on public.devices
  for select to authenticated
  using ((select app_private.is_admin()));

create policy user_devices_select_admin on public.user_devices
  for select to authenticated
  using ((select app_private.is_admin()));

create policy categories_select on public.categories
  for select to authenticated
  using (
    boutique_id = (select app_private.current_boutique_id())
    and (actif or (select app_private.is_admin()))
  );

create policy articles_select on public.articles
  for select to authenticated
  using (
    boutique_id = (select app_private.current_boutique_id())
    and (actif or (select app_private.is_admin()))
  );

create policy variants_select on public.variants
  for select to authenticated
  using (
    boutique_id = (select app_private.current_boutique_id())
    and (actif or (select app_private.is_admin()))
  );

create policy variant_costs_select_admin on public.variant_costs
  for select to authenticated
  using ((select app_private.is_admin()));

create policy price_history_select_admin on public.price_history
  for select to authenticated
  using ((select app_private.is_admin()));

create policy services_select on public.services
  for select to authenticated
  using (
    boutique_id = (select app_private.current_boutique_id())
    and (actif or (select app_private.is_admin()))
  );

create policy stock_levels_select on public.stock_levels
  for select to authenticated
  using (
    boutique_id = (select app_private.current_boutique_id())
    and (select app_private.current_role()) is not null
  );

create policy stock_movements_select_admin on public.stock_movements
  for select to authenticated
  using ((select app_private.is_admin()));

create policy cash_sessions_select on public.cash_sessions
  for select to authenticated
  using (
    (select app_private.is_admin())
    or (
      (select app_private.current_role()) = 'cashier'
      and ouverte_par = (select auth.uid())
    )
  );

create policy sales_select on public.sales
  for select to authenticated
  using (
    boutique_id = (select app_private.current_boutique_id())
    and (select app_private.current_role()) in ('admin', 'cashier')
  );

create policy sale_lines_select on public.sale_lines
  for select to authenticated
  using (
    boutique_id = (select app_private.current_boutique_id())
    and (select app_private.current_role()) in ('admin', 'cashier')
  );

create policy sale_line_costs_select_admin on public.sale_line_costs
  for select to authenticated
  using ((select app_private.is_admin()));

create policy payments_select on public.payments
  for select to authenticated
  using (
    boutique_id = (select app_private.current_boutique_id())
    and (select app_private.current_role()) in ('admin', 'cashier')
  );

create policy sale_cancellations_select_admin on public.sale_cancellations
  for select to authenticated
  using ((select app_private.is_admin()));

create policy refunds_select_admin on public.refunds
  for select to authenticated
  using ((select app_private.is_admin()));

create policy cash_movements_select on public.cash_movements
  for select to authenticated
  using (
    (select app_private.is_admin())
    or (
      (select app_private.current_role()) = 'cashier'
      and exists (
        select 1
        from public.cash_sessions cs
        where cs.id = cash_movements.session_id
          and cs.ouverte_par = (select auth.uid())
      )
    )
  );

create policy inventories_select_admin on public.inventories
  for select to authenticated
  using ((select app_private.is_admin()));

create policy inventory_lines_select_admin on public.inventory_lines
  for select to authenticated
  using ((select app_private.is_admin()));

create policy alerts_select on public.alerts
  for select to authenticated
  using (
    boutique_id = (select app_private.current_boutique_id())
    and (
      (select app_private.is_admin())
      or type in ('low_stock', 'negative_stock')
    )
  );

create policy audit_log_select_admin on public.audit_log
  for select to authenticated
  using ((select app_private.is_admin()));

create policy imports_select_admin on public.imports
  for select to authenticated
  using ((select app_private.is_admin()));

create policy import_rows_select_admin on public.import_rows
  for select to authenticated
  using ((select app_private.is_admin()));

create policy push_subscriptions_select_own on public.push_subscriptions
  for select to authenticated
  using (user_id = (select auth.uid()));

create policy push_subscriptions_insert_own on public.push_subscriptions
  for insert to authenticated
  with check (
    user_id = (select auth.uid())
    and boutique_id = (select app_private.current_boutique_id())
  );

create policy push_subscriptions_update_own on public.push_subscriptions
  for update to authenticated
  using (user_id = (select auth.uid()))
  with check (
    user_id = (select auth.uid())
    and boutique_id = (select app_private.current_boutique_id())
  );

create policy push_subscriptions_delete_own on public.push_subscriptions
  for delete to authenticated
  using (user_id = (select auth.uid()));

create policy settings_select on public.settings
  for select to authenticated
  using (boutique_id = (select app_private.current_boutique_id()));

create policy settings_insert_admin on public.settings
  for insert to authenticated
  with check (
    (select app_private.is_admin())
    and boutique_id = (select app_private.current_boutique_id())
  );

create policy settings_update_admin on public.settings
  for update to authenticated
  using (
    (select app_private.is_admin())
    and boutique_id = (select app_private.current_boutique_id())
  )
  with check (
    (select app_private.is_admin())
    and boutique_id = (select app_private.current_boutique_id())
  );

revoke all on all tables in schema public from anon;
revoke all on all tables in schema public from authenticated;
revoke all on all sequences in schema public from anon;
revoke all on all sequences in schema public from authenticated;

grant select on public.boutiques to authenticated;
grant select on public.profiles to authenticated;
grant update on public.profiles to authenticated;
grant select on public.devices to authenticated;
grant select on public.user_devices to authenticated;
grant select on public.categories to authenticated;
grant select on public.articles to authenticated;
grant select on public.variants to authenticated;
grant select on public.variant_costs to authenticated;
grant select on public.price_history to authenticated;
grant select on public.services to authenticated;
grant select on public.stock_levels to authenticated;
grant select on public.stock_movements to authenticated;
grant select on public.cash_sessions to authenticated;
grant select on public.sales to authenticated;
grant select on public.sale_lines to authenticated;
grant select on public.sale_line_costs to authenticated;
grant select on public.payments to authenticated;
grant select on public.sale_cancellations to authenticated;
grant select on public.refunds to authenticated;
grant select on public.cash_movements to authenticated;
grant select on public.inventories to authenticated;
grant select on public.inventory_lines to authenticated;
grant select on public.alerts to authenticated;
grant select on public.audit_log to authenticated;
grant select on public.imports to authenticated;
grant select on public.import_rows to authenticated;
grant select on public.push_subscriptions to authenticated;
grant insert, update, delete on public.push_subscriptions to authenticated;
grant select on public.settings to authenticated;
grant insert, update on public.settings to authenticated;

grant all on all tables in schema public to service_role;
grant usage, select on all sequences in schema public to service_role;
