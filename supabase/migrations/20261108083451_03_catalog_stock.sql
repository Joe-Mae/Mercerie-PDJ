create table public.categories (
  id uuid primary key default gen_random_uuid(),
  boutique_id uuid not null references public.boutiques (id) on delete restrict,
  nom text not null check (length(btrim(nom)) between 1 and 80),
  code_court text not null check (length(btrim(code_court)) between 1 and 20),
  actif boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint categories_id_boutique_unique unique (id, boutique_id)
);

create unique index categories_code_unique on public.categories (boutique_id, lower(code_court));
create unique index categories_nom_unique on public.categories (boutique_id, lower(nom));

create table public.articles (
  id uuid primary key default gen_random_uuid(),
  boutique_id uuid not null references public.boutiques (id) on delete restrict,
  categorie_id uuid not null,
  nom text not null check (length(btrim(nom)) between 1 and 120),
  description text,
  dimension public.stock_dimension not null,
  actif boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint articles_categorie_fk foreign key (categorie_id, boutique_id)
    references public.categories (id, boutique_id) on delete restrict,
  constraint articles_id_boutique_unique unique (id, boutique_id),
  constraint articles_id_dimension_unique unique (id, dimension)
);

create unique index articles_nom_unique on public.articles (boutique_id, lower(nom));
create index articles_categorie_idx on public.articles (boutique_id, categorie_id);

create table public.variants (
  id uuid primary key default gen_random_uuid(),
  boutique_id uuid not null references public.boutiques (id) on delete restrict,
  article_id uuid not null,
  couleur text not null default 'Unique' check (length(btrim(couleur)) between 1 and 60),
  code_court text not null check (length(btrim(code_court)) between 1 and 30),
  dimension public.stock_dimension not null,
  unite_vente public.pricing_unit not null,
  prix_vente_xof integer not null check (prix_vente_xof >= 0),
  -- Seuil exprimé dans l'unité de stock canonique : centimètres ou pièces.
  seuil_alerte integer not null default 0 check (seuil_alerte >= 0),
  actif boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint variants_article_fk foreign key (article_id, boutique_id)
    references public.articles (id, boutique_id) on delete restrict,
  constraint variants_article_dimension_fk foreign key (article_id, dimension)
    references public.articles (id, dimension) on delete restrict,
  constraint variants_dimension_unit_check check (
    (dimension = 'length' and unite_vente in ('metre', 'yard'))
    or (dimension = 'unit' and unite_vente = 'piece')
  ),
  constraint variants_id_boutique_unique unique (id, boutique_id)
);

create unique index variants_code_unique on public.variants (boutique_id, lower(code_court));
create unique index variants_couleur_unique on public.variants (article_id, lower(couleur));
create index variants_article_idx on public.variants (boutique_id, article_id);
create index variants_active_idx on public.variants (boutique_id) where actif;

create table public.variant_costs (
  variant_id uuid primary key,
  boutique_id uuid not null references public.boutiques (id) on delete restrict,
  prix_achat_xof integer not null check (prix_achat_xof >= 0),
  updated_by uuid references public.profiles (id) on delete set null,
  updated_at timestamptz not null default now(),
  constraint variant_costs_variant_fk foreign key (variant_id, boutique_id)
    references public.variants (id, boutique_id) on delete cascade
);

create table public.price_history (
  id bigint generated always as identity primary key,
  boutique_id uuid not null references public.boutiques (id) on delete restrict,
  variant_id uuid not null references public.variants (id) on delete restrict,
  ancien_prix_vente_xof integer check (ancien_prix_vente_xof >= 0),
  nouveau_prix_vente_xof integer check (nouveau_prix_vente_xof >= 0),
  ancien_prix_achat_xof integer check (ancien_prix_achat_xof >= 0),
  nouveau_prix_achat_xof integer check (nouveau_prix_achat_xof >= 0),
  change_par uuid references public.profiles (id) on delete set null,
  change_at timestamptz not null default now(),
  constraint price_history_variant_fk foreign key (variant_id, boutique_id)
    references public.variants (id, boutique_id) on delete restrict,
  constraint price_history_change_check check (
    ancien_prix_vente_xof is distinct from nouveau_prix_vente_xof
    or ancien_prix_achat_xof is distinct from nouveau_prix_achat_xof
  )
);

create index price_history_variant_idx on public.price_history (variant_id, change_at desc);

create table public.services (
  id uuid primary key default gen_random_uuid(),
  boutique_id uuid not null references public.boutiques (id) on delete restrict,
  nom text not null check (length(btrim(nom)) between 1 and 80),
  prix_defaut_xof integer check (prix_defaut_xof >= 0),
  actif boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint services_id_boutique_unique unique (id, boutique_id)
);

create unique index services_nom_unique on public.services (boutique_id, lower(nom));

create table public.stock_levels (
  boutique_id uuid not null references public.boutiques (id) on delete restrict,
  variant_id uuid not null,
  quantite integer not null default 0,
  updated_at timestamptz not null default now(),
  primary key (boutique_id, variant_id),
  constraint stock_levels_variant_fk foreign key (variant_id, boutique_id)
    references public.variants (id, boutique_id) on delete restrict
);

-- Le stock est une projection du registre : il peut être négatif après une vente hors ligne.
create index stock_levels_low_idx on public.stock_levels (boutique_id, quantite);

create table public.stock_movements (
  id uuid primary key,
  boutique_id uuid not null references public.boutiques (id) on delete restrict,
  variant_id uuid not null,
  type public.movement_type not null,
  quantite integer not null,
  motif text,
  sale_line_id uuid,
  inventory_line_id uuid,
  device_id uuid references public.devices (id) on delete set null,
  created_by uuid not null references public.profiles (id) on delete restrict,
  occurred_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  constraint stock_movements_variant_fk foreign key (variant_id, boutique_id)
    references public.variants (id, boutique_id) on delete restrict,
  constraint stock_movements_quantity_check check (quantite <> 0),
  constraint stock_movements_sign_check check (
    (type = 'reception' and quantite > 0)
    or (type = 'sale' and quantite < 0)
    or (type = 'sale_cancel' and quantite > 0)
    or (type = 'loss' and quantite < 0)
    or (type in ('inventory', 'adjustment'))
  ),
  constraint stock_movements_reason_check check (
    (type in ('reception', 'sale', 'sale_cancel'))
    or (motif is not null and length(btrim(motif)) >= 3)
  ),
  constraint stock_movements_sale_line_check check (
    (type in ('sale', 'sale_cancel') and sale_line_id is not null)
    or (type not in ('sale', 'sale_cancel') and sale_line_id is null)
  ),
  constraint stock_movements_inventory_line_check check (
    (type = 'inventory' and inventory_line_id is not null)
    or (type <> 'inventory' and inventory_line_id is null)
  )
);

create unique index stock_movements_sale_once on public.stock_movements (sale_line_id)
  where type = 'sale';
create unique index stock_movements_cancel_once on public.stock_movements (sale_line_id)
  where type = 'sale_cancel';
create index stock_movements_variant_idx
  on public.stock_movements (boutique_id, variant_id, occurred_at desc);
create index stock_movements_device_idx on public.stock_movements (device_id, occurred_at desc);
