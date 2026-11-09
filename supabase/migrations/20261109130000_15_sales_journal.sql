-- Journal des ventes.
-- Les tickets d'une journée restent lisibles par l'équipe de caisse, y compris
-- les ventes annulées : une annulation laisse une trace et ne supprime rien.
-- Les tickets annulés sont exclus des totaux encaissés. Le bénéfice et les
-- coûts d'achat restent réservés aux administrateurs.

create or replace function public.get_sales_journal(p_day date default null)
returns jsonb
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
declare
  v_role public.app_role := app_private.require_role(
    array['admin', 'cashier']::public.app_role[]
  );
  v_boutique uuid := app_private.current_boutique_id();
  v_tz text;
  v_today date;
  v_day date;
  v_start timestamptz;
  v_end timestamptz;
  v_last_day date;
  v_tickets_validated integer;
  v_tickets_cancelled integer;
  v_revenue bigint;
  v_discount bigint;
  v_cash bigint;
  v_mobile bigint;
  v_cost bigint;
  v_lines integer;
  v_lines_cost integer;
  v_profit bigint;
  v_tickets jsonb;
begin
  select b.fuseau_horaire into v_tz
  from public.boutiques b
  where b.id = v_boutique;

  if v_tz is null then
    raise exception 'Boutique introuvable.' using errcode = 'P0002';
  end if;

  v_today := (now() at time zone v_tz)::date;
  v_day := coalesce(p_day, v_today);

  if v_day > v_today then
    raise exception 'Le journal ne peut pas afficher une journée à venir.'
      using errcode = '22023';
  end if;

  v_start := v_day::timestamp at time zone v_tz;
  v_end := (v_day + 1)::timestamp at time zone v_tz;

  select
    count(*) filter (where s.statut = 'validated')::integer,
    count(*) filter (where s.statut = 'cancelled')::integer,
    coalesce(sum(s.total_xof) filter (where s.statut = 'validated'), 0)::bigint,
    coalesce(sum(s.remise_xof) filter (where s.statut = 'validated'), 0)::bigint
  into v_tickets_validated, v_tickets_cancelled, v_revenue, v_discount
  from public.sales s
  where s.boutique_id = v_boutique
    and s.date_vente >= v_start
    and s.date_vente < v_end;

  select
    coalesce(sum(case when p.method = 'cash' then p.montant_xof else 0 end), 0)::bigint,
    coalesce(
      sum(case when p.method in ('tmoney', 'flooz') then p.montant_xof else 0 end),
      0
    )::bigint
  into v_cash, v_mobile
  from public.payments p
  join public.sales s on s.id = p.sale_id and s.boutique_id = p.boutique_id
  where s.boutique_id = v_boutique
    and s.statut = 'validated'
    and s.date_vente >= v_start
    and s.date_vente < v_end;

  select
    coalesce(sum(c.cout_total_xof), 0)::bigint,
    count(sl.id)::integer,
    count(c.sale_line_id)::integer
  into v_cost, v_lines, v_lines_cost
  from public.sale_lines sl
  join public.sales s on s.id = sl.sale_id and s.boutique_id = sl.boutique_id
  left join public.sale_line_costs c
    on c.sale_line_id = sl.id and c.boutique_id = sl.boutique_id
  where s.boutique_id = v_boutique
    and s.statut = 'validated'
    and s.date_vente >= v_start
    and s.date_vente < v_end;

  if v_role = 'admin' and v_lines > 0 and v_lines_cost = v_lines then
    v_profit := v_revenue - v_cost;
  end if;

  select max((s.date_vente at time zone v_tz)::date)
  into v_last_day
  from public.sales s
  where s.boutique_id = v_boutique
    and s.statut = 'validated'
    and s.date_vente < ((v_today + 1)::timestamp at time zone v_tz);

  select coalesce(
    jsonb_agg(
      jsonb_build_object(
        'id', t.id,
        'reference', t.reference,
        'statut', t.statut,
        'date_vente', t.date_vente,
        'heure', t.heure,
        'lignes', t.lignes,
        'total_xof', t.total_xof,
        'remise_xof', t.remise_xof,
        'caissier', t.caissier,
        'methodes', t.methodes,
        'annulee_at', t.annulee_at,
        'annulee_par', t.annulee_par
      )
      order by t.date_vente desc, t.created_at desc
    ),
    '[]'::jsonb
  )
  into v_tickets
  from (
    select
      s.id,
      s.reference,
      s.statut,
      s.date_vente,
      s.created_at,
      s.total_xof,
      s.remise_xof,
      s.annulee_at,
      to_char(s.date_vente at time zone v_tz, 'HH24:MI') as heure,
      (
        select count(*)::integer
        from public.sale_lines sl
        where sl.sale_id = s.id and sl.boutique_id = s.boutique_id
      ) as lignes,
      pr.nom as caissier,
      coalesce(
        (
          select jsonb_agg(distinct pm.method::text)
          from public.payments pm
          where pm.sale_id = s.id and pm.boutique_id = s.boutique_id
        ),
        '[]'::jsonb
      ) as methodes,
      ap.nom as annulee_par
    from public.sales s
    join public.profiles pr on pr.id = s.caissier_id
    left join public.profiles ap on ap.id = s.annulee_par
    where s.boutique_id = v_boutique
      and s.date_vente >= v_start
      and s.date_vente < v_end
  ) t;

  return jsonb_build_object(
    'role', v_role::text,
    'jour', to_char(v_day, 'YYYY-MM-DD'),
    'aujourd_hui', to_char(v_today, 'YYYY-MM-DD'),
    'dernier_jour_vente', case
      when v_last_day is null then null
      else to_char(v_last_day, 'YYYY-MM-DD')
    end,
    'tickets_valides', v_tickets_validated,
    'tickets_annules', v_tickets_cancelled,
    'total_xof', v_revenue,
    'remise_xof', v_discount,
    'especes_xof', v_cash,
    'mobile_xof', v_mobile,
    'cout_xof', case when v_role = 'admin' then v_cost else null end,
    'benefice_xof', v_profit,
    'tickets', v_tickets
  );
end;
$$;

revoke all on function public.get_sales_journal(date) from public;
grant execute on function public.get_sales_journal(date) to authenticated;
