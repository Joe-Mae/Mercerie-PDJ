create table public.cash_sessions (
  id uuid primary key,
  boutique_id uuid not null references public.boutiques (id) on delete restrict,
  device_id uuid not null references public.devices (id) on delete restrict,
  ouverte_par uuid not null references public.profiles (id) on delete restrict,
  ouverte_at timestamptz not null,
  fond_ouverture_xof integer not null default 0 check (fond_ouverture_xof >= 0),
  fermee_par uuid references public.profiles (id) on delete restrict,
  fermee_at timestamptz,
  montant_attendu_xof integer check (montant_attendu_xof >= 0),
  montant_compte_xof integer check (montant_compte_xof >= 0),
  ecart_xof integer,
  statut public.cash_session_status not null default 'open',
  notes text,
  created_at timestamptz not null default now(),
  constraint cash_sessions_id_boutique_unique unique (id, boutique_id),
  constraint cash_sessions_state_check check (
    (statut = 'open' and fermee_at is null and fermee_par is null
      and montant_attendu_xof is null and montant_compte_xof is null and ecart_xof is null)
    or (statut = 'closed' and fermee_at is not null and fermee_par is not null
      and montant_attendu_xof is not null and montant_compte_xof is not null
      and ecart_xof = montant_compte_xof - montant_attendu_xof)
  )
);

create unique index cash_sessions_one_open_per_device
  on public.cash_sessions (device_id) where statut = 'open';
create index cash_sessions_boutique_idx on public.cash_sessions (boutique_id, ouverte_at desc);

create table public.sales (
  id uuid primary key,
  boutique_id uuid not null references public.boutiques (id) on delete restrict,
  reference text not null check (length(btrim(reference)) between 1 and 40),
  cash_session_id uuid,
  caissier_id uuid not null references public.profiles (id) on delete restrict,
  device_id uuid not null references public.devices (id) on delete restrict,
  statut public.sale_status not null default 'validated',
  date_vente timestamptz not null,
  date_sync timestamptz not null default now(),
  sous_total_xof integer not null check (sous_total_xof >= 0),
  remise_xof integer not null default 0 check (remise_xof >= 0),
  total_xof integer not null check (total_xof >= 0),
  remise_motif text,
  annulee_par uuid references public.profiles (id) on delete restrict,
  annulee_at timestamptz,
  created_at timestamptz not null default now(),
  constraint sales_cash_session_fk foreign key (cash_session_id, boutique_id)
    references public.cash_sessions (id, boutique_id) on delete restrict,
  constraint sales_reference_unique unique (boutique_id, reference),
  constraint sales_id_boutique_unique unique (id, boutique_id),
  constraint sales_total_check check (total_xof = sous_total_xof - remise_xof),
  constraint sales_discount_reason_check check (
    remise_xof = 0 or (remise_motif is not null and length(btrim(remise_motif)) >= 3)
  ),
  constraint sales_cancelled_state_check check (
    (statut = 'validated' and annulee_at is null and annulee_par is null)
    or (statut = 'cancelled' and annulee_at is not null and annulee_par is not null)
  )
);

create index sales_date_idx on public.sales (boutique_id, date_vente desc);
create index sales_cashier_idx on public.sales (caissier_id, date_vente desc);
create index sales_session_idx on public.sales (cash_session_id) where cash_session_id is not null;

create table public.sale_lines (
  id uuid primary key,
  sale_id uuid not null,
  boutique_id uuid not null references public.boutiques (id) on delete restrict,
  kind public.line_kind not null,
  variant_id uuid,
  service_id uuid,
  designation text not null check (length(btrim(designation)) between 1 and 200),
  quantite_saisie numeric(12, 3) not null check (quantite_saisie > 0),
  unite_saisie public.sale_unit not null,
  quantite_stock integer check (quantite_stock > 0),
  prix_unitaire_xof integer not null check (prix_unitaire_xof >= 0),
  prix_par public.pricing_unit not null,
  total_xof integer not null check (total_xof >= 0),
  created_at timestamptz not null default now(),
  constraint sale_lines_sale_fk foreign key (sale_id, boutique_id)
    references public.sales (id, boutique_id) on delete restrict,
  constraint sale_lines_variant_fk foreign key (variant_id, boutique_id)
    references public.variants (id, boutique_id) on delete restrict,
  constraint sale_lines_service_fk foreign key (service_id, boutique_id)
    references public.services (id, boutique_id) on delete restrict,
  constraint sale_lines_kind_check check (
    (kind = 'article' and variant_id is not null and service_id is null and quantite_stock is not null)
    or (kind = 'service' and variant_id is null and service_id is not null and quantite_stock is null)
  ),
  constraint sale_lines_piece_integer_check check (
    unite_saisie <> 'piece' or quantite_saisie = trunc(quantite_saisie)
  ),
  constraint sale_lines_id_boutique_unique unique (id, boutique_id)
);

create index sale_lines_sale_idx on public.sale_lines (sale_id);
create index sale_lines_variant_idx on public.sale_lines (boutique_id, variant_id);

create table public.sale_line_costs (
  sale_line_id uuid primary key,
  boutique_id uuid not null references public.boutiques (id) on delete restrict,
  cout_total_xof integer not null check (cout_total_xof >= 0),
  created_at timestamptz not null default now(),
  constraint sale_line_costs_line_fk foreign key (sale_line_id, boutique_id)
    references public.sale_lines (id, boutique_id) on delete restrict
);

create table public.payments (
  id uuid primary key,
  sale_id uuid not null,
  boutique_id uuid not null references public.boutiques (id) on delete restrict,
  method public.payment_method not null,
  montant_xof integer not null check (montant_xof > 0),
  cash_session_id uuid,
  reference_mobile text,
  montant_recu_xof integer check (montant_recu_xof >= 0),
  rendu_xof integer check (rendu_xof >= 0),
  created_by uuid not null references public.profiles (id) on delete restrict,
  created_at timestamptz not null default now(),
  constraint payments_sale_fk foreign key (sale_id, boutique_id)
    references public.sales (id, boutique_id) on delete restrict,
  constraint payments_session_fk foreign key (cash_session_id, boutique_id)
    references public.cash_sessions (id, boutique_id) on delete restrict,
  constraint payments_cash_check check (
    (method = 'cash' and cash_session_id is not null
      and montant_recu_xof is not null and rendu_xof is not null
      and montant_recu_xof >= montant_xof and rendu_xof = montant_recu_xof - montant_xof)
    or (method <> 'cash' and montant_recu_xof is null and rendu_xof is null)
  ),
  constraint payments_mobile_reference_check check (
    method = 'cash' or (reference_mobile is not null and length(btrim(reference_mobile)) >= 3)
  )
);

create index payments_sale_idx on public.payments (sale_id);
create index payments_session_idx on public.payments (cash_session_id) where cash_session_id is not null;

create table public.sale_cancellations (
  id uuid primary key,
  sale_id uuid not null,
  boutique_id uuid not null references public.boutiques (id) on delete restrict,
  motif text not null check (length(btrim(motif)) >= 3),
  annulee_par uuid not null references public.profiles (id) on delete restrict,
  annulee_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  constraint sale_cancellations_sale_fk foreign key (sale_id, boutique_id)
    references public.sales (id, boutique_id) on delete restrict,
  constraint sale_cancellations_sale_unique unique (sale_id),
  constraint sale_cancellations_id_boutique_unique unique (id, boutique_id)
);

create table public.refunds (
  id uuid primary key,
  cancellation_id uuid not null,
  sale_id uuid not null,
  boutique_id uuid not null references public.boutiques (id) on delete restrict,
  method public.payment_method not null,
  montant_xof integer not null check (montant_xof > 0),
  cash_session_id uuid,
  reference_mobile text,
  created_by uuid not null references public.profiles (id) on delete restrict,
  created_at timestamptz not null default now(),
  constraint refunds_cancellation_fk foreign key (cancellation_id, boutique_id)
    references public.sale_cancellations (id, boutique_id) on delete restrict,
  constraint refunds_sale_fk foreign key (sale_id, boutique_id)
    references public.sales (id, boutique_id) on delete restrict,
  constraint refunds_session_fk foreign key (cash_session_id, boutique_id)
    references public.cash_sessions (id, boutique_id) on delete restrict,
  constraint refunds_cash_check check (
    method <> 'cash' or cash_session_id is not null
  ),
  constraint refunds_mobile_reference_check check (
    method = 'cash' or (reference_mobile is not null and length(btrim(reference_mobile)) >= 3)
  ),
  constraint refunds_id_boutique_unique unique (id, boutique_id)
);

create index refunds_sale_idx on public.refunds (sale_id);

create table public.cash_movements (
  id uuid primary key,
  boutique_id uuid not null references public.boutiques (id) on delete restrict,
  session_id uuid not null,
  type public.cash_movement_type not null,
  direction public.cash_direction not null,
  montant_xof integer not null check (montant_xof > 0),
  motif text,
  sale_id uuid,
  refund_id uuid,
  created_by uuid not null references public.profiles (id) on delete restrict,
  occurred_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  constraint cash_movements_session_fk foreign key (session_id, boutique_id)
    references public.cash_sessions (id, boutique_id) on delete restrict,
  constraint cash_movements_sale_fk foreign key (sale_id, boutique_id)
    references public.sales (id, boutique_id) on delete restrict,
  constraint cash_movements_refund_fk foreign key (refund_id, boutique_id)
    references public.refunds (id, boutique_id) on delete restrict,
  constraint cash_movements_type_check check (
    (type = 'sale' and direction = 'in' and sale_id is not null and refund_id is null)
    or (type = 'refund' and direction = 'out' and refund_id is not null and sale_id is null)
    or (type = 'deposit' and direction = 'in' and sale_id is null and refund_id is null)
    or (type = 'withdrawal' and direction = 'out' and sale_id is null and refund_id is null)
    or (type = 'correction' and sale_id is null and refund_id is null)
  ),
  constraint cash_movements_reason_check check (
    type in ('sale', 'refund')
    or (motif is not null and length(btrim(motif)) >= 3)
  )
);

create index cash_movements_session_idx on public.cash_movements (session_id, occurred_at);
create index cash_movements_sale_idx on public.cash_movements (sale_id) where sale_id is not null;

alter table public.stock_movements
  add constraint stock_movements_sale_line_fk foreign key (sale_line_id)
  references public.sale_lines (id) on delete restrict;
