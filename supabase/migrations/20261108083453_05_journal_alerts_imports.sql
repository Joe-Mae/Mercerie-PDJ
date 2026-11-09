create table public.inventories (
  id uuid primary key,
  boutique_id uuid not null references public.boutiques (id) on delete restrict,
  statut public.inventory_status not null default 'open',
  started_by uuid not null references public.profiles (id) on delete restrict,
  started_at timestamptz not null default now(),
  closed_by uuid references public.profiles (id) on delete restrict,
  closed_at timestamptz,
  motif text,
  created_at timestamptz not null default now(),
  constraint inventories_id_boutique_unique unique (id, boutique_id),
  constraint inventories_state_check check (
    (statut = 'open' and closed_by is null and closed_at is null)
    or (statut in ('closed', 'cancelled') and closed_by is not null and closed_at is not null)
  )
);

create index inventories_boutique_idx on public.inventories (boutique_id, started_at desc);

create table public.inventory_lines (
  id uuid primary key,
  inventory_id uuid not null,
  boutique_id uuid not null references public.boutiques (id) on delete restrict,
  variant_id uuid not null,
  quantite_theorique integer not null,
  quantite_comptee integer not null check (quantite_comptee >= 0),
  ecart integer generated always as (quantite_comptee - quantite_theorique) stored,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint inventory_lines_inventory_fk foreign key (inventory_id, boutique_id)
    references public.inventories (id, boutique_id) on delete cascade,
  constraint inventory_lines_variant_fk foreign key (variant_id, boutique_id)
    references public.variants (id, boutique_id) on delete restrict,
  constraint inventory_lines_variant_unique unique (inventory_id, variant_id),
  constraint inventory_lines_id_boutique_unique unique (id, boutique_id)
);

alter table public.stock_movements
  add constraint stock_movements_inventory_line_fk foreign key (inventory_line_id)
  references public.inventory_lines (id) on delete restrict;

create table public.alerts (
  id uuid primary key default gen_random_uuid(),
  boutique_id uuid not null references public.boutiques (id) on delete restrict,
  type public.alert_type not null,
  severity public.alert_severity not null,
  message text not null check (length(btrim(message)) between 1 and 300),
  variant_id uuid,
  sale_id uuid,
  cash_session_id uuid,
  resolved_at timestamptz,
  created_at timestamptz not null default now(),
  constraint alerts_variant_fk foreign key (variant_id, boutique_id)
    references public.variants (id, boutique_id) on delete cascade,
  constraint alerts_sale_fk foreign key (sale_id, boutique_id)
    references public.sales (id, boutique_id) on delete restrict,
  constraint alerts_session_fk foreign key (cash_session_id, boutique_id)
    references public.cash_sessions (id, boutique_id) on delete restrict
);

create unique index alerts_open_stock_unique
  on public.alerts (boutique_id, variant_id, type)
  where resolved_at is null and type in ('low_stock', 'negative_stock');
create index alerts_open_idx on public.alerts (boutique_id, created_at desc) where resolved_at is null;

create table public.audit_log (
  id bigint generated always as identity primary key,
  boutique_id uuid not null references public.boutiques (id) on delete restrict,
  user_id uuid references public.profiles (id) on delete set null,
  device_id uuid references public.devices (id) on delete set null,
  action text not null check (length(btrim(action)) between 1 and 80),
  entity text check (length(btrim(entity)) between 1 and 80),
  entity_id text,
  details jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index audit_log_boutique_idx on public.audit_log (boutique_id, created_at desc);
create index audit_log_user_idx on public.audit_log (user_id, created_at desc);

create table public.imports (
  id uuid primary key default gen_random_uuid(),
  boutique_id uuid not null references public.boutiques (id) on delete restrict,
  imported_by uuid not null references public.profiles (id) on delete restrict,
  file_name text not null check (length(btrim(file_name)) between 1 and 200),
  statut public.import_status not null default 'pending',
  total_rows integer not null default 0 check (total_rows >= 0),
  success_rows integer not null default 0 check (success_rows >= 0),
  error_rows integer not null default 0 check (error_rows >= 0),
  created_at timestamptz not null default now(),
  applied_at timestamptz,
  constraint imports_counts_check check (success_rows + error_rows <= total_rows)
);

create table public.import_rows (
  id bigint generated always as identity primary key,
  import_id uuid not null references public.imports (id) on delete cascade,
  boutique_id uuid not null references public.boutiques (id) on delete restrict,
  line_number integer not null check (line_number >= 1),
  raw jsonb not null,
  statut public.row_status not null,
  error_message text,
  variant_id uuid,
  created_at timestamptz not null default now(),
  constraint import_rows_line_unique unique (import_id, line_number),
  constraint import_rows_error_check check (
    (statut = 'ok' and error_message is null)
    or (statut = 'error' and error_message is not null)
  ),
  constraint import_rows_variant_fk foreign key (variant_id, boutique_id)
    references public.variants (id, boutique_id) on delete restrict
);

create table public.push_subscriptions (
  id uuid primary key default gen_random_uuid(),
  boutique_id uuid not null references public.boutiques (id) on delete restrict,
  user_id uuid not null references public.profiles (id) on delete cascade,
  device_id uuid references public.devices (id) on delete set null,
  endpoint text not null check (length(endpoint) >= 20),
  p256dh text not null,
  auth text not null,
  created_at timestamptz not null default now(),
  revoked_at timestamptz,
  constraint push_subscriptions_endpoint_unique unique (endpoint)
);

create index push_subscriptions_user_idx on public.push_subscriptions (user_id) where revoked_at is null;

create table public.settings (
  boutique_id uuid not null references public.boutiques (id) on delete cascade,
  key text not null check (key ~ '^[a-z][a-z0-9_]{1,60}$'),
  value jsonb not null,
  updated_by uuid references public.profiles (id) on delete set null,
  updated_at timestamptz not null default now(),
  primary key (boutique_id, key)
);
