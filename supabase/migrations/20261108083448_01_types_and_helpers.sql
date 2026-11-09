-- Types métier partagés par le schéma et l'application.
create type public.app_role as enum ('admin', 'cashier', 'seller');
create type public.stock_dimension as enum ('length', 'unit');
create type public.sale_unit as enum ('metre', 'yard', 'centimetre', 'piece');
create type public.pricing_unit as enum ('metre', 'yard', 'piece');
create type public.movement_type as enum (
  'reception',
  'sale',
  'sale_cancel',
  'loss',
  'inventory',
  'adjustment'
);
create type public.payment_method as enum ('cash', 'tmoney', 'flooz');
create type public.sale_status as enum ('validated', 'cancelled');
create type public.cash_session_status as enum ('open', 'closed');
create type public.cash_movement_type as enum ('sale', 'refund', 'deposit', 'withdrawal', 'correction');
create type public.cash_direction as enum ('in', 'out');
create type public.alert_type as enum (
  'low_stock',
  'negative_stock',
  'cash_gap',
  'sale_cancelled',
  'discount',
  'stock_adjustment',
  'login'
);
create type public.alert_severity as enum ('info', 'warning', 'critical');
create type public.import_status as enum ('pending', 'applied', 'partial', 'failed');
create type public.row_status as enum ('ok', 'error');
create type public.inventory_status as enum ('open', 'closed', 'cancelled');
create type public.line_kind as enum ('article', 'service');

-- Les fonctions d'autorisation vivent hors du schéma exposé par l'API.
create schema if not exists app_private;
revoke all on schema app_private from public;
grant usage on schema app_private to authenticated, service_role;
