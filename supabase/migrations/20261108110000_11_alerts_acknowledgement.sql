-- Acquittement humain des alertes.
-- resolved_at reste piloté par le système (retour de stock, régularisation…).
-- acknowledged_at trace la prise en charge par un administrateur : aucune
-- alerte n'est supprimée, et l'acquittement est journalisé dans audit_log.

alter table public.alerts
  add column acknowledged_at timestamptz,
  add column acknowledged_by uuid references public.profiles (id) on delete set null;

create index alerts_unacknowledged_idx
  on public.alerts (boutique_id, created_at desc)
  where acknowledged_at is null and resolved_at is null;

create or replace function public.acknowledge_alert(p_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_role public.app_role := app_private.require_role(array['admin']::public.app_role[]);
  v_boutique uuid;
  v_alert public.alerts%rowtype;
  v_now timestamptz;
begin
  if p_id is null then
    raise exception 'L’identifiant de l’alerte est obligatoire.' using errcode = '22023';
  end if;

  select p.boutique_id into v_boutique
  from public.profiles p
  where p.id = auth.uid() and p.actif;

  if v_boutique is null then
    raise exception 'Compte inactif ou non authentifié.' using errcode = '42501';
  end if;

  select * into v_alert
  from public.alerts
  where id = p_id and boutique_id = v_boutique
  for update;

  if not found then
    raise exception 'Alerte introuvable.' using errcode = 'P0002';
  end if;

  if v_alert.acknowledged_at is not null then
    return jsonb_build_object(
      'id', v_alert.id,
      'acknowledged_at', v_alert.acknowledged_at,
      'acknowledged_by', v_alert.acknowledged_by,
      'rejoue', true
    );
  end if;

  update public.alerts
  set acknowledged_at = now(),
      acknowledged_by = auth.uid()
  where id = v_alert.id
  returning acknowledged_at into v_now;

  insert into public.audit_log (
    boutique_id, user_id, action, entity, entity_id, details
  )
  values (
    v_boutique,
    auth.uid(),
    'alert_acknowledged',
    'alerts',
    v_alert.id::text,
    jsonb_build_object(
      'role', v_role,
      'type', v_alert.type,
      'severity', v_alert.severity,
      'resolved', v_alert.resolved_at is not null
    )
  );

  return jsonb_build_object(
    'id', v_alert.id,
    'acknowledged_at', v_now,
    'acknowledged_by', auth.uid(),
    'rejoue', false
  );
end;
$$;

revoke all on function public.acknowledge_alert(uuid) from public;
grant execute on function public.acknowledge_alert(uuid) to authenticated;
