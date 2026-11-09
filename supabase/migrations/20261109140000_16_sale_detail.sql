-- Aperçu d'une vente, façon facture.
-- Le détail sert au contrôle du ticket : lignes vendues, remise et paiements.
-- Les coûts d'achat restent hors de cette réponse, même pour un administrateur ;
-- la marge se consulte sur le tableau de bord et le journal.

create or replace function public.get_sale_detail(p_sale_id uuid)
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
  v_sale public.sales;
  v_tz text;
  v_caissier text;
  v_annulee_par text;
  v_lignes jsonb;
  v_paiements jsonb;
begin
  select s.* into v_sale
  from public.sales s
  where s.id = p_sale_id
    and s.boutique_id = v_boutique;

  if not found then
    raise exception 'Vente introuvable.' using errcode = 'P0002';
  end if;

  select b.fuseau_horaire into v_tz
  from public.boutiques b
  where b.id = v_boutique;

  select p.nom into v_caissier
  from public.profiles p
  where p.id = v_sale.caissier_id;

  if v_sale.annulee_par is not null then
    select p.nom into v_annulee_par
    from public.profiles p
    where p.id = v_sale.annulee_par;
  end if;

  select coalesce(
    jsonb_agg(
      jsonb_build_object(
        'id', l.id,
        'kind', l.kind,
        'designation', l.designation,
        'quantite_saisie', l.quantite_saisie,
        'unite_saisie', l.unite_saisie,
        'prix_unitaire_xof', l.prix_unitaire_xof,
        'prix_par', l.prix_par,
        'total_xof', l.total_xof
      )
      order by l.designation, l.id
    ),
    '[]'::jsonb
  )
  into v_lignes
  from public.sale_lines l
  where l.sale_id = v_sale.id
    and l.boutique_id = v_boutique;

  select coalesce(
    jsonb_agg(
      jsonb_build_object(
        'id', p.id,
        'method', p.method,
        'montant_xof', p.montant_xof,
        'reference_mobile', p.reference_mobile,
        'montant_recu_xof', p.montant_recu_xof,
        'rendu_xof', p.rendu_xof
      )
      order by
        case p.method when 'cash' then 0 when 'tmoney' then 1 else 2 end,
        p.id
    ),
    '[]'::jsonb
  )
  into v_paiements
  from public.payments p
  where p.sale_id = v_sale.id
    and p.boutique_id = v_boutique;

  return jsonb_build_object(
    'id', v_sale.id,
    'reference', v_sale.reference,
    'statut', v_sale.statut,
    'date_vente', v_sale.date_vente,
    'heure', to_char(v_sale.date_vente at time zone coalesce(v_tz, 'UTC'), 'HH24:MI'),
    'caissier', coalesce(v_caissier, 'Inconnu'),
    'sous_total_xof', v_sale.sous_total_xof,
    'remise_xof', v_sale.remise_xof,
    'remise_motif', v_sale.remise_motif,
    'total_xof', v_sale.total_xof,
    'annulee_at', v_sale.annulee_at,
    'annulee_par', v_annulee_par,
    'lignes', v_lignes,
    'paiements', v_paiements
  );
end;
$$;

revoke all on function public.get_sale_detail(uuid) from public;
revoke all on function public.get_sale_detail(uuid) from anon;
grant execute on function public.get_sale_detail(uuid) to authenticated;

-- Les privilèges par défaut de Supabase accordent l'exécution à anon ;
-- le journal est lui aussi réservé aux comptes authentifiés.
revoke all on function public.get_sales_journal(date) from anon;
