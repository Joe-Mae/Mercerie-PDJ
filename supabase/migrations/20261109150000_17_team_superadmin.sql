-- Gestion des comptes réservée au superadmin.
-- Le superadmin est le compte de développement de la boutique. Il gère les
-- identifiants, les rôles et l'activation des comptes. Le propriétaire
-- administrateur garde tous ses droits métier mais ne voit pas cette gestion.
-- Aucun compte n'est jamais supprimé : une erreur se corrige par une
-- désactivation, qui laisse une trace dans le journal d'audit.

alter table public.profiles
  add column est_superadmin boolean not null default false;

alter table public.profiles
  add constraint profiles_superadmin_admin_check
  check (not est_superadmin or role = 'admin');

create unique index profiles_one_superadmin_per_boutique
  on public.profiles (boutique_id)
  where est_superadmin;

create or replace function app_private.is_superadmin()
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select coalesce(
    exists (
      select 1
      from public.profiles p
      where p.id = auth.uid()
        and p.actif
        and p.role = 'admin'
        and p.est_superadmin
    ),
    false
  )
$$;

create or replace function app_private.require_superadmin()
returns uuid
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
declare
  v_boutique_id uuid;
begin
  select p.boutique_id into v_boutique_id
  from public.profiles p
  where p.id = auth.uid()
    and p.actif
    and p.role = 'admin'
    and p.est_superadmin;

  if v_boutique_id is null then
    raise exception 'Cette action est réservée au compte superadmin.'
      using errcode = '42501';
  end if;

  return v_boutique_id;
end;
$$;

revoke all on function app_private.is_superadmin() from public;
revoke all on function app_private.require_superadmin() from public;
grant execute on function app_private.is_superadmin() to authenticated, service_role;
grant execute on function app_private.require_superadmin() to authenticated, service_role;

-- Les écritures passent uniquement par les fonctions ci-dessous. Le retrait
-- du droit d'update empêche un administrateur non superadmin de modifier un
-- profil, y compris le drapeau est_superadmin, depuis l'API REST.
drop policy if exists profiles_update_admin on public.profiles;
revoke update on public.profiles from authenticated;

create or replace function public.team_list()
returns table (
  id uuid,
  email text,
  nom text,
  role public.app_role,
  actif boolean,
  est_superadmin boolean,
  dernier_acces_at timestamptz
)
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
declare
  v_boutique_id uuid := app_private.require_superadmin();
begin
  return query
  select
    p.id,
    p.email,
    p.nom,
    p.role,
    p.actif,
    p.est_superadmin,
    p.dernier_acces_at
  from public.profiles p
  where p.boutique_id = v_boutique_id
  order by p.est_superadmin desc, p.actif desc, p.nom;
end;
$$;

create or replace function public.team_set_role(
  p_user_id uuid,
  p_role public.app_role
)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_boutique_id uuid := app_private.require_superadmin();
  v_target public.profiles;
begin
  if p_role is null then
    raise exception 'Le rôle est obligatoire.' using errcode = '22023';
  end if;

  select p.* into v_target
  from public.profiles p
  where p.id = p_user_id
    and p.boutique_id = v_boutique_id;

  if not found then
    raise exception 'Compte introuvable dans cette boutique.' using errcode = 'P0002';
  end if;

  if v_target.est_superadmin then
    raise exception 'Le compte superadmin ne peut pas changer de rôle.'
      using errcode = '42501';
  end if;

  update public.profiles
    set role = p_role
    where id = p_user_id;
end;
$$;

create or replace function public.team_set_actif(
  p_user_id uuid,
  p_actif boolean
)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_boutique_id uuid := app_private.require_superadmin();
  v_target public.profiles;
begin
  if p_actif is null then
    raise exception 'L’état du compte est obligatoire.' using errcode = '22023';
  end if;

  select p.* into v_target
  from public.profiles p
  where p.id = p_user_id
    and p.boutique_id = v_boutique_id;

  if not found then
    raise exception 'Compte introuvable dans cette boutique.' using errcode = 'P0002';
  end if;

  if v_target.est_superadmin then
    raise exception 'Le compte superadmin ne peut pas être désactivé.'
      using errcode = '42501';
  end if;

  update public.profiles
    set actif = p_actif
    where id = p_user_id;
end;
$$;

revoke all on function public.team_list() from public;
revoke all on function public.team_set_role(uuid, public.app_role) from public;
revoke all on function public.team_set_actif(uuid, boolean) from public;
grant execute on function public.team_list() to authenticated;
grant execute on function public.team_set_role(uuid, public.app_role) to authenticated;
grant execute on function public.team_set_actif(uuid, boolean) to authenticated;

-- La désignation du superadmin reste une opération manuelle du développeur.
-- Elle est néanmoins tracée dans le journal d'audit.
create or replace function app_private.audit_profile_change()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if new.role is distinct from old.role
    or new.actif is distinct from old.actif
    or new.nom is distinct from old.nom
    or new.est_superadmin is distinct from old.est_superadmin then
    insert into public.audit_log (
      boutique_id,
      user_id,
      action,
      entity,
      entity_id,
      details
    )
    values (
      old.boutique_id,
      auth.uid(),
      'profile_updated',
      'profiles',
      old.id::text,
      jsonb_build_object(
        'ancien_role', old.role,
        'nouveau_role', new.role,
        'ancien_actif', old.actif,
        'nouveau_actif', new.actif,
        'ancien_nom', old.nom,
        'nouveau_nom', new.nom,
        'ancien_superadmin', old.est_superadmin,
        'nouveau_superadmin', new.est_superadmin
      )
    );
  end if;
  return new;
end;
$$;
