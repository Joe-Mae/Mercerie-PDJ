-- Abonnements aux notifications Web Push.
-- Le navigateur fournit un endpoint et une paire de clés propres à l'appareil.
-- L'écriture passe par des fonctions security definer : un compte ne peut
-- enregistrer que son propre abonnement et le révoquer, jamais le supprimer.

alter table public.push_subscriptions
  add column updated_at timestamptz not null default now();

create index push_subscriptions_boutique_idx
  on public.push_subscriptions (boutique_id)
  where revoked_at is null;

create or replace function public.register_push_subscription(
  p_endpoint text,
  p_p256dh text,
  p_auth text,
  p_device_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_user uuid := auth.uid();
  v_boutique uuid;
  v_endpoint text := btrim(coalesce(p_endpoint, ''));
  v_p256dh text := btrim(coalesce(p_p256dh, ''));
  v_auth text := btrim(coalesce(p_auth, ''));
  v_existing public.push_subscriptions%rowtype;
  v_id uuid;
  v_created boolean := false;
  v_reassigned boolean := false;
begin
  perform app_private.require_role(array['admin', 'cashier']::public.app_role[]);

  select p.boutique_id into v_boutique
  from public.profiles p
  where p.id = v_user and p.actif;

  if v_boutique is null then
    raise exception 'Compte inactif ou non authentifié.' using errcode = '42501';
  end if;

  if length(v_endpoint) < 20 or length(v_endpoint) > 2000 or v_endpoint !~ '^https://' then
    raise exception 'Adresse d’abonnement invalide.' using errcode = '22023';
  end if;

  if length(v_p256dh) < 20 or length(v_p256dh) > 300
    or length(v_auth) < 8 or length(v_auth) > 100 then
    raise exception 'Clés de notification invalides.' using errcode = '22023';
  end if;

  if p_device_id is not null and not exists (
    select 1 from public.devices d
    where d.id = p_device_id and d.boutique_id = v_boutique and d.revoked_at is null
  ) then
    raise exception 'Appareil inconnu ou révoqué.' using errcode = 'P0002';
  end if;

  -- Un même endpoint peut être repris par un autre compte sur un appareil
  -- partagé. Le verrou évite deux inscriptions simultanées.
  perform pg_advisory_xact_lock(hashtextextended(v_endpoint, 0));

  select * into v_existing
  from public.push_subscriptions
  where endpoint = v_endpoint
  for update;

  if found then
    if v_existing.boutique_id <> v_boutique then
      raise exception 'Cet abonnement appartient à une autre boutique.' using errcode = '42501';
    end if;

    v_reassigned := v_existing.user_id <> v_user;

    update public.push_subscriptions
    set user_id = v_user,
        device_id = p_device_id,
        p256dh = v_p256dh,
        auth = v_auth,
        revoked_at = null,
        updated_at = now()
    where id = v_existing.id
    returning id into v_id;
  else
    insert into public.push_subscriptions (
      boutique_id, user_id, device_id, endpoint, p256dh, auth
    )
    values (v_boutique, v_user, p_device_id, v_endpoint, v_p256dh, v_auth)
    returning id into v_id;
    v_created := true;
  end if;

  if v_created or v_reassigned then
    insert into public.audit_log (boutique_id, user_id, device_id, action, entity, entity_id, details)
    values (
      v_boutique, v_user, p_device_id, 'push_subscription_registered',
      'push_subscriptions', v_id::text,
      jsonb_build_object(
        'created', v_created,
        'reassigned', v_reassigned,
        'endpoint_host', split_part(v_endpoint, '/', 3)
      )
    );
  end if;

  return jsonb_build_object(
    'id', v_id,
    'created', v_created,
    'reassigned', v_reassigned
  );
end;
$$;

create or replace function public.revoke_push_subscription(p_endpoint text)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_user uuid := auth.uid();
  v_boutique uuid;
  v_endpoint text := btrim(coalesce(p_endpoint, ''));
  v_id uuid;
begin
  select p.boutique_id into v_boutique
  from public.profiles p
  where p.id = v_user and p.actif;

  if v_boutique is null then
    raise exception 'Compte inactif ou non authentifié.' using errcode = '42501';
  end if;

  update public.push_subscriptions
  set revoked_at = now(),
      updated_at = now()
  where endpoint = v_endpoint
    and user_id = v_user
    and boutique_id = v_boutique
    and revoked_at is null
  returning id into v_id;

  if v_id is null then
    return jsonb_build_object('revoked', false);
  end if;

  insert into public.audit_log (boutique_id, user_id, action, entity, entity_id, details)
  values (
    v_boutique, v_user, 'push_subscription_revoked',
    'push_subscriptions', v_id::text,
    jsonb_build_object('endpoint_host', split_part(v_endpoint, '/', 3))
  );

  return jsonb_build_object('revoked', true);
end;
$$;

revoke all on function public.register_push_subscription(text, text, text, uuid) from public;
revoke all on function public.revoke_push_subscription(text) from public;
grant execute on function public.register_push_subscription(text, text, text, uuid) to authenticated;
grant execute on function public.revoke_push_subscription(text) to authenticated;

-- Les abonnements ne s'écrivent plus directement depuis le client.
drop policy if exists push_subscriptions_insert_own on public.push_subscriptions;
drop policy if exists push_subscriptions_update_own on public.push_subscriptions;
drop policy if exists push_subscriptions_delete_own on public.push_subscriptions;
revoke insert, update, delete on public.push_subscriptions from authenticated;
