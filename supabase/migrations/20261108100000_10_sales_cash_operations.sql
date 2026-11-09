-- Opérations de caisse et de vente.
-- Toutes les écritures passent par des fonctions security definer : les tables
-- de vente restent en lecture seule pour les clients. Chaque appel est idempotent
-- grâce à l'identifiant fourni par le terminal, ce qui permet de rejouer la file
-- hors ligne sans doubler une vente ni un mouvement de stock.

create unique index sales_reference_ci_unique
  on public.sales (boutique_id, lower(reference));

create or replace function public.open_cash_session(
  p_id uuid,
  p_device_id uuid,
  p_fond_ouverture_xof integer,
  p_ouverte_at timestamptz default now()
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_role public.app_role := app_private.require_role(array['admin', 'cashier']::public.app_role[]);
  v_boutique uuid;
  v_ouverte_at timestamptz := coalesce(p_ouverte_at, now());
  v_existing public.cash_sessions%rowtype;
begin
  if p_id is null then
    raise exception 'L’identifiant de la session est obligatoire.' using errcode = '22023';
  end if;
  if p_device_id is null then
    raise exception 'L’appareil est obligatoire pour ouvrir une caisse.' using errcode = '22023';
  end if;
  if p_fond_ouverture_xof is null or p_fond_ouverture_xof < 0 then
    raise exception 'Le fond de caisse doit être un montant positif ou nul.' using errcode = '22023';
  end if;
  if v_ouverte_at > now() + interval '1 day' then
    raise exception 'La date d’ouverture ne peut pas être dans le futur.' using errcode = '22023';
  end if;

  select p.boutique_id into v_boutique
  from public.profiles p
  where p.id = auth.uid() and p.actif;

  if v_boutique is null then
    raise exception 'Compte inactif ou non authentifié.' using errcode = '42501';
  end if;

  if not exists (
    select 1 from public.devices d
    where d.id = p_device_id
      and d.boutique_id = v_boutique
      and d.revoked_at is null
  ) then
    raise exception 'Appareil inconnu ou révoqué.' using errcode = 'P0002';
  end if;

  select * into v_existing from public.cash_sessions where id = p_id;
  if found then
    if v_existing.boutique_id = v_boutique
      and v_existing.device_id = p_device_id
      and v_existing.ouverte_par = auth.uid()
      and v_existing.fond_ouverture_xof = p_fond_ouverture_xof then
      return jsonb_build_object(
        'id', v_existing.id,
        'statut', v_existing.statut,
        'ouverte_at', v_existing.ouverte_at,
        'fond_ouverture_xof', v_existing.fond_ouverture_xof,
        'rejoue', true
      );
    end if;
    raise exception 'Cet identifiant de session est déjà utilisé avec un autre contenu.'
      using errcode = '23505';
  end if;

  if exists (
    select 1 from public.cash_sessions cs
    where cs.device_id = p_device_id and cs.statut = 'open'
  ) then
    raise exception 'Une caisse est déjà ouverte sur cet appareil. Clôture-la d’abord.'
      using errcode = '23505';
  end if;

  insert into public.cash_sessions (
    id, boutique_id, device_id, ouverte_par, ouverte_at, fond_ouverture_xof
  )
  values (p_id, v_boutique, p_device_id, auth.uid(), v_ouverte_at, p_fond_ouverture_xof);

  insert into public.audit_log (
    boutique_id, user_id, device_id, action, entity, entity_id, details
  )
  values (
    v_boutique,
    auth.uid(),
    p_device_id,
    'cash_session_opened',
    'cash_sessions',
    p_id::text,
    jsonb_build_object(
      'role', v_role,
      'fond_ouverture_xof', p_fond_ouverture_xof,
      'ouverte_at', v_ouverte_at
    )
  );

  return jsonb_build_object(
    'id', p_id,
    'statut', 'open',
    'ouverte_at', v_ouverte_at,
    'fond_ouverture_xof', p_fond_ouverture_xof,
    'rejoue', false
  );
end;
$$;

create or replace function public.close_cash_session(
  p_id uuid,
  p_device_id uuid,
  p_montant_compte_xof integer,
  p_fermee_at timestamptz default now()
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_role public.app_role := app_private.require_role(array['admin', 'cashier']::public.app_role[]);
  v_boutique uuid;
  v_session public.cash_sessions%rowtype;
  v_fermee_at timestamptz := coalesce(p_fermee_at, now());
  v_expected integer;
  v_gap integer;
  v_severity public.alert_severity;
begin
  if p_id is null then
    raise exception 'L’identifiant de la session est obligatoire.' using errcode = '22023';
  end if;
  if p_montant_compte_xof is null or p_montant_compte_xof < 0 then
    raise exception 'Le montant compté doit être un entier positif ou nul.' using errcode = '22023';
  end if;
  if p_device_id is null then
    raise exception 'L’appareil est obligatoire pour clôturer une caisse.' using errcode = '22023';
  end if;

  select p.boutique_id into v_boutique
  from public.profiles p
  where p.id = auth.uid() and p.actif;

  if v_boutique is null then
    raise exception 'Compte inactif ou non authentifié.' using errcode = '42501';
  end if;

  select * into v_session
  from public.cash_sessions
  where id = p_id and boutique_id = v_boutique
  for update;

  if not found then
    raise exception 'Session de caisse introuvable.' using errcode = 'P0002';
  end if;

  if v_role <> 'admin' and v_session.ouverte_par <> auth.uid() then
    raise exception 'Seul le caissier qui a ouvert cette caisse peut la clôturer.'
      using errcode = '42501';
  end if;

  if v_session.device_id <> p_device_id then
    raise exception 'Cette caisse a été ouverte sur un autre appareil.' using errcode = '22023';
  end if;

  if v_session.statut = 'closed' then
    if v_session.montant_compte_xof = p_montant_compte_xof then
      return jsonb_build_object(
        'id', v_session.id,
        'statut', v_session.statut,
        'montant_attendu_xof', v_session.montant_attendu_xof,
        'montant_compte_xof', v_session.montant_compte_xof,
        'ecart_xof', v_session.ecart_xof,
        'fermee_at', v_session.fermee_at,
        'rejoue', true
      );
    end if;
    raise exception 'Cette session est déjà clôturée avec un autre montant compté.'
      using errcode = '23505';
  end if;

  if v_fermee_at < v_session.ouverte_at then
    raise exception 'La date de clôture précède l’ouverture de la caisse.' using errcode = '22023';
  end if;

  select v_session.fond_ouverture_xof + coalesce(
    sum(case when cm.direction = 'in' then cm.montant_xof else -cm.montant_xof end),
    0
  )
  into v_expected
  from public.cash_movements cm
  where cm.session_id = v_session.id;

  if v_expected < 0 then
    raise exception 'Les mouvements rendent le montant attendu négatif. Vérifie les opérations.'
      using errcode = '23514';
  end if;

  v_gap := p_montant_compte_xof - v_expected;

  update public.cash_sessions
  set statut = 'closed',
      fermee_par = auth.uid(),
      fermee_at = v_fermee_at,
      montant_attendu_xof = v_expected,
      montant_compte_xof = p_montant_compte_xof,
      ecart_xof = v_gap
  where id = v_session.id;

  if v_gap <> 0 then
    v_severity := case when abs(v_gap) >= 5000 then 'critical' else 'warning' end;
    insert into public.alerts (
      boutique_id, type, severity, message, cash_session_id
    )
    values (
      v_boutique,
      'cash_gap',
      v_severity,
      left(
        format(
          'Écart de caisse à la clôture : %s XOF comptés pour %s attendus (écart %s).',
          p_montant_compte_xof,
          v_expected,
          v_gap
        ),
        300
      ),
      v_session.id
    );
  end if;

  insert into public.audit_log (
    boutique_id, user_id, device_id, action, entity, entity_id, details
  )
  values (
    v_boutique,
    auth.uid(),
    p_device_id,
    'cash_session_closed',
    'cash_sessions',
    v_session.id::text,
    jsonb_build_object(
      'role', v_role,
      'fond_ouverture_xof', v_session.fond_ouverture_xof,
      'montant_attendu_xof', v_expected,
      'montant_compte_xof', p_montant_compte_xof,
      'ecart_xof', v_gap
    )
  );

  return jsonb_build_object(
    'id', v_session.id,
    'statut', 'closed',
    'montant_attendu_xof', v_expected,
    'montant_compte_xof', p_montant_compte_xof,
    'ecart_xof', v_gap,
    'fermee_at', v_fermee_at,
    'rejoue', false
  );
end;
$$;

create or replace function public.create_sale(
  p_id uuid,
  p_device_id uuid,
  p_cash_session_id uuid,
  p_reference text,
  p_date_vente timestamptz,
  p_remise_xof integer,
  p_remise_motif text,
  p_lines jsonb,
  p_payments jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_role public.app_role := app_private.require_role(array['admin', 'cashier']::public.app_role[]);
  v_boutique uuid;
  v_reference text := btrim(coalesce(p_reference, ''));
  v_date timestamptz := coalesce(p_date_vente, now());
  v_remise integer := coalesce(p_remise_xof, 0);
  v_motif text := nullif(btrim(coalesce(p_remise_motif, '')), '');
  v_existing public.sales%rowtype;
  v_session public.cash_sessions%rowtype;
  v_line jsonb;
  v_payment jsonb;
  v_variant public.variants%rowtype;
  v_article_nom text;
  v_variant_id uuid;
  v_line_id uuid;
  v_qte numeric;
  v_unite public.sale_unit;
  v_cm_input integer;
  v_cm_price integer;
  v_stock integer;
  v_price integer;
  v_price_input numeric;
  v_old_price integer;
  v_cost_unit integer;
  v_old_cost integer;
  v_cost_total integer;
  v_line_total integer;
  v_sous_total integer := 0;
  v_total integer;
  v_method public.payment_method;
  v_amount integer;
  v_amount_input numeric;
  v_received integer;
  v_received_input numeric;
  v_mobile_reference text;
  v_paid integer := 0;
  v_line_count integer;
  v_payment_count integer;
  v_lines_out jsonb := '[]'::jsonb;
  v_payments_out jsonb := '[]'::jsonb;
begin
  if p_id is null then
    raise exception 'L’identifiant de la vente est obligatoire.' using errcode = '22023';
  end if;
  if p_device_id is null then
    raise exception 'L’appareil est obligatoire pour enregistrer une vente.' using errcode = '22023';
  end if;
  if length(v_reference) < 1 or length(v_reference) > 40 then
    raise exception 'La référence de la vente doit contenir entre 1 et 40 caractères.'
      using errcode = '22023';
  end if;
  if v_remise < 0 then
    raise exception 'La remise doit être un montant positif ou nul.' using errcode = '22023';
  end if;
  if v_date > now() + interval '1 day' then
    raise exception 'La date de la vente ne peut pas être dans le futur.' using errcode = '22023';
  end if;
  if v_remise > 0 and v_role <> 'admin' then
    raise exception 'Les remises sont réservées aux administrateurs connectés.'
      using errcode = '42501';
  end if;
  if v_remise = 0 then
    v_motif := null;
  elsif v_motif is null or length(v_motif) < 3 then
    raise exception 'Un motif de 3 caractères minimum est obligatoire pour une remise.'
      using errcode = '22023';
  end if;

  select p.boutique_id into v_boutique
  from public.profiles p
  where p.id = auth.uid() and p.actif;

  if v_boutique is null then
    raise exception 'Compte inactif ou non authentifié.' using errcode = '42501';
  end if;

  if not exists (
    select 1 from public.devices d
    where d.id = p_device_id
      and d.boutique_id = v_boutique
      and d.revoked_at is null
  ) then
    raise exception 'Appareil inconnu ou révoqué.' using errcode = 'P0002';
  end if;

  if p_cash_session_id is null then
    raise exception 'Une vente doit être rattachée à une session de caisse ouverte.'
      using errcode = '22023';
  end if;

  select * into v_session
  from public.cash_sessions
  where id = p_cash_session_id and boutique_id = v_boutique
  for update;

  if not found then
    raise exception 'Session de caisse introuvable.' using errcode = 'P0002';
  end if;
  if v_session.statut <> 'open' then
    raise exception 'La session de caisse est déjà clôturée.' using errcode = '22023';
  end if;
  if v_session.device_id <> p_device_id then
    raise exception 'Cette session de caisse a été ouverte sur un autre appareil.'
      using errcode = '22023';
  end if;
  if v_role <> 'admin' and v_session.ouverte_par <> auth.uid() then
    raise exception 'Cette session de caisse appartient à un autre caissier.'
      using errcode = '42501';
  end if;

  select * into v_existing from public.sales where id = p_id;
  if found then
    if v_existing.boutique_id = v_boutique
      and v_existing.reference = v_reference
      and v_existing.device_id = p_device_id
      and v_existing.caissier_id = auth.uid()
      and v_existing.date_vente = v_date then
      return jsonb_build_object(
        'id', v_existing.id,
        'reference', v_existing.reference,
        'statut', v_existing.statut,
        'sous_total_xof', v_existing.sous_total_xof,
        'remise_xof', v_existing.remise_xof,
        'total_xof', v_existing.total_xof,
        'date_vente', v_existing.date_vente,
        'rejoue', true
      );
    end if;
    raise exception 'Cet identifiant de vente est déjà utilisé avec un autre contenu.'
      using errcode = '23505';
  end if;

  if exists (
    select 1 from public.sales s
    where s.boutique_id = v_boutique and lower(s.reference) = lower(v_reference)
  ) then
    raise exception 'La référence « % » est déjà utilisée par une autre vente.', v_reference
      using errcode = '23505';
  end if;

  if p_lines is null or jsonb_typeof(p_lines) <> 'array' then
    raise exception 'La vente ne contient aucune ligne exploitable.' using errcode = '22023';
  end if;
  v_line_count := jsonb_array_length(p_lines);
  if v_line_count = 0 then
    raise exception 'La vente ne contient aucun article.' using errcode = '22023';
  end if;
  if v_line_count > 200 then
    raise exception 'Une vente est limitée à 200 lignes.' using errcode = '22023';
  end if;

  for v_line in select value from jsonb_array_elements(p_lines) loop
    if jsonb_typeof(v_line) <> 'object' then
      raise exception 'Chaque ligne de vente doit être un objet.' using errcode = '22023';
    end if;
    if coalesce(v_line ->> 'variant_id', '') = '' then
      raise exception 'Chaque ligne doit désigner une variante.' using errcode = '22023';
    end if;
    v_variant_id := (v_line ->> 'variant_id')::uuid;

    select v.* into v_variant
    from public.variants v
    where v.id = v_variant_id
      and v.boutique_id = v_boutique
      and v.actif;

    if not found then
      raise exception 'Variante active introuvable.' using errcode = 'P0002';
    end if;

    select a.nom into v_article_nom
    from public.articles a
    where a.id = v_variant.article_id
      and a.boutique_id = v_boutique
      and a.actif;

    if not found then
      raise exception 'Variante active introuvable.' using errcode = 'P0002';
    end if;

    if coalesce(v_line ->> 'quantite_saisie', '') !~ '^[0-9]+(\.[0-9]+)?$' then
      raise exception 'La quantité doit être un nombre positif.' using errcode = '22023';
    end if;
    v_qte := (v_line ->> 'quantite_saisie')::numeric;
    if v_qte <= 0 or v_qte <> round(v_qte, 3) then
      raise exception 'La quantité doit contenir au maximum trois décimales.'
        using errcode = '22023';
    end if;

    if coalesce(v_line ->> 'unite_saisie', '') not in
      ('metre', 'yard', 'centimetre', 'piece') then
      raise exception 'Unité de saisie invalide.' using errcode = '22023';
    end if;
    v_unite := (v_line ->> 'unite_saisie')::public.sale_unit;

    if v_variant.dimension = 'length' and v_unite not in ('metre', 'yard', 'centimetre') then
      raise exception 'Cet article se vend au mètre, au yard ou au centimètre.'
        using errcode = '22023';
    end if;
    if v_variant.dimension = 'unit' and v_unite <> 'piece' then
      raise exception 'Cet article se vend à la pièce.' using errcode = '22023';
    end if;
    if v_unite = 'piece' and v_qte <> trunc(v_qte) then
      raise exception 'La quantité doit être un nombre entier de pièces.' using errcode = '22023';
    end if;

    v_cm_input := case v_unite
      when 'metre' then 100
      when 'yard' then 90
      else 1
    end;
    v_cm_price := case v_variant.unite_vente
      when 'metre' then 100
      when 'yard' then 90
      else 1
    end;

    v_stock := round(v_qte * v_cm_input)::integer;
    if v_stock <= 0 then
      raise exception 'La quantité est trop petite pour être enregistrée.' using errcode = '22023';
    end if;
    if v_stock > 1000000000 then
      raise exception 'La quantité dépasse la limite autorisée.' using errcode = '22023';
    end if;

    v_price := v_variant.prix_vente_xof;
    select ph.ancien_prix_vente_xof into v_old_price
    from public.price_history ph
    where ph.variant_id = v_variant.id
      and ph.nouveau_prix_vente_xof is not null
      and ph.change_at > v_date
    order by ph.change_at asc, ph.id asc
    limit 1;
    if found and v_old_price is not null then
      v_price := v_old_price;
    end if;

    if coalesce(v_line ->> 'prix_unitaire_xof', '') !~ '^[0-9]+$' then
      raise exception 'Le prix unitaire doit être un montant entier.' using errcode = '22023';
    end if;
    v_price_input := (v_line ->> 'prix_unitaire_xof')::numeric;
    if v_price_input > 1000000000 then
      raise exception 'Le prix unitaire dépasse la limite autorisée.' using errcode = '22023';
    end if;
    if v_price_input <> v_price then
      raise exception 'Le prix de % a changé : % XOF attendu, % reçu. Vérifie le panier.',
        v_article_nom, v_price, v_price_input
        using errcode = '22023';
    end if;

    v_line_total := round(v_qte * v_cm_input * v_price / v_cm_price)::integer;
    if v_line_total < 0 or v_line_total > 1000000000 then
      raise exception 'Le montant de la ligne dépasse la limite autorisée.' using errcode = '22023';
    end if;
    v_sous_total := v_sous_total + v_line_total;
    if v_sous_total > 2000000000 then
      raise exception 'Le total de la vente dépasse la limite autorisée.' using errcode = '22023';
    end if;

    select vc.prix_achat_xof into v_cost_unit
    from public.variant_costs vc
    where vc.variant_id = v_variant.id;

    select ph.ancien_prix_achat_xof into v_old_cost
    from public.price_history ph
    where ph.variant_id = v_variant.id
      and ph.nouveau_prix_achat_xof is not null
      and ph.change_at > v_date
    order by ph.change_at asc, ph.id asc
    limit 1;
    if found and v_old_cost is not null then
      v_cost_unit := v_old_cost;
    end if;

    if v_cost_unit is not null then
      v_cost_total := round(v_qte * v_cm_input * v_cost_unit / v_cm_price)::integer;
    else
      v_cost_total := null;
    end if;

    v_line_id := gen_random_uuid();
    v_lines_out := v_lines_out || jsonb_build_array(
      jsonb_build_object(
        'id', v_line_id,
        'variant_id', v_variant.id,
        'designation', left(v_article_nom || ' — ' || v_variant.couleur, 200),
        'quantite_saisie', v_qte,
        'unite_saisie', v_unite,
        'quantite_stock', v_stock,
        'prix_unitaire_xof', v_price,
        'prix_par', v_variant.unite_vente,
        'total_xof', v_line_total,
        'cout_total_xof', v_cost_total
      )
    );
  end loop;

  v_total := v_sous_total - v_remise;
  if v_total < 0 then
    raise exception 'La remise ne peut pas dépasser le sous-total.' using errcode = '22023';
  end if;

  if p_payments is null or jsonb_typeof(p_payments) <> 'array' then
    raise exception 'Une vente doit avoir au moins un paiement.' using errcode = '22023';
  end if;
  v_payment_count := jsonb_array_length(p_payments);
  if v_payment_count = 0 then
    raise exception 'Une vente doit avoir au moins un paiement.' using errcode = '22023';
  end if;
  if v_payment_count > 10 then
    raise exception 'Une vente est limitée à 10 paiements.' using errcode = '22023';
  end if;

  for v_payment in select value from jsonb_array_elements(p_payments) loop
    if jsonb_typeof(v_payment) <> 'object' then
      raise exception 'Chaque paiement doit être un objet.' using errcode = '22023';
    end if;
    if coalesce(v_payment ->> 'method', '') not in ('cash', 'tmoney', 'flooz') then
      raise exception 'Moyen de paiement inconnu.' using errcode = '22023';
    end if;
    v_method := (v_payment ->> 'method')::public.payment_method;

    if coalesce(v_payment ->> 'montant_xof', '') !~ '^[0-9]+$' then
      raise exception 'Chaque paiement doit être un montant entier positif.' using errcode = '22023';
    end if;
    v_amount_input := (v_payment ->> 'montant_xof')::numeric;
    if v_amount_input <= 0 or v_amount_input > 1000000000 then
      raise exception 'Chaque paiement doit être un montant entier positif.' using errcode = '22023';
    end if;
    v_amount := v_amount_input::integer;

    v_mobile_reference := nullif(btrim(coalesce(v_payment ->> 'reference_mobile', '')), '');

    if v_method = 'cash' then
      if coalesce(v_payment ->> 'montant_recu_xof', '') !~ '^[0-9]+$' then
        raise exception 'Le montant reçu en espèces est obligatoire.' using errcode = '22023';
      end if;
      v_received_input := (v_payment ->> 'montant_recu_xof')::numeric;
      if v_received_input < v_amount_input or v_received_input > 1000000000 then
        raise exception 'Le montant reçu doit être supérieur ou égal au paiement.'
          using errcode = '22023';
      end if;
      v_received := v_received_input::integer;
      v_mobile_reference := null;
    else
      v_received := null;
      if v_mobile_reference is null or length(v_mobile_reference) < 3 then
        raise exception 'Le numéro de référence Mobile Money est obligatoire.'
          using errcode = '22023';
      end if;
      if length(v_mobile_reference) > 60 then
        raise exception 'La référence Mobile Money est trop longue.' using errcode = '22023';
      end if;
    end if;

    v_paid := v_paid + v_amount;
    v_payments_out := v_payments_out || jsonb_build_array(
      jsonb_build_object(
        'id', gen_random_uuid(),
        'method', v_method,
        'montant_xof', v_amount,
        'reference_mobile', v_mobile_reference,
        'montant_recu_xof', v_received,
        'rendu_xof', case when v_received is null then null else v_received - v_amount end
      )
    );
  end loop;

  if v_paid <> v_total then
    raise exception 'La somme des paiements (% XOF) doit être égale au total (% XOF).',
      v_paid, v_total
      using errcode = '22023';
  end if;

  insert into public.sales (
    id, boutique_id, reference, cash_session_id, caissier_id, device_id, statut,
    date_vente, date_sync, sous_total_xof, remise_xof, total_xof, remise_motif
  )
  values (
    p_id, v_boutique, v_reference, p_cash_session_id, auth.uid(), p_device_id, 'validated',
    v_date, now(), v_sous_total, v_remise, v_total, v_motif
  );

  for v_line in select value from jsonb_array_elements(v_lines_out) loop
    insert into public.sale_lines (
      id, sale_id, boutique_id, kind, variant_id, designation, quantite_saisie,
      unite_saisie, quantite_stock, prix_unitaire_xof, prix_par, total_xof
    )
    values (
      (v_line ->> 'id')::uuid,
      p_id,
      v_boutique,
      'article',
      (v_line ->> 'variant_id')::uuid,
      v_line ->> 'designation',
      (v_line ->> 'quantite_saisie')::numeric,
      (v_line ->> 'unite_saisie')::public.sale_unit,
      (v_line ->> 'quantite_stock')::integer,
      (v_line ->> 'prix_unitaire_xof')::integer,
      (v_line ->> 'prix_par')::public.pricing_unit,
      (v_line ->> 'total_xof')::integer
    );

    if (v_line ->> 'cout_total_xof') is not null then
      insert into public.sale_line_costs (sale_line_id, boutique_id, cout_total_xof)
      values (
        (v_line ->> 'id')::uuid,
        v_boutique,
        (v_line ->> 'cout_total_xof')::integer
      );
    end if;

    insert into public.stock_movements (
      id, boutique_id, variant_id, type, quantite, sale_line_id, device_id,
      created_by, occurred_at
    )
    values (
      gen_random_uuid(),
      v_boutique,
      (v_line ->> 'variant_id')::uuid,
      'sale',
      -((v_line ->> 'quantite_stock')::integer),
      (v_line ->> 'id')::uuid,
      p_device_id,
      auth.uid(),
      v_date
    );
  end loop;

  for v_payment in select value from jsonb_array_elements(v_payments_out) loop
    insert into public.payments (
      id, sale_id, boutique_id, method, montant_xof, cash_session_id,
      reference_mobile, montant_recu_xof, rendu_xof, created_by
    )
    values (
      (v_payment ->> 'id')::uuid,
      p_id,
      v_boutique,
      (v_payment ->> 'method')::public.payment_method,
      (v_payment ->> 'montant_xof')::integer,
      case when v_payment ->> 'method' = 'cash' then p_cash_session_id else null end,
      v_payment ->> 'reference_mobile',
      case
        when v_payment ->> 'method' = 'cash'
          then (v_payment ->> 'montant_recu_xof')::integer
        else null
      end,
      case
        when v_payment ->> 'method' = 'cash'
          then (v_payment ->> 'rendu_xof')::integer
        else null
      end,
      auth.uid()
    );

    if v_payment ->> 'method' = 'cash' then
      insert into public.cash_movements (
        id, boutique_id, session_id, type, direction, montant_xof, sale_id,
        created_by, occurred_at
      )
      values (
        gen_random_uuid(),
        v_boutique,
        p_cash_session_id,
        'sale',
        'in',
        (v_payment ->> 'montant_xof')::integer,
        p_id,
        auth.uid(),
        v_date
      );
    end if;
  end loop;

  insert into public.audit_log (
    boutique_id, user_id, device_id, action, entity, entity_id, details
  )
  values (
    v_boutique,
    auth.uid(),
    p_device_id,
    'sale_created',
    'sales',
    p_id::text,
    jsonb_build_object(
      'role', v_role,
      'reference', v_reference,
      'cash_session_id', p_cash_session_id,
      'lignes', v_line_count,
      'paiements', v_payment_count,
      'sous_total_xof', v_sous_total,
      'remise_xof', v_remise,
      'total_xof', v_total,
      'date_vente', v_date
    )
  );

  return jsonb_build_object(
    'id', p_id,
    'reference', v_reference,
    'statut', 'validated',
    'sous_total_xof', v_sous_total,
    'remise_xof', v_remise,
    'total_xof', v_total,
    'date_vente', v_date,
    'rejoue', false
  );
end;
$$;

revoke all on function public.open_cash_session(uuid, uuid, integer, timestamptz) from public;
revoke all on function public.close_cash_session(uuid, uuid, integer, timestamptz) from public;
revoke all on function public.create_sale(
  uuid, uuid, uuid, text, timestamptz, integer, text, jsonb, jsonb
) from public;

grant execute on function public.open_cash_session(uuid, uuid, integer, timestamptz)
  to authenticated;
grant execute on function public.close_cash_session(uuid, uuid, integer, timestamptz)
  to authenticated;
grant execute on function public.create_sale(
  uuid, uuid, uuid, text, timestamptz, integer, text, jsonb, jsonb
) to authenticated;
