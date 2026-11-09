-- Tableau de bord des ventes.
-- Une seule lecture agrégée pour la page d'accueil : les lignes et les coûts
-- ne sont jamais exposés au client. Le bénéfice est réservé aux administrateurs,
-- même si les caissiers peuvent consulter les montants de vente.

create or replace function public.get_sales_dashboard(p_days integer default 7)
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
  v_window_day date;
  v_today_start timestamptz;
  v_tomorrow_start timestamptz;
  v_yesterday_start timestamptz;
  v_window_start timestamptz;
  v_revenue bigint;
  v_yesterday bigint;
  v_tickets integer;
  v_cash bigint;
  v_mobile bigint;
  v_cost bigint;
  v_lines integer;
  v_lines_cost integer;
  v_profit bigint;
  v_basket bigint;
  v_variation numeric;
  v_series jsonb;
  v_best jsonb;
  v_recent jsonb;
  v_register jsonb;
begin
  if p_days is null or p_days < 1 or p_days > 31 then
    raise exception 'La période doit être comprise entre 1 et 31 jours.'
      using errcode = '22023';
  end if;

  select b.fuseau_horaire into v_tz
  from public.boutiques b
  where b.id = v_boutique;

  if v_tz is null then
    raise exception 'Boutique introuvable.' using errcode = 'P0002';
  end if;

  v_today := (now() at time zone v_tz)::date;
  v_window_day := v_today - (p_days - 1);
  v_today_start := v_today::timestamp at time zone v_tz;
  v_tomorrow_start := (v_today + 1)::timestamp at time zone v_tz;
  v_yesterday_start := (v_today - 1)::timestamp at time zone v_tz;
  v_window_start := v_window_day::timestamp at time zone v_tz;

  select coalesce(sum(s.total_xof), 0)::bigint, count(*)::integer
  into v_revenue, v_tickets
  from public.sales s
  where s.boutique_id = v_boutique
    and s.statut = 'validated'
    and s.date_vente >= v_today_start
    and s.date_vente < v_tomorrow_start;

  select coalesce(sum(s.total_xof), 0)::bigint
  into v_yesterday
  from public.sales s
  where s.boutique_id = v_boutique
    and s.statut = 'validated'
    and s.date_vente >= v_yesterday_start
    and s.date_vente < v_today_start;

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
    and s.date_vente >= v_today_start
    and s.date_vente < v_tomorrow_start;

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
    and s.date_vente >= v_today_start
    and s.date_vente < v_tomorrow_start;

  if v_role = 'admin' and v_lines > 0 and v_lines_cost = v_lines then
    v_profit := v_revenue - v_cost;
  end if;

  v_basket := case
    when v_tickets > 0 then round(v_revenue::numeric / v_tickets)::bigint
    else 0
  end;

  v_variation := case
    when v_yesterday > 0 then round((v_revenue - v_yesterday)::numeric * 100 / v_yesterday, 1)
    else null
  end;

  with days as (
    select generate_series(v_window_day, v_today, interval '1 day')::date as jour
  ),
  daily as (
    select
      (s.date_vente at time zone v_tz)::date as jour,
      sum(s.total_xof)::bigint as montant
    from public.sales s
    where s.boutique_id = v_boutique
      and s.statut = 'validated'
      and s.date_vente >= v_window_start
      and s.date_vente < v_tomorrow_start
    group by 1
  )
  select coalesce(
    jsonb_agg(
      jsonb_build_object(
        'jour', to_char(d.jour, 'YYYY-MM-DD'),
        'montant_xof', coalesce(dd.montant, 0)
      )
      order by d.jour
    ),
    '[]'::jsonb
  )
  into v_series
  from days d
  left join daily dd on dd.jour = d.jour;

  select coalesce(
    jsonb_agg(
      jsonb_build_object(
        'article_id', t.article_id,
        'nom', t.nom,
        'dimension', t.dimension,
        'quantite', t.quantite,
        'montant_xof', t.montant
      )
      order by t.montant desc, t.nom asc
    ),
    '[]'::jsonb
  )
  into v_best
  from (
    select
      a.id as article_id,
      a.nom,
      a.dimension,
      round(
        sum(sl.quantite_stock)::numeric
          / case when a.dimension = 'length' then 100 else 1 end,
        2
      ) as quantite,
      sum(sl.total_xof)::bigint as montant
    from public.sale_lines sl
    join public.sales s on s.id = sl.sale_id and s.boutique_id = sl.boutique_id
    join public.variants v on v.id = sl.variant_id and v.boutique_id = sl.boutique_id
    join public.articles a on a.id = v.article_id and a.boutique_id = v.boutique_id
    where sl.boutique_id = v_boutique
      and sl.kind = 'article'
      and s.statut = 'validated'
      and s.date_vente >= v_window_start
      and s.date_vente < v_tomorrow_start
    group by a.id, a.nom, a.dimension
    order by montant desc, a.nom asc
    limit 4
  ) t;

  select coalesce(
    jsonb_agg(
      jsonb_build_object(
        'id', t.id,
        'reference', t.reference,
        'date_vente', t.date_vente,
        'lignes', t.lignes,
        'total_xof', t.total_xof,
        'caissier', t.caissier,
        'methodes', t.methodes
      )
      order by t.date_vente desc, t.created_at desc
    ),
    '[]'::jsonb
  )
  into v_recent
  from (
    select
      s.id,
      s.reference,
      s.date_vente,
      s.created_at,
      s.total_xof,
      (select count(*)::integer from public.sale_lines sl where sl.sale_id = s.id) as lignes,
      pr.nom as caissier,
      coalesce(
        (
          select jsonb_agg(distinct pm.method::text)
          from public.payments pm
          where pm.sale_id = s.id and pm.boutique_id = s.boutique_id
        ),
        '[]'::jsonb
      ) as methodes
    from public.sales s
    join public.profiles pr on pr.id = s.caissier_id
    where s.boutique_id = v_boutique
      and s.statut = 'validated'
    order by s.date_vente desc, s.created_at desc
    limit 5
  ) t;

  if v_role = 'cashier' then
    select jsonb_build_object(
      'ouverte_at', cs.ouverte_at,
      'fond_ouverture_xof', cs.fond_ouverture_xof
    )
    into v_register
    from public.cash_sessions cs
    where cs.boutique_id = v_boutique
      and cs.statut = 'open'
      and cs.ouverte_par = auth.uid()
    order by cs.ouverte_at desc
    limit 1;
  end if;

  return jsonb_build_object(
    'role', v_role::text,
    'jour', to_char(v_today, 'YYYY-MM-DD'),
    'periode_jours', p_days,
    'ventes_jour_xof', v_revenue,
    'ventes_hier_xof', v_yesterday,
    'variation_pct', v_variation,
    'tickets_jour', v_tickets,
    'panier_moyen_xof', v_basket,
    'especes_jour_xof', v_cash,
    'mobile_jour_xof', v_mobile,
    'benefice_jour_xof', v_profit,
    'cout_jour_xof', case when v_role = 'admin' then v_cost else null end,
    'lignes_jour', v_lines,
    'lignes_avec_cout_jour', v_lines_cost,
    'serie', v_series,
    'meilleures_ventes', v_best,
    'dernieres_ventes', v_recent,
    'caisse', v_register
  );
end;
$$;

revoke all on function public.get_sales_dashboard(integer) from public;
grant execute on function public.get_sales_dashboard(integer) to authenticated;
