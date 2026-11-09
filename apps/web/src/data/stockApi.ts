import type { ImportPayloadRow } from '@mercerie/core';
import { getSupabase } from '../lib/supabase';
import type { AppRole } from '../types';
import type {
  ImportSummary,
  MovementKind,
  NewArticleInput,
  NewCategoryInput,
  NewVariantInput,
  PriceHistoryEntry,
  RecordMovementInput,
  StockCategory,
  StockDimension,
  StockItem,
  StockMovementView,
  StockSaleUnit,
  UpdateArticleInput,
  UpdateVariantInput,
} from './stock';

interface CategoryRow {
  readonly id: string;
  readonly nom: string;
  readonly code_court: string;
  readonly actif: boolean;
}

interface ArticleRow {
  readonly id: string;
  readonly categorie_id: string;
  readonly nom: string;
  readonly description: string | null;
  readonly dimension: StockDimension;
  readonly actif: boolean;
}

interface VariantRow {
  readonly id: string;
  readonly article_id: string;
  readonly couleur: string;
  readonly code_court: string;
  readonly dimension: StockDimension;
  readonly unite_vente: StockSaleUnit;
  readonly prix_vente_xof: number;
  readonly seuil_alerte: number;
  readonly actif: boolean;
}

interface StockRow {
  readonly variant_id: string;
  readonly quantite: number;
}

interface CostRow {
  readonly variant_id: string;
  readonly prix_achat_xof: number;
}

interface MovementRow {
  readonly id: string;
  readonly variant_id: string;
  readonly type: MovementKind;
  readonly quantite: number;
  readonly motif: string | null;
  readonly occurred_at: string;
  readonly created_by: string | null;
}

interface PriceHistoryRow {
  readonly id: number;
  readonly ancien_prix_vente_xof: number | null;
  readonly nouveau_prix_vente_xof: number | null;
  readonly ancien_prix_achat_xof: number | null;
  readonly nouveau_prix_achat_xof: number | null;
  readonly change_at: string;
  readonly change_par: string | null;
}

interface ProfileNameRow {
  readonly id: string;
  readonly nom: string;
}

interface RpcErrorLike {
  readonly message: string;
  readonly code?: string;
}

function fail(error: RpcErrorLike): never {
  if (
    error.code === '42501' ||
    /autre rôle|non authentifié|inactif|administrateur/i.test(error.message)
  ) {
    throw new Error('Cette action est réservée à un administrateur connecté.');
  }
  throw new Error(error.message);
}

function must<T>(data: T | null, error: RpcErrorLike | null, message: string): T {
  if (error) {
    fail(error);
  }
  if (data === null) {
    throw new Error(message);
  }
  return data;
}

export async function loadStockData(role: AppRole): Promise<{
  items: StockItem[];
  categories: StockCategory[];
}> {
  const supabase = getSupabase();

  const [categories, articles, variants, levels] = await Promise.all([
    supabase.from('categories').select('id, nom, code_court, actif').order('nom'),
    supabase
      .from('articles')
      .select('id, categorie_id, nom, description, dimension, actif')
      .order('nom'),
    supabase
      .from('variants')
      .select(
        'id, article_id, couleur, code_court, dimension, unite_vente, prix_vente_xof, seuil_alerte, actif',
      )
      .order('code_court'),
    supabase.from('stock_levels').select('variant_id, quantite'),
  ]);

  const firstError = categories.error ?? articles.error ?? variants.error ?? levels.error ?? null;
  if (firstError) {
    throw new Error('Impossible de charger le stock. Vérifie la connexion puis réessaie.');
  }

  let costs: readonly CostRow[] = [];
  if (role === 'admin') {
    const costResult = await supabase.from('variant_costs').select('variant_id, prix_achat_xof');
    if (costResult.error) {
      throw new Error('Impossible de charger les prix d’achat.');
    }
    costs = (costResult.data ?? []) as CostRow[];
  }

  const categoryById = new Map(
    ((categories.data ?? []) as CategoryRow[]).map((row) => [row.id, row]),
  );
  const articleById = new Map(((articles.data ?? []) as ArticleRow[]).map((row) => [row.id, row]));
  const stockByVariant = new Map(
    ((levels.data ?? []) as StockRow[]).map((row) => [row.variant_id, row.quantite]),
  );
  const costByVariant = new Map(costs.map((row) => [row.variant_id, row.prix_achat_xof]));

  const items = ((variants.data ?? []) as VariantRow[]).flatMap((variant) => {
    const article = articleById.get(variant.article_id);
    const category = article ? categoryById.get(article.categorie_id) : undefined;
    if (!article || !category) {
      return [];
    }

    return [
      {
        id: variant.id,
        articleId: article.id,
        article: article.nom,
        description: article.description,
        categoryId: category.id,
        category: category.nom,
        categoryCode: category.code_court,
        color: variant.couleur,
        code: variant.code_court,
        dimension: variant.dimension,
        saleUnit: variant.unite_vente,
        salePrice: variant.prix_vente_xof,
        purchasePrice: costByVariant.get(variant.id) ?? null,
        threshold: variant.seuil_alerte,
        quantity: stockByVariant.get(variant.id) ?? 0,
        active: variant.actif,
      } satisfies StockItem,
    ];
  });

  items.sort(
    (left, right) =>
      left.category.localeCompare(right.category, 'fr') ||
      left.article.localeCompare(right.article, 'fr') ||
      left.color.localeCompare(right.color, 'fr'),
  );

  return {
    items,
    categories: ((categories.data ?? []) as CategoryRow[]).map((row) => ({
      id: row.id,
      nom: row.nom,
      codeCourt: row.code_court,
      actif: row.actif,
    })),
  };
}

export async function loadMovements(): Promise<StockMovementView[]> {
  const supabase = getSupabase();
  const movements = await supabase
    .from('stock_movements')
    .select('id, variant_id, type, quantite, motif, occurred_at, created_by')
    .order('occurred_at', { ascending: false })
    .limit(80);

  if (movements.error) {
    throw new Error('Impossible de charger le journal du stock.');
  }

  const rows = (movements.data ?? []) as MovementRow[];
  const names = await loadProfileNames(
    referencedProfileIds(rows.map((row) => row.created_by)),
    'Impossible de charger le journal du stock.',
  );

  return rows.map((row) => ({
    id: row.id,
    variantId: row.variant_id,
    type: row.type,
    quantity: row.quantite,
    reason: row.motif,
    occurredAt: row.occurred_at,
    createdBy: row.created_by ? (names.get(row.created_by) ?? null) : null,
  }));
}

export async function loadPriceHistory(variantId: string): Promise<PriceHistoryEntry[]> {
  const supabase = getSupabase();
  const history = await supabase
    .from('price_history')
    .select(
      'id, ancien_prix_vente_xof, nouveau_prix_vente_xof, ancien_prix_achat_xof, nouveau_prix_achat_xof, change_at, change_par',
    )
    .eq('variant_id', variantId)
    .order('change_at', { ascending: false })
    .limit(60);

  if (history.error) {
    throw new Error('Impossible de charger l’historique des prix.');
  }

  const rows = (history.data ?? []) as PriceHistoryRow[];
  const names = await loadProfileNames(
    referencedProfileIds(rows.map((row) => row.change_par)),
    'Impossible de charger l’historique des prix.',
  );

  return rows.map((row) => ({
    id: row.id,
    oldSalePrice: row.ancien_prix_vente_xof,
    newSalePrice: row.nouveau_prix_vente_xof,
    oldPurchasePrice: row.ancien_prix_achat_xof,
    newPurchasePrice: row.nouveau_prix_achat_xof,
    changedAt: row.change_at,
    changedBy: row.change_par ? (names.get(row.change_par) ?? null) : null,
  }));
}

function referencedProfileIds(values: readonly (string | null)[]): string[] {
  return [...new Set(values.filter((value): value is string => Boolean(value)))];
}

async function loadProfileNames(
  ids: readonly string[],
  failureMessage: string,
): Promise<Map<string, string>> {
  if (ids.length === 0) {
    return new Map();
  }

  const profiles = await getSupabase().from('profiles').select('id, nom').in('id', ids);
  if (profiles.error) {
    throw new Error(failureMessage);
  }

  return new Map(((profiles.data ?? []) as ProfileNameRow[]).map((row) => [row.id, row.nom]));
}

export async function loadStockLevels(): Promise<Map<string, number>> {
  const { data, error } = await getSupabase().from('stock_levels').select('variant_id, quantite');

  if (error) {
    throw new Error('Impossible de rafraîchir les quantités.');
  }

  return new Map(((data ?? []) as StockRow[]).map((row) => [row.variant_id, row.quantite]));
}

export async function createCategory(input: NewCategoryInput): Promise<string> {
  const { data, error } = await getSupabase().rpc('create_category', {
    p_nom: input.nom.trim(),
    p_code_court: input.codeCourt.trim(),
  });

  return must(data as string | null, error, 'La catégorie n’a pas été créée.');
}

export async function createArticle(input: NewArticleInput): Promise<void> {
  const { error } = await getSupabase().rpc('create_article_with_variant', {
    p_categorie_id: input.categorieId,
    p_nom: input.nom.trim(),
    p_description: input.description.trim() || null,
    p_dimension: input.dimension,
    p_couleur: input.couleur.trim(),
    p_code_court: input.codeCourt.trim(),
    p_unite_vente: input.uniteVente,
    p_prix_vente_xof: input.prixVenteXof,
    p_prix_achat_xof: input.prixAchatXof,
    p_seuil_alerte: input.seuilAlerte,
    p_quantite_initiale: input.quantiteInitiale,
  });

  if (error) {
    fail(error);
  }
}

export async function createVariant(input: NewVariantInput): Promise<string> {
  const { data, error } = await getSupabase().rpc('create_variant', {
    p_article_id: input.articleId,
    p_couleur: input.couleur.trim(),
    p_code_court: input.codeCourt.trim(),
    p_unite_vente: input.uniteVente,
    p_prix_vente_xof: input.prixVenteXof,
    p_prix_achat_xof: input.prixAchatXof,
    p_seuil_alerte: input.seuilAlerte,
    p_quantite_initiale: input.quantiteInitiale,
  });

  return must(data as string | null, error, 'La variante n’a pas été créée.');
}

export async function updateArticle(input: UpdateArticleInput): Promise<void> {
  const { error } = await getSupabase().rpc('update_article', {
    p_id: input.id,
    p_categorie_id: input.categorieId,
    p_nom: input.nom.trim(),
    p_description: input.description.trim() || null,
    p_actif: input.actif,
  });

  if (error) {
    fail(error);
  }
}

export async function updateVariant(input: UpdateVariantInput): Promise<void> {
  const { error } = await getSupabase().rpc('update_variant', {
    p_id: input.id,
    p_couleur: input.couleur.trim(),
    p_code_court: input.codeCourt.trim(),
    p_prix_vente_xof: input.prixVenteXof,
    p_prix_achat_xof: input.prixAchatXof,
    p_seuil_alerte: input.seuilAlerte,
    p_actif: input.actif,
  });

  if (error) {
    fail(error);
  }
}

export async function recordStockMovement(input: RecordMovementInput): Promise<number> {
  const { data, error } = await getSupabase().rpc('record_stock_movement', {
    p_id: input.id ?? crypto.randomUUID(),
    p_variant_id: input.variantId,
    p_type: input.type,
    p_quantite: input.quantity,
    p_motif: input.reason.trim() || null,
    p_device_id: null,
  });

  const payload = must(
    data as { quantite_apres?: number } | null,
    error,
    'Le mouvement n’a pas été enregistré.',
  );
  return payload.quantite_apres ?? 0;
}

export async function importCatalog(
  fileName: string,
  rows: readonly ImportPayloadRow[],
): Promise<ImportSummary> {
  const { data, error } = await getSupabase().rpc('import_catalog', {
    p_file_name: fileName,
    p_rows: rows,
  });

  const payload = must(
    data as {
      import_id: string;
      total: number;
      success: number;
      errors: number;
      statut: ImportSummary['statut'];
    } | null,
    error,
    'L’import n’a pas été enregistré.',
  );

  return {
    importId: payload.import_id,
    total: payload.total,
    success: payload.success,
    errors: payload.errors,
    statut: payload.statut,
  };
}
