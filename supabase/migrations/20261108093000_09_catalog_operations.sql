-- Opérations d'administration du catalogue et du stock.
-- Toutes les écritures passent par des fonctions security definer : les tables
-- restent en lecture seule pour les clients, et le rôle est vérifié côté serveur.

create or replace function app_private.require_admin()
returns uuid
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
declare
  v_user uuid := auth.uid();
  v_boutique uuid;
begin
  perform app_private.require_role(array['admin']::public.app_role[]);
  select p.boutique_id into v_boutique
  from public.profiles p
  where p.id = v_user and p.actif;
  if v_boutique is null then
    raise exception 'Compte inactif ou non authentifié.' using errcode = '42501';
  end if;
  return v_boutique;
end;
$$;

revoke all on function app_private.require_admin() from public;

create or replace function public.create_category(p_nom text, p_code_court text)
returns uuid
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_boutique uuid := app_private.require_admin();
  v_nom text := btrim(coalesce(p_nom, ''));
  v_code text := upper(btrim(coalesce(p_code_court, '')));
  v_id uuid;
begin
  if length(v_nom) < 1 or length(v_nom) > 80 then
    raise exception 'Le nom de la catégorie doit contenir entre 1 et 80 caractères.' using errcode = '22023';
  end if;
  if length(v_code) < 1 or length(v_code) > 20 or v_code !~ '^[A-Z0-9-]+$' then
    raise exception 'Le code court doit contenir 1 à 20 lettres, chiffres ou tirets.' using errcode = '22023';
  end if;

  if exists (
    select 1 from public.categories c
    where c.boutique_id = v_boutique
      and (lower(c.nom) = lower(v_nom) or lower(c.code_court) = lower(v_code))
  ) then
    raise exception 'Cette catégorie existe déjà (même nom ou même code court).' using errcode = '23505';
  end if;

  insert into public.categories (boutique_id, nom, code_court)
  values (v_boutique, v_nom, v_code)
  returning id into v_id;

  insert into public.audit_log (boutique_id, user_id, action, entity, entity_id, details)
  values (
    v_boutique,
    auth.uid(),
    'category_created',
    'categories',
    v_id::text,
    jsonb_build_object('nom', v_nom, 'code_court', v_code)
  );

  return v_id;
end;
$$;

create or replace function public.update_category(
  p_id uuid,
  p_nom text,
  p_code_court text,
  p_actif boolean
)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_boutique uuid := app_private.require_admin();
  v_nom text := btrim(coalesce(p_nom, ''));
  v_code text := upper(btrim(coalesce(p_code_court, '')));
  v_before public.categories%rowtype;
begin
  select * into v_before
  from public.categories
  where id = p_id and boutique_id = v_boutique;

  if not found then
    raise exception 'Catégorie introuvable.' using errcode = 'P0002';
  end if;

  if length(v_nom) < 1 or length(v_nom) > 80 then
    raise exception 'Le nom de la catégorie doit contenir entre 1 et 80 caractères.' using errcode = '22023';
  end if;
  if length(v_code) < 1 or length(v_code) > 20 or v_code !~ '^[A-Z0-9-]+$' then
    raise exception 'Le code court doit contenir 1 à 20 lettres, chiffres ou tirets.' using errcode = '22023';
  end if;

  if exists (
    select 1 from public.categories c
    where c.boutique_id = v_boutique
      and c.id <> p_id
      and (lower(c.nom) = lower(v_nom) or lower(c.code_court) = lower(v_code))
  ) then
    raise exception 'Une autre catégorie utilise déjà ce nom ou ce code court.' using errcode = '23505';
  end if;

  update public.categories
  set nom = v_nom,
      code_court = v_code,
      actif = coalesce(p_actif, actif)
  where id = p_id and boutique_id = v_boutique;

  insert into public.audit_log (boutique_id, user_id, action, entity, entity_id, details)
  values (
    v_boutique,
    auth.uid(),
    'category_updated',
    'categories',
    p_id::text,
    jsonb_build_object(
      'ancien_nom', v_before.nom,
      'nouveau_nom', v_nom,
      'ancien_code', v_before.code_court,
      'nouveau_code', v_code
    )
  );
end;
$$;

create or replace function public.create_variant(
  p_article_id uuid,
  p_couleur text,
  p_code_court text,
  p_unite_vente public.pricing_unit,
  p_prix_vente_xof integer,
  p_prix_achat_xof integer,
  p_seuil_alerte integer,
  p_quantite_initiale integer
)
returns uuid
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_boutique uuid := app_private.require_admin();
  v_article public.articles%rowtype;
  v_couleur text := btrim(coalesce(p_couleur, ''));
  v_code text := upper(btrim(coalesce(p_code_court, '')));
  v_id uuid;
begin
  select * into v_article
  from public.articles
  where id = p_article_id and boutique_id = v_boutique;

  if not found then
    raise exception 'Article introuvable.' using errcode = 'P0002';
  end if;

  if length(v_couleur) < 1 or length(v_couleur) > 60 then
    raise exception 'La couleur doit contenir entre 1 et 60 caractères.' using errcode = '22023';
  end if;
  if length(v_code) < 1 or length(v_code) > 30 or v_code !~ '^[A-Z0-9-]+$' then
    raise exception 'Le code court doit contenir 1 à 30 lettres, chiffres ou tirets.' using errcode = '22023';
  end if;
  if p_prix_vente_xof is null or p_prix_vente_xof < 0 then
    raise exception 'Le prix de vente doit être un montant positif ou nul.' using errcode = '22023';
  end if;
  if p_prix_achat_xof is not null and p_prix_achat_xof < 0 then
    raise exception 'Le prix d’achat doit être un montant positif ou nul.' using errcode = '22023';
  end if;
  if p_seuil_alerte is null or p_seuil_alerte < 0 then
    raise exception 'Le seuil d’alerte doit être un entier positif ou nul.' using errcode = '22023';
  end if;
  if p_quantite_initiale is null or p_quantite_initiale < 0 then
    raise exception 'La quantité initiale doit être un entier positif ou nul.' using errcode = '22023';
  end if;

  if p_unite_vente is null
    or (v_article.dimension = 'length' and p_unite_vente not in ('metre', 'yard'))
    or (v_article.dimension = 'unit' and p_unite_vente <> 'piece') then
    raise exception 'L’unité de vente ne correspond pas à la dimension de l’article.' using errcode = '22023';
  end if;

  if exists (
    select 1 from public.variants v
    where v.boutique_id = v_boutique and lower(v.code_court) = lower(v_code)
  ) then
    raise exception 'Ce code court est déjà utilisé.' using errcode = '23505';
  end if;

  if exists (
    select 1 from public.variants v
    where v.article_id = p_article_id and lower(v.couleur) = lower(v_couleur)
  ) then
    raise exception 'Cette couleur existe déjà pour cet article.' using errcode = '23505';
  end if;

  insert into public.variants (
    boutique_id,
    article_id,
    couleur,
    code_court,
    dimension,
    unite_vente,
    prix_vente_xof,
    seuil_alerte
  )
  values (
    v_boutique,
    p_article_id,
    v_couleur,
    v_code,
    v_article.dimension,
    p_unite_vente,
    p_prix_vente_xof,
    p_seuil_alerte
  )
  returning id into v_id;

  if p_prix_achat_xof is not null then
    insert into public.variant_costs (variant_id, boutique_id, prix_achat_xof, updated_by)
    values (v_id, v_boutique, p_prix_achat_xof, auth.uid());
  end if;

  if p_quantite_initiale > 0 then
    insert into public.stock_movements (
      id, boutique_id, variant_id, type, quantite, motif, created_by
    )
    values (
      gen_random_uuid(),
      v_boutique,
      v_id,
      'reception',
      p_quantite_initiale,
      'Stock initial',
      auth.uid()
    );
  end if;

  insert into public.audit_log (boutique_id, user_id, action, entity, entity_id, details)
  values (
    v_boutique,
    auth.uid(),
    'variant_created',
    'variants',
    v_id::text,
    jsonb_build_object(
      'article_id', p_article_id,
      'couleur', v_couleur,
      'code_court', v_code,
      'prix_vente_xof', p_prix_vente_xof,
      'prix_achat_xof', p_prix_achat_xof,
      'seuil_alerte', p_seuil_alerte,
      'quantite_initiale', p_quantite_initiale
    )
  );

  return v_id;
end;
$$;

create or replace function public.create_article_with_variant(
  p_categorie_id uuid,
  p_nom text,
  p_description text,
  p_dimension public.stock_dimension,
  p_couleur text,
  p_code_court text,
  p_unite_vente public.pricing_unit,
  p_prix_vente_xof integer,
  p_prix_achat_xof integer,
  p_seuil_alerte integer,
  p_quantite_initiale integer
)
returns uuid
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_boutique uuid := app_private.require_admin();
  v_nom text := btrim(coalesce(p_nom, ''));
  v_description text := nullif(btrim(coalesce(p_description, '')), '');
  v_article_id uuid;
begin
  if not exists (
    select 1 from public.categories c
    where c.id = p_categorie_id and c.boutique_id = v_boutique
  ) then
    raise exception 'Catégorie introuvable.' using errcode = 'P0002';
  end if;

  if length(v_nom) < 1 or length(v_nom) > 120 then
    raise exception 'Le nom de l’article doit contenir entre 1 et 120 caractères.' using errcode = '22023';
  end if;
  if p_dimension is null or p_dimension::text not in ('length', 'unit') then
    raise exception 'La dimension doit être « longueur » ou « unité ».' using errcode = '22023';
  end if;
  if exists (
    select 1 from public.articles a
    where a.boutique_id = v_boutique and lower(a.nom) = lower(v_nom)
  ) then
    raise exception 'Un article porte déjà ce nom.' using errcode = '23505';
  end if;

  insert into public.articles (boutique_id, categorie_id, nom, description, dimension)
  values (v_boutique, p_categorie_id, v_nom, v_description, p_dimension)
  returning id into v_article_id;

  perform public.create_variant(
    v_article_id,
    p_couleur,
    p_code_court,
    p_unite_vente,
    p_prix_vente_xof,
    p_prix_achat_xof,
    p_seuil_alerte,
    p_quantite_initiale
  );

  insert into public.audit_log (boutique_id, user_id, action, entity, entity_id, details)
  values (
    v_boutique,
    auth.uid(),
    'article_created',
    'articles',
    v_article_id::text,
    jsonb_build_object('nom', v_nom, 'dimension', p_dimension, 'categorie_id', p_categorie_id)
  );

  return v_article_id;
end;
$$;

create or replace function public.update_article(
  p_id uuid,
  p_categorie_id uuid,
  p_nom text,
  p_description text,
  p_actif boolean
)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_boutique uuid := app_private.require_admin();
  v_nom text := btrim(coalesce(p_nom, ''));
  v_description text := nullif(btrim(coalesce(p_description, '')), '');
  v_before public.articles%rowtype;
begin
  select * into v_before
  from public.articles
  where id = p_id and boutique_id = v_boutique;

  if not found then
    raise exception 'Article introuvable.' using errcode = 'P0002';
  end if;

  if not exists (
    select 1 from public.categories c
    where c.id = p_categorie_id and c.boutique_id = v_boutique
  ) then
    raise exception 'Catégorie introuvable.' using errcode = 'P0002';
  end if;

  if length(v_nom) < 1 or length(v_nom) > 120 then
    raise exception 'Le nom de l’article doit contenir entre 1 et 120 caractères.' using errcode = '22023';
  end if;

  if exists (
    select 1 from public.articles a
    where a.boutique_id = v_boutique
      and a.id <> p_id
      and lower(a.nom) = lower(v_nom)
  ) then
    raise exception 'Un autre article porte déjà ce nom.' using errcode = '23505';
  end if;

  update public.articles
  set categorie_id = p_categorie_id,
      nom = v_nom,
      description = v_description,
      actif = coalesce(p_actif, actif)
  where id = p_id and boutique_id = v_boutique;

  insert into public.audit_log (boutique_id, user_id, action, entity, entity_id, details)
  values (
    v_boutique,
    auth.uid(),
    'article_updated',
    'articles',
    p_id::text,
    jsonb_build_object(
      'ancien_nom', v_before.nom,
      'nouveau_nom', v_nom,
      'ancienne_categorie', v_before.categorie_id,
      'nouvelle_categorie', p_categorie_id
    )
  );
end;
$$;

create or replace function public.update_variant(
  p_id uuid,
  p_couleur text,
  p_code_court text,
  p_prix_vente_xof integer,
  p_prix_achat_xof integer,
  p_seuil_alerte integer,
  p_actif boolean
)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_boutique uuid := app_private.require_admin();
  v_couleur text := btrim(coalesce(p_couleur, ''));
  v_code text := upper(btrim(coalesce(p_code_court, '')));
  v_before public.variants%rowtype;
begin
  select * into v_before
  from public.variants
  where id = p_id and boutique_id = v_boutique;

  if not found then
    raise exception 'Variante introuvable.' using errcode = 'P0002';
  end if;

  if length(v_couleur) < 1 or length(v_couleur) > 60 then
    raise exception 'La couleur doit contenir entre 1 et 60 caractères.' using errcode = '22023';
  end if;
  if length(v_code) < 1 or length(v_code) > 30 or v_code !~ '^[A-Z0-9-]+$' then
    raise exception 'Le code court doit contenir 1 à 30 lettres, chiffres ou tirets.' using errcode = '22023';
  end if;
  if p_prix_vente_xof is null or p_prix_vente_xof < 0 then
    raise exception 'Le prix de vente doit être un montant positif ou nul.' using errcode = '22023';
  end if;
  if p_prix_achat_xof is not null and p_prix_achat_xof < 0 then
    raise exception 'Le prix d’achat doit être un montant positif ou nul.' using errcode = '22023';
  end if;
  if p_seuil_alerte is null or p_seuil_alerte < 0 then
    raise exception 'Le seuil d’alerte doit être un entier positif ou nul.' using errcode = '22023';
  end if;

  if exists (
    select 1 from public.variants v
    where v.boutique_id = v_boutique and v.id <> p_id and lower(v.code_court) = lower(v_code)
  ) then
    raise exception 'Ce code court est déjà utilisé.' using errcode = '23505';
  end if;

  if exists (
    select 1 from public.variants v
    where v.article_id = v_before.article_id
      and v.id <> p_id
      and lower(v.couleur) = lower(v_couleur)
  ) then
    raise exception 'Cette couleur existe déjà pour cet article.' using errcode = '23505';
  end if;

  update public.variants
  set couleur = v_couleur,
      code_court = v_code,
      prix_vente_xof = p_prix_vente_xof,
      seuil_alerte = p_seuil_alerte,
      actif = coalesce(p_actif, actif)
  where id = p_id and boutique_id = v_boutique;

  if p_prix_achat_xof is not null then
    insert into public.variant_costs (variant_id, boutique_id, prix_achat_xof, updated_by)
    values (p_id, v_boutique, p_prix_achat_xof, auth.uid())
    on conflict (variant_id) do update
      set prix_achat_xof = excluded.prix_achat_xof,
          updated_by = excluded.updated_by,
          updated_at = now();
  end if;

  insert into public.audit_log (boutique_id, user_id, action, entity, entity_id, details)
  values (
    v_boutique,
    auth.uid(),
    'variant_updated',
    'variants',
    p_id::text,
    jsonb_build_object(
      'ancien_prix_vente_xof', v_before.prix_vente_xof,
      'nouveau_prix_vente_xof', p_prix_vente_xof,
      'ancien_prix_achat_xof', p_prix_achat_xof,
      'ancien_seuil_alerte', v_before.seuil_alerte,
      'nouveau_seuil_alerte', p_seuil_alerte,
      'ancien_actif', v_before.actif,
      'nouveau_actif', coalesce(p_actif, v_before.actif)
    )
  );
end;
$$;

create or replace function public.record_stock_movement(
  p_id uuid,
  p_variant_id uuid,
  p_type public.movement_type,
  p_quantite integer,
  p_motif text,
  p_device_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_boutique uuid := app_private.require_admin();
  v_motif text := nullif(btrim(coalesce(p_motif, '')), '');
  v_existing public.stock_movements%rowtype;
  v_after integer;
begin
  if p_type not in ('reception', 'loss', 'adjustment') then
    raise exception 'Ce type de mouvement est réservé au module de vente.' using errcode = '22023';
  end if;
  if p_quantite is null or p_quantite = 0 then
    raise exception 'La quantité doit être un entier non nul.' using errcode = '22023';
  end if;
  if p_type = 'reception' and p_quantite < 0 then
    raise exception 'Une réception doit ajouter une quantité positive.' using errcode = '22023';
  end if;
  if p_type = 'loss' and p_quantite > 0 then
    raise exception 'Une perte doit retirer une quantité positive.' using errcode = '22023';
  end if;
  if p_type in ('loss', 'adjustment') and (v_motif is null or length(v_motif) < 3) then
    raise exception 'Un motif de 3 caractères minimum est obligatoire pour ce mouvement.' using errcode = '22023';
  end if;

  if not exists (
    select 1 from public.variants v
    where v.id = p_variant_id and v.boutique_id = v_boutique and v.actif
  ) then
    raise exception 'Variante active introuvable.' using errcode = 'P0002';
  end if;

  if p_device_id is not null and not exists (
    select 1 from public.devices d
    where d.id = p_device_id and d.boutique_id = v_boutique and d.revoked_at is null
  ) then
    raise exception 'Appareil inconnu ou révoqué.' using errcode = 'P0002';
  end if;

  select * into v_existing from public.stock_movements where id = p_id;
  if found then
    if v_existing.variant_id = p_variant_id
      and v_existing.type = p_type
      and v_existing.quantite = p_quantite
      and coalesce(v_existing.motif, '') = coalesce(v_motif, '') then
      select quantite into v_after
      from public.stock_levels
      where boutique_id = v_boutique and variant_id = p_variant_id;
      return jsonb_build_object(
        'id', p_id,
        'quantite_apres', coalesce(v_after, 0),
        'rejoue', true
      );
    end if;
    raise exception 'Cet identifiant de mouvement est déjà utilisé avec un autre contenu.' using errcode = '23505';
  end if;

  insert into public.stock_movements (
    id, boutique_id, variant_id, type, quantite, motif, device_id, created_by
  )
  values (p_id, v_boutique, p_variant_id, p_type, p_quantite, v_motif, p_device_id, auth.uid());

  select quantite into v_after
  from public.stock_levels
  where boutique_id = v_boutique and variant_id = p_variant_id;

  insert into public.audit_log (boutique_id, user_id, action, entity, entity_id, details)
  values (
    v_boutique,
    auth.uid(),
    'stock_movement',
    'stock_movements',
    p_id::text,
    jsonb_build_object(
      'variant_id', p_variant_id,
      'type', p_type,
      'quantite', p_quantite,
      'motif', v_motif,
      'quantite_apres', coalesce(v_after, 0)
    )
  );

  return jsonb_build_object(
    'id', p_id,
    'quantite_apres', coalesce(v_after, 0),
    'rejoue', false
  );
end;
$$;

create or replace function public.import_catalog(p_file_name text, p_rows jsonb)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_boutique uuid := app_private.require_admin();
  v_file text := left(btrim(coalesce(p_file_name, '')), 200);
  v_import_id uuid;
  v_item record;
  v_line integer;
  v_success integer := 0;
  v_errors integer := 0;
  v_total integer;
  v_status public.import_status;
  v_category_code text;
  v_category_name text;
  v_category_id uuid;
  v_named_category_id uuid;
  v_article_name text;
  v_description text;
  v_dimension public.stock_dimension;
  v_color text;
  v_code text;
  v_unit public.pricing_unit;
  v_sale_price numeric;
  v_purchase_price numeric;
  v_threshold numeric;
  v_initial numeric;
  v_article_id uuid;
  v_article_dimension public.stock_dimension;
  v_article_category uuid;
  v_variant_id uuid;
  v_variant_article uuid;
  v_variant_dimension public.stock_dimension;
  v_variant_unit public.pricing_unit;
begin
  if p_rows is null or jsonb_typeof(p_rows) <> 'array' then
    raise exception 'Le fichier ne contient aucune ligne exploitable.' using errcode = '22023';
  end if;
  v_total := jsonb_array_length(p_rows);
  if v_total = 0 then
    raise exception 'Le fichier ne contient aucune ligne exploitable.' using errcode = '22023';
  end if;
  if v_total > 500 then
    raise exception 'Un import est limité à 500 lignes à la fois.' using errcode = '22023';
  end if;
  if length(v_file) < 1 then
    v_file := 'import.xlsx';
  end if;

  insert into public.imports (boutique_id, imported_by, file_name, total_rows)
  values (v_boutique, auth.uid(), v_file, v_total)
  returning id into v_import_id;

  for v_item in
    select value, ordinality from jsonb_array_elements(p_rows) with ordinality
  loop
    v_line := v_item.ordinality::integer;
    begin
      v_line := coalesce((v_item.value ->> 'ligne')::integer, v_item.ordinality::integer);
      if jsonb_typeof(v_item.value) <> 'object' then
        raise exception 'La ligne doit être un objet.';
      end if;

      v_category_code := upper(btrim(coalesce(v_item.value ->> 'categorie_code', '')));
      v_category_name := btrim(coalesce(v_item.value ->> 'categorie', ''));
      v_article_name := btrim(coalesce(v_item.value ->> 'article', ''));
      v_description := nullif(btrim(coalesce(v_item.value ->> 'description', '')), '');
      v_color := btrim(coalesce(v_item.value ->> 'couleur', ''));
      v_code := upper(btrim(coalesce(v_item.value ->> 'code_court', '')));

      if v_category_code = '' or length(v_category_code) > 20 or v_category_code !~ '^[A-Z0-9-]+$' then
        raise exception 'Code catégorie invalide (1 à 20 lettres, chiffres ou tirets).';
      end if;
      if v_category_name = '' or length(v_category_name) > 80 then
        raise exception 'Nom de catégorie invalide (1 à 80 caractères).';
      end if;
      if v_article_name = '' or length(v_article_name) > 120 then
        raise exception 'Nom d’article invalide (1 à 120 caractères).';
      end if;
      if v_color = '' or length(v_color) > 60 then
        raise exception 'Couleur invalide (1 à 60 caractères).';
      end if;
      if v_code = '' or length(v_code) > 30 or v_code !~ '^[A-Z0-9-]+$' then
        raise exception 'Code court invalide (1 à 30 lettres, chiffres ou tirets).';
      end if;

      if coalesce(v_item.value ->> 'dimension', '') not in ('length', 'unit') then
        raise exception 'Dimension invalide : utilise « longueur » ou « unité ».';
      end if;
      v_dimension := (v_item.value ->> 'dimension')::public.stock_dimension;

      if coalesce(v_item.value ->> 'unite_vente', '') not in ('metre', 'yard', 'piece') then
        raise exception 'Unité de vente invalide : utilise « metre », « yard » ou « piece ».';
      end if;
      v_unit := (v_item.value ->> 'unite_vente')::public.pricing_unit;

      if (v_dimension = 'length' and v_unit not in ('metre', 'yard'))
        or (v_dimension = 'unit' and v_unit <> 'piece') then
        raise exception 'L’unité de vente ne correspond pas à la dimension.';
      end if;

      v_sale_price := nullif(btrim(coalesce(v_item.value ->> 'prix_vente_xof', '')), '')::numeric;
      v_purchase_price := nullif(btrim(coalesce(v_item.value ->> 'prix_achat_xof', '')), '')::numeric;
      v_threshold := coalesce(
        nullif(btrim(coalesce(v_item.value ->> 'seuil_alerte', '')), '')::numeric,
        0
      );
      v_initial := coalesce(
        nullif(btrim(coalesce(v_item.value ->> 'quantite_initiale', '')), '')::numeric,
        0
      );

      if v_sale_price is null or v_sale_price < 0 or v_sale_price <> trunc(v_sale_price) then
        raise exception 'Prix de vente invalide : montant entier positif attendu.';
      end if;
      if v_purchase_price is not null
        and (v_purchase_price < 0 or v_purchase_price <> trunc(v_purchase_price)) then
        raise exception 'Prix d’achat invalide : montant entier positif attendu.';
      end if;
      if v_threshold < 0 or v_threshold <> trunc(v_threshold) then
        raise exception 'Seuil invalide : entier positif ou nul attendu.';
      end if;
      if v_initial < 0 or v_initial <> trunc(v_initial) then
        raise exception 'Stock initial invalide : entier positif ou nul attendu.';
      end if;

      select id into v_category_id
      from public.categories c
      where c.boutique_id = v_boutique and lower(c.code_court) = lower(v_category_code);

      select id into v_named_category_id
      from public.categories c
      where c.boutique_id = v_boutique and lower(c.nom) = lower(v_category_name);

      if v_category_id is null and v_named_category_id is null then
        insert into public.categories (boutique_id, nom, code_court)
        values (v_boutique, v_category_name, v_category_code)
        returning id into v_category_id;
      elsif v_category_id is null then
        raise exception 'Une catégorie porte déjà le nom « % » avec un autre code.', v_category_name;
      elsif v_named_category_id is not null and v_named_category_id <> v_category_id then
        raise exception 'Le code catégorie « % » et le nom « % » désignent deux catégories différentes.', v_category_code, v_category_name;
      end if;

      select id, dimension, categorie_id
        into v_article_id, v_article_dimension, v_article_category
      from public.articles a
      where a.boutique_id = v_boutique and lower(a.nom) = lower(v_article_name);

      if found then
        if v_article_category <> v_category_id then
          raise exception 'L’article « % » existe déjà dans une autre catégorie.', v_article_name;
        end if;
        if v_article_dimension <> v_dimension then
          raise exception 'L’article « % » existe déjà avec une autre dimension.', v_article_name;
        end if;
      else
        insert into public.articles (boutique_id, categorie_id, nom, description, dimension)
        values (v_boutique, v_category_id, v_article_name, v_description, v_dimension)
        returning id into v_article_id;
      end if;

      select id, article_id, dimension, unite_vente
        into v_variant_id, v_variant_article, v_variant_dimension, v_variant_unit
      from public.variants v
      where v.boutique_id = v_boutique and lower(v.code_court) = lower(v_code);

      if found then
        if v_variant_article <> v_article_id then
          raise exception 'Le code court « % » est déjà utilisé par un autre article.', v_code;
        end if;
        if v_variant_dimension <> v_dimension or v_variant_unit <> v_unit then
          raise exception 'La variante « % » existe avec une autre dimension ou unité.', v_code;
        end if;

        update public.variants
        set couleur = v_color,
            prix_vente_xof = v_sale_price::integer,
            seuil_alerte = v_threshold::integer,
            actif = true
        where id = v_variant_id;

        if v_purchase_price is not null then
          insert into public.variant_costs (variant_id, boutique_id, prix_achat_xof, updated_by)
          values (v_variant_id, v_boutique, v_purchase_price::integer, auth.uid())
          on conflict (variant_id) do update
            set prix_achat_xof = excluded.prix_achat_xof,
                updated_by = excluded.updated_by,
                updated_at = now();
        end if;
      else
        insert into public.variants (
          boutique_id, article_id, couleur, code_court, dimension, unite_vente,
          prix_vente_xof, seuil_alerte
        )
        values (
          v_boutique, v_article_id, v_color, v_code, v_dimension, v_unit,
          v_sale_price::integer, v_threshold::integer
        )
        returning id into v_variant_id;

        if v_purchase_price is not null then
          insert into public.variant_costs (variant_id, boutique_id, prix_achat_xof, updated_by)
          values (v_variant_id, v_boutique, v_purchase_price::integer, auth.uid());
        end if;

        if v_initial > 0 then
          insert into public.stock_movements (
            id, boutique_id, variant_id, type, quantite, motif, created_by
          )
          values (
            gen_random_uuid(),
            v_boutique,
            v_variant_id,
            'reception',
            v_initial::integer,
            'Stock initial (import)',
            auth.uid()
          );
        end if;
      end if;

      insert into public.import_rows (
        import_id, boutique_id, line_number, raw, statut, variant_id
      )
      values (v_import_id, v_boutique, v_line, v_item.value, 'ok', v_variant_id);

      v_success := v_success + 1;
    exception
      when others then
        insert into public.import_rows (
          import_id, boutique_id, line_number, raw, statut, error_message
        )
        values (
          v_import_id,
          v_boutique,
          v_line,
          v_item.value,
          'error',
          left(sqlerrm, 500)
        );
        v_errors := v_errors + 1;
    end;
  end loop;

  v_status := case
    when v_success = 0 and v_errors > 0 then 'failed'::public.import_status
    when v_errors > 0 then 'partial'::public.import_status
    else 'applied'::public.import_status
  end;

  update public.imports
  set statut = v_status,
      success_rows = v_success,
      error_rows = v_errors,
      applied_at = now()
  where id = v_import_id;

  insert into public.audit_log (boutique_id, user_id, action, entity, entity_id, details)
  values (
    v_boutique,
    auth.uid(),
    'catalog_imported',
    'imports',
    v_import_id::text,
    jsonb_build_object(
      'file_name', v_file,
      'total_rows', v_total,
      'success_rows', v_success,
      'error_rows', v_errors,
      'statut', v_status
    )
  );

  return jsonb_build_object(
    'import_id', v_import_id,
    'total', v_total,
    'success', v_success,
    'errors', v_errors,
    'statut', v_status
  );
end;
$$;

revoke all on function public.create_category(text, text) from public;
revoke all on function public.update_category(uuid, text, text, boolean) from public;
revoke all on function public.create_variant(
  uuid, text, text, public.pricing_unit, integer, integer, integer, integer
) from public;
revoke all on function public.create_article_with_variant(
  uuid, text, text, public.stock_dimension, text, text, public.pricing_unit, integer, integer, integer, integer
) from public;
revoke all on function public.update_article(uuid, uuid, text, text, boolean) from public;
revoke all on function public.update_variant(
  uuid, text, text, integer, integer, integer, boolean
) from public;
revoke all on function public.record_stock_movement(
  uuid, uuid, public.movement_type, integer, text, uuid
) from public;
revoke all on function public.import_catalog(text, jsonb) from public;

grant execute on function public.create_category(text, text) to authenticated;
grant execute on function public.update_category(uuid, text, text, boolean) to authenticated;
grant execute on function public.create_variant(
  uuid, text, text, public.pricing_unit, integer, integer, integer, integer
) to authenticated;
grant execute on function public.create_article_with_variant(
  uuid, text, text, public.stock_dimension, text, text, public.pricing_unit, integer, integer, integer, integer
) to authenticated;
grant execute on function public.update_article(uuid, uuid, text, text, boolean) to authenticated;
grant execute on function public.update_variant(
  uuid, text, text, integer, integer, integer, boolean
) to authenticated;
grant execute on function public.record_stock_movement(
  uuid, uuid, public.movement_type, integer, text, uuid
) to authenticated;
grant execute on function public.import_catalog(text, jsonb) to authenticated;
