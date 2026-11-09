create table public.boutiques (
  id uuid primary key default gen_random_uuid(),
  nom text not null check (length(btrim(nom)) between 1 and 120),
  code text not null check (code ~ '^[A-Z0-9-]{2,12}$'),
  adresse text,
  telephone text,
  devise text not null default 'XOF' check (devise = 'XOF'),
  fuseau_horaire text not null default 'Africa/Lome',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index boutiques_code_unique on public.boutiques (upper(code));

create table public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  boutique_id uuid not null references public.boutiques (id) on delete restrict,
  email text not null check (position('@' in email) > 1),
  nom text not null check (length(btrim(nom)) between 1 and 120),
  role public.app_role not null default 'seller',
  actif boolean not null default false,
  dernier_acces_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index profiles_email_unique on public.profiles (lower(email));
create index profiles_boutique_idx on public.profiles (boutique_id);

create table public.devices (
  id uuid primary key,
  boutique_id uuid not null references public.boutiques (id) on delete restrict,
  nom text not null check (length(btrim(nom)) between 1 and 80),
  plateforme text not null check (plateforme in ('web', 'android', 'ios', 'autre')),
  version_app text,
  created_by uuid references public.profiles (id) on delete set null,
  created_at timestamptz not null default now(),
  last_seen_at timestamptz not null default now(),
  revoked_at timestamptz
);

create index devices_boutique_idx on public.devices (boutique_id);
create index devices_active_idx on public.devices (boutique_id) where revoked_at is null;

create table public.user_devices (
  device_id uuid not null references public.devices (id) on delete cascade,
  user_id uuid not null references public.profiles (id) on delete cascade,
  first_seen_at timestamptz not null default now(),
  last_unlocked_at timestamptz,
  revoked_at timestamptz,
  primary key (device_id, user_id)
);

create index user_devices_user_idx on public.user_devices (user_id) where revoked_at is null;
