create or replace function app_private.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

create or replace function app_private.current_role()
returns public.app_role
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select p.role
  from public.profiles p
  where p.id = auth.uid() and p.actif
$$;

create or replace function app_private.current_boutique_id()
returns uuid
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select p.boutique_id
  from public.profiles p
  where p.id = auth.uid() and p.actif
$$;

create or replace function app_private.is_admin()
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select coalesce(app_private.current_role() = 'admin', false)
$$;

create or replace function app_private.require_role(allowed public.app_role[])
returns public.app_role
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
declare
  v_role public.app_role := app_private.current_role();
begin
  if v_role is null then
    raise exception 'Compte inactif ou non authentifié.' using errcode = '42501';
  end if;
  if not (v_role = any (allowed)) then
    raise exception 'Cette action est réservée à un autre rôle.' using errcode = '42501';
  end if;
  return v_role;
end;
$$;

revoke all on function app_private.current_role() from public;
revoke all on function app_private.current_boutique_id() from public;
revoke all on function app_private.is_admin() from public;
revoke all on function app_private.require_role(public.app_role[]) from public;
grant execute on function app_private.current_role() to authenticated, service_role;
grant execute on function app_private.current_boutique_id() to authenticated, service_role;
grant execute on function app_private.is_admin() to authenticated, service_role;
grant execute on function app_private.require_role(public.app_role[]) to authenticated, service_role;

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_role_text text;
  v_role public.app_role;
  v_boutique_id uuid;
  v_email text;
  v_nom text;
  v_actif boolean;
begin
  v_email := coalesce(new.email, new.id::text || '@utilisateur-invalide.local');
  v_role_text := coalesce(new.raw_app_meta_data ->> 'role', 'seller');
  if v_role_text not in ('admin', 'cashier', 'seller') then
    raise exception 'Rôle inconnu pour le compte % : %', v_email, v_role_text;
  end if;
  v_role := v_role_text::public.app_role;

  v_boutique_id := nullif(new.raw_app_meta_data ->> 'boutique_id', '')::uuid;
  if v_boutique_id is null then
    select id into v_boutique_id from public.boutiques order by created_at asc limit 1;
  end if;
  if v_boutique_id is null then
    raise exception 'Aucune boutique n’est configurée pour ce compte.';
  end if;

  v_nom := coalesce(nullif(btrim(new.raw_user_meta_data ->> 'nom'), ''), split_part(v_email, '@', 1));
  v_actif := coalesce((new.raw_app_meta_data ->> 'actif')::boolean, false);

  insert into public.profiles (id, boutique_id, email, nom, role, actif)
  values (new.id, v_boutique_id, v_email, v_nom, v_role, v_actif)
  on conflict (id) do nothing;

  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

revoke all on function public.handle_new_user() from public;

create or replace function app_private.reject_mutation()
returns trigger
language plpgsql
as $$
begin
  raise exception 'Cette table est en lecture seule. Une correction doit passer par une nouvelle opération tracée.'
    using errcode = '55000';
end;
$$;

create trigger stock_movements_append_only
  before update or delete on public.stock_movements
  for each row execute function app_private.reject_mutation();
create trigger sale_lines_append_only
  before update or delete on public.sale_lines
  for each row execute function app_private.reject_mutation();
create trigger sale_line_costs_append_only
  before update or delete on public.sale_line_costs
  for each row execute function app_private.reject_mutation();
create trigger payments_append_only
  before update or delete on public.payments
  for each row execute function app_private.reject_mutation();
create trigger sale_cancellations_append_only
  before update or delete on public.sale_cancellations
  for each row execute function app_private.reject_mutation();
create trigger refunds_append_only
  before update or delete on public.refunds
  for each row execute function app_private.reject_mutation();
create trigger cash_movements_append_only
  before update or delete on public.cash_movements
  for each row execute function app_private.reject_mutation();
create trigger price_history_append_only
  before update or delete on public.price_history
  for each row execute function app_private.reject_mutation();
create trigger audit_log_append_only
  before update or delete on public.audit_log
  for each row execute function app_private.reject_mutation();
create trigger import_rows_append_only
  before update or delete on public.import_rows
  for each row execute function app_private.reject_mutation();

create or replace function app_private.init_variant_stock()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_article_nom text;
  v_unite text;
begin
  insert into public.stock_levels (boutique_id, variant_id, quantite)
  values (new.boutique_id, new.id, 0)
  on conflict do nothing;

  if new.seuil_alerte > 0 then
    select a.nom into v_article_nom from public.articles a where a.id = new.article_id;
    v_unite := case when new.dimension = 'length' then 'cm' else 'unité(s)' end;
    insert into public.alerts (boutique_id, type, severity, message, variant_id)
    values (
      new.boutique_id,
      'low_stock',
      'warning',
      format(
        'Stock bas : %s — %s (%s), 0 %s pour un seuil de %s.',
        v_article_nom,
        new.couleur,
        new.code_court,
        v_unite,
        new.seuil_alerte
      ),
      new.id
    )
    on conflict do nothing;
  end if;

  return new;
end;
$$;

create trigger variants_init_stock
  after insert on public.variants
  for each row execute function app_private.init_variant_stock();

create or replace function app_private.apply_stock_movement()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_after integer;
  v_threshold integer;
  v_dimension public.stock_dimension;
  v_article_nom text;
  v_couleur text;
  v_code text;
  v_unit_label text;
begin
  insert into public.stock_levels (boutique_id, variant_id, quantite, updated_at)
  values (new.boutique_id, new.variant_id, new.quantite, now())
  on conflict (boutique_id, variant_id) do update
    set quantite = stock_levels.quantite + excluded.quantite,
        updated_at = now()
  returning quantite into v_after;

  select v.seuil_alerte, v.dimension, a.nom, v.couleur, v.code_court
    into v_threshold, v_dimension, v_article_nom, v_couleur, v_code
  from public.variants v
  join public.articles a on a.id = v.article_id
  where v.id = new.variant_id;

  v_unit_label := case when v_dimension = 'length' then 'cm' else 'unité(s)' end;

  if v_threshold > 0 and v_after < v_threshold then
    insert into public.alerts (boutique_id, type, severity, message, variant_id)
    values (
      new.boutique_id,
      'low_stock',
      'warning',
      format(
        'Stock bas : %s — %s (%s), %s %s pour un seuil de %s.',
        v_article_nom,
        v_couleur,
        v_code,
        v_after,
        v_unit_label,
        v_threshold
      ),
      new.variant_id
    )
    on conflict do nothing;
  else
    update public.alerts
      set resolved_at = now()
      where boutique_id = new.boutique_id
        and variant_id = new.variant_id
        and type = 'low_stock'
        and resolved_at is null;
  end if;

  if v_after < 0 then
    insert into public.alerts (boutique_id, type, severity, message, variant_id)
    values (
      new.boutique_id,
      'negative_stock',
      'critical',
      format(
        'Stock négatif : %s — %s (%s), %s %s.',
        v_article_nom,
        v_couleur,
        v_code,
        v_after,
        v_unit_label
      ),
      new.variant_id
    )
    on conflict do nothing;
  else
    update public.alerts
      set resolved_at = now()
      where boutique_id = new.boutique_id
        and variant_id = new.variant_id
        and type = 'negative_stock'
        and resolved_at is null;
  end if;

  return new;
end;
$$;

create trigger stock_movements_apply
  after insert on public.stock_movements
  for each row execute function app_private.apply_stock_movement();

create or replace function app_private.log_variant_price_change()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if new.prix_vente_xof is distinct from old.prix_vente_xof then
    insert into public.price_history (
      boutique_id,
      variant_id,
      ancien_prix_vente_xof,
      nouveau_prix_vente_xof,
      change_par
    )
    values (new.boutique_id, new.id, old.prix_vente_xof, new.prix_vente_xof, auth.uid());
  end if;
  return new;
end;
$$;

create trigger variants_log_price_change
  after update of prix_vente_xof on public.variants
  for each row execute function app_private.log_variant_price_change();

create or replace function app_private.log_variant_cost_change()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if tg_op = 'INSERT' then
    insert into public.price_history (
      boutique_id,
      variant_id,
      nouveau_prix_achat_xof,
      change_par
    )
    values (new.boutique_id, new.variant_id, new.prix_achat_xof, auth.uid());
  elsif new.prix_achat_xof is distinct from old.prix_achat_xof then
    insert into public.price_history (
      boutique_id,
      variant_id,
      ancien_prix_achat_xof,
      nouveau_prix_achat_xof,
      change_par
    )
    values (new.boutique_id, new.variant_id, old.prix_achat_xof, new.prix_achat_xof, auth.uid());
  end if;
  return new;
end;
$$;

create trigger variant_costs_log_price_change
  after insert or update of prix_achat_xof on public.variant_costs
  for each row execute function app_private.log_variant_cost_change();

create or replace function app_private.protect_last_admin()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_remaining integer;
begin
  if tg_op = 'DELETE' then
    if old.role = 'admin' and old.actif then
      select count(*) into v_remaining
      from public.profiles p
      where p.boutique_id = old.boutique_id
        and p.role = 'admin'
        and p.actif
        and p.id <> old.id;
      if v_remaining = 0 then
        raise exception 'Impossible de supprimer le dernier administrateur actif.'
          using errcode = '23514';
      end if;
    end if;
    return old;
  end if;

  if old.role = 'admin' and old.actif and (new.role <> 'admin' or not new.actif) then
    select count(*) into v_remaining
    from public.profiles p
    where p.boutique_id = old.boutique_id
      and p.role = 'admin'
      and p.actif
      and p.id <> old.id;
    if v_remaining = 0 then
      raise exception 'Impossible de désactiver le dernier administrateur actif.'
        using errcode = '23514';
    end if;
  end if;

  return new;
end;
$$;

create trigger profiles_protect_last_admin
  before update or delete on public.profiles
  for each row execute function app_private.protect_last_admin();

create or replace function app_private.audit_profile_change()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if new.role is distinct from old.role
    or new.actif is distinct from old.actif
    or new.nom is distinct from old.nom then
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
        'nouveau_nom', new.nom
      )
    );
  end if;
  return new;
end;
$$;

create trigger profiles_audit_change
  after update on public.profiles
  for each row execute function app_private.audit_profile_change();

do $$
declare
  v_table text;
begin
  foreach v_table in array array[
    'boutiques',
    'profiles',
    'categories',
    'articles',
    'variants',
    'variant_costs',
    'services',
    'inventory_lines',
    'settings'
  ]
  loop
    execute format(
      'create trigger %I_set_updated_at before update on public.%I for each row execute function app_private.set_updated_at()',
      v_table,
      v_table
    );
  end loop;
end;
$$;

create or replace function public.register_device(
  p_device_id uuid,
  p_nom text,
  p_plateforme text,
  p_version_app text default null
)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_boutique_id uuid;
  v_device_id uuid;
begin
  perform app_private.require_role(array['admin', 'cashier', 'seller']::public.app_role[]);

  if p_device_id is null then
    raise exception 'L’identifiant de l’appareil est obligatoire.' using errcode = '22023';
  end if;
  if p_nom is null or length(btrim(p_nom)) = 0 then
    raise exception 'Le nom de l’appareil est obligatoire.' using errcode = '22023';
  end if;
  if p_plateforme not in ('web', 'android', 'ios', 'autre') then
    raise exception 'Plateforme d’appareil inconnue.' using errcode = '22023';
  end if;

  select boutique_id into v_boutique_id
  from public.profiles
  where id = auth.uid() and actif;

  insert into public.devices (
    id,
    boutique_id,
    nom,
    plateforme,
    version_app,
    created_by,
    last_seen_at
  )
  values (
    p_device_id,
    v_boutique_id,
    btrim(p_nom),
    p_plateforme,
    p_version_app,
    auth.uid(),
    now()
  )
  on conflict (id) do update
    set nom = excluded.nom,
        plateforme = excluded.plateforme,
        version_app = excluded.version_app,
        last_seen_at = now()
    where devices.boutique_id = v_boutique_id
      and devices.revoked_at is null
  returning id into v_device_id;

  if v_device_id is null then
    raise exception 'Cet appareil ne peut pas être enregistré.' using errcode = '42501';
  end if;

  insert into public.user_devices (device_id, user_id, last_unlocked_at)
  values (v_device_id, auth.uid(), now())
  on conflict (device_id, user_id) do update
    set last_unlocked_at = now(), revoked_at = null;

  insert into public.audit_log (
    boutique_id,
    user_id,
    device_id,
    action,
    entity,
    entity_id,
    details
  )
  values (
    v_boutique_id,
    auth.uid(),
    v_device_id,
    'device_registered',
    'devices',
    v_device_id::text,
    jsonb_build_object('nom', btrim(p_nom), 'plateforme', p_plateforme)
  );
end;
$$;

revoke all on function public.register_device(uuid, text, text, text) from public;
grant execute on function public.register_device(uuid, text, text, text) to authenticated;

create or replace function public.record_login(
  p_device_id uuid default null,
  p_details jsonb default '{}'::jsonb
)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_boutique_id uuid;
  v_device_id uuid := null;
begin
  perform app_private.require_role(array['admin', 'cashier', 'seller']::public.app_role[]);

  select boutique_id into v_boutique_id
  from public.profiles
  where id = auth.uid() and actif;

  if p_device_id is not null and exists (
    select 1 from public.user_devices ud
    where ud.device_id = p_device_id and ud.user_id = auth.uid()
  ) then
    v_device_id := p_device_id;
  end if;

  update public.profiles set dernier_acces_at = now() where id = auth.uid();

  insert into public.audit_log (
    boutique_id,
    user_id,
    device_id,
    action,
    entity,
    entity_id,
    details
  )
  values (
    v_boutique_id,
    auth.uid(),
    v_device_id,
    'login',
    'profiles',
    auth.uid()::text,
    coalesce(p_details, '{}'::jsonb)
  );
end;
$$;

revoke all on function public.record_login(uuid, jsonb) from public;
grant execute on function public.record_login(uuid, jsonb) to authenticated;
