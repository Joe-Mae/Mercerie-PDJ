import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import type { ImportPayloadRow } from '@mercerie/core';
import type { AppRole } from '../types';
import { DEMO_CATEGORIES, DEMO_PROFILES, DEMO_STOCK } from './demo';
import {
  createArticle as apiCreateArticle,
  createCategory as apiCreateCategory,
  createVariant as apiCreateVariant,
  importCatalog as apiImportCatalog,
  loadMovements,
  loadPriceHistory,
  loadStockLevels,
  recordStockMovement as apiRecordMovement,
  updateArticle as apiUpdateArticle,
  updateVariant as apiUpdateVariant,
} from './stockApi';
import { applyStockLevels, loadStockWithCache } from '../offline/catalog';
import type {
  ImportSummary,
  NewArticleInput,
  NewCategoryInput,
  NewVariantInput,
  PriceHistoryEntry,
  RecordMovementInput,
  StockCategory,
  StockItem,
  StockMovementView,
  UpdateArticleInput,
  UpdateVariantInput,
} from './stock';

interface StockContextValue {
  readonly items: readonly StockItem[];
  readonly categories: readonly StockCategory[];
  readonly movements: readonly StockMovementView[];
  readonly loading: boolean;
  readonly cached: boolean;
  readonly error: string | null;
  readonly movementError: string | null;
  readonly refresh: (force?: boolean) => Promise<void>;
  readonly refreshLevels: () => Promise<void>;
  readonly refreshMovements: () => Promise<void>;
  readonly createCategory: (input: NewCategoryInput) => Promise<string>;
  readonly createArticle: (input: NewArticleInput) => Promise<void>;
  readonly createVariant: (input: NewVariantInput) => Promise<void>;
  readonly updateArticle: (input: UpdateArticleInput) => Promise<void>;
  readonly updateVariant: (input: UpdateVariantInput) => Promise<void>;
  readonly recordMovement: (input: RecordMovementInput) => Promise<number>;
  readonly importRows: (
    fileName: string,
    rows: readonly ImportPayloadRow[],
  ) => Promise<ImportSummary>;
  readonly priceHistory: (variantId: string) => Promise<PriceHistoryEntry[]>;
}

const StockContext = createContext<StockContextValue | null>(null);

const DEMO_HISTORY: Readonly<Record<string, PriceHistoryEntry[]>> = {
  'v-bazin-blanc': [
    {
      id: 2,
      oldSalePrice: 4800,
      newSalePrice: 5000,
      oldPurchasePrice: null,
      newPurchasePrice: null,
      changedAt: '2026-10-28T09:15:00.000Z',
      changedBy: 'Mme Adjovi',
    },
    {
      id: 1,
      oldSalePrice: null,
      newSalePrice: 4800,
      oldPurchasePrice: 3200,
      newPurchasePrice: 3400,
      changedAt: '2026-09-12T08:40:00.000Z',
      changedBy: 'Mme Adjovi',
    },
  ],
};

const DEMO_MOVEMENTS: readonly StockMovementView[] = [
  {
    id: 'demo-mvt-1',
    variantId: 'v-bazin-blanc',
    type: 'reception',
    quantity: 1000,
    reason: 'Livraison Grossiste Lomé',
    occurredAt: '2026-11-07T09:20:00.000Z',
    createdBy: 'Mme Adjovi',
  },
  {
    id: 'demo-mvt-2',
    variantId: 'v-fil-blanc',
    type: 'loss',
    quantity: -2,
    reason: 'Bobines abîmées',
    occurredAt: '2026-11-06T16:05:00.000Z',
    createdBy: 'Mme Adjovi',
  },
  {
    id: 'demo-mvt-3',
    variantId: 'v-wax-vert',
    type: 'adjustment',
    quantity: 90,
    reason: 'Correction après comptage',
    occurredAt: '2026-11-05T11:30:00.000Z',
    createdBy: 'Mme Adjovi',
  },
];

function nowIso(): string {
  return new Date().toISOString();
}

function articleIdFor(name: string): string {
  return `demo-article-${name
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')}`;
}

interface StockProviderProps {
  readonly role: AppRole;
  readonly demo: boolean;
  readonly children: ReactNode;
}

export function StockProvider({ role, demo, children }: StockProviderProps) {
  const [items, setItems] = useState<readonly StockItem[]>(() =>
    demo ? DEMO_STOCK.map((item) => ({ ...item })) : [],
  );
  const [categories, setCategories] = useState<readonly StockCategory[]>(() =>
    demo ? DEMO_CATEGORIES : [],
  );
  const [movements, setMovements] = useState<readonly StockMovementView[]>(() =>
    demo ? DEMO_MOVEMENTS : [],
  );
  const [history, setHistory] = useState<Record<string, PriceHistoryEntry[]>>(() =>
    demo ? { ...DEMO_HISTORY } : {},
  );
  const [loading, setLoading] = useState(!demo);
  const [cached, setCached] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [movementError, setMovementError] = useState<string | null>(null);
  const movementsLoadedRef = useRef(false);

  const refresh = useCallback(
    async (force = false) => {
      if (demo) {
        return;
      }

      setLoading(true);
      try {
        const data = await loadStockWithCache(role, { maxAgeMs: force ? 0 : 30_000 });
        setItems(data.items);
        setCategories(data.categories);
        setCached(data.fromCache);
        setError(null);
      } catch (reason) {
        setCached(false);
        setError(reason instanceof Error ? reason.message : 'Impossible de charger le stock.');
      } finally {
        setLoading(false);
      }
    },
    [demo, role],
  );

  const refreshLevels = useCallback(async () => {
    if (demo) {
      return;
    }

    try {
      const levels = await loadStockLevels();
      await applyStockLevels(role, levels);
      setItems((current) =>
        current.map((item) => {
          const quantity = levels.get(item.id);
          return quantity === undefined || quantity === item.quantity
            ? item
            : { ...item, quantity };
        }),
      );
    } catch {
      // Les quantités locales restent affichées ; la prochaine synchronisation les corrigera.
    }
  }, [demo, role]);

  const refreshMovements = useCallback(async () => {
    if (demo) {
      return;
    }

    try {
      setMovements(await loadMovements());
      setMovementError(null);
      movementsLoadedRef.current = true;
    } catch (reason) {
      setMovementError(
        reason instanceof Error ? reason.message : 'Impossible de charger le journal du stock.',
      );
    }
  }, [demo]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const createCategory = useCallback(
    async (input: NewCategoryInput) => {
      const id = demo ? crypto.randomUUID() : await apiCreateCategory(input);
      setCategories((current) => [
        ...current,
        { id, nom: input.nom.trim(), codeCourt: input.codeCourt.trim().toUpperCase(), actif: true },
      ]);
      return id;
    },
    [demo],
  );

  const createArticle = useCallback(
    async (input: NewArticleInput) => {
      if (!demo) {
        await apiCreateArticle(input);
        await refresh(true);
        return;
      }

      const category = categories.find((entry) => entry.id === input.categorieId);
      if (!category) {
        throw new Error('Choisis une catégorie.');
      }

      const articleId = articleIdFor(input.nom);
      const id = crypto.randomUUID();
      setItems((current) => [
        ...current,
        {
          id,
          articleId,
          article: input.nom.trim(),
          description: input.description.trim() || null,
          categoryId: category.id,
          category: category.nom,
          categoryCode: category.codeCourt,
          color: input.couleur.trim(),
          code: input.codeCourt.trim().toUpperCase(),
          dimension: input.dimension,
          saleUnit: input.uniteVente,
          salePrice: input.prixVenteXof,
          purchasePrice: input.prixAchatXof,
          threshold: input.seuilAlerte,
          quantity: input.quantiteInitiale,
          active: true,
        },
      ]);
      if (input.prixAchatXof !== null) {
        setHistory((current) => ({
          ...current,
          [id]: [
            {
              id: Date.now(),
              oldSalePrice: null,
              newSalePrice: null,
              oldPurchasePrice: null,
              newPurchasePrice: input.prixAchatXof,
              changedAt: nowIso(),
              changedBy: DEMO_PROFILES.admin.nom,
            },
          ],
        }));
      }
      if (input.quantiteInitiale > 0) {
        setMovements((current) => [
          {
            id: crypto.randomUUID(),
            variantId: id,
            type: 'reception',
            quantity: input.quantiteInitiale,
            reason: 'Stock initial',
            occurredAt: nowIso(),
            createdBy: DEMO_PROFILES.admin.nom,
          },
          ...current,
        ]);
      }
    },
    [categories, demo, refresh],
  );

  const createVariant = useCallback(
    async (input: NewVariantInput) => {
      const article = items.find((item) => item.articleId === input.articleId);
      if (!article) {
        throw new Error('Article introuvable.');
      }

      const id = demo ? crypto.randomUUID() : await apiCreateVariant(input);
      setItems((current) => [
        ...current,
        {
          ...article,
          id,
          color: input.couleur.trim(),
          code: input.codeCourt.trim().toUpperCase(),
          saleUnit: input.uniteVente,
          salePrice: input.prixVenteXof,
          purchasePrice: input.prixAchatXof,
          threshold: input.seuilAlerte,
          quantity: input.quantiteInitiale,
          active: true,
        },
      ]);
      if (input.quantiteInitiale > 0) {
        if (demo) {
          setMovements((current) => [
            {
              id: crypto.randomUUID(),
              variantId: id,
              type: 'reception',
              quantity: input.quantiteInitiale,
              reason: 'Stock initial',
              occurredAt: nowIso(),
              createdBy: DEMO_PROFILES.admin.nom,
            },
            ...current,
          ]);
        } else if (movementsLoadedRef.current) {
          await refreshMovements();
        }
      }
    },
    [demo, items, refreshMovements],
  );

  const updateArticle = useCallback(
    async (input: UpdateArticleInput) => {
      if (!demo) {
        await apiUpdateArticle(input);
      }

      const category = categories.find((entry) => entry.id === input.categorieId);
      setItems((current) =>
        current.map((item) =>
          item.articleId === input.id
            ? {
                ...item,
                article: input.nom.trim(),
                description: input.description.trim() || null,
                categoryId: category?.id ?? item.categoryId,
                category: category?.nom ?? item.category,
                categoryCode: category?.codeCourt ?? item.categoryCode,
                active: input.actif,
              }
            : item,
        ),
      );
    },
    [categories, demo],
  );

  const updateVariant = useCallback(
    async (input: UpdateVariantInput) => {
      if (!demo) {
        await apiUpdateVariant(input);
      }

      setItems((current) =>
        current.map((item) =>
          item.id === input.id
            ? {
                ...item,
                color: input.couleur.trim(),
                code: input.codeCourt.trim().toUpperCase(),
                salePrice: input.prixVenteXof,
                purchasePrice: input.prixAchatXof,
                threshold: input.seuilAlerte,
                active: input.actif,
              }
            : item,
        ),
      );

      const previous = items.find((item) => item.id === input.id);
      if (
        previous &&
        (previous.salePrice !== input.prixVenteXof || previous.purchasePrice !== input.prixAchatXof)
      ) {
        setHistory((current) => ({
          ...current,
          [input.id]: [
            {
              id: Date.now(),
              oldSalePrice: previous.salePrice !== input.prixVenteXof ? previous.salePrice : null,
              newSalePrice: previous.salePrice !== input.prixVenteXof ? input.prixVenteXof : null,
              oldPurchasePrice:
                previous.purchasePrice !== input.prixAchatXof ? previous.purchasePrice : null,
              newPurchasePrice:
                previous.purchasePrice !== input.prixAchatXof ? input.prixAchatXof : null,
              changedAt: nowIso(),
              changedBy: DEMO_PROFILES.admin.nom,
            },
            ...(current[input.id] ?? []),
          ],
        }));
      }
    },
    [demo, items],
  );

  const recordMovement = useCallback(
    async (input: RecordMovementInput) => {
      if (!demo) {
        const quantity = await apiRecordMovement(input);
        setItems((current) =>
          current.map((entry) => (entry.id === input.variantId ? { ...entry, quantity } : entry)),
        );
        if (movementsLoadedRef.current) {
          await refreshMovements();
        }
        return quantity;
      }

      const item = items.find((entry) => entry.id === input.variantId);
      if (!item) {
        throw new Error('Variante introuvable.');
      }
      const nextQuantity = item.quantity + input.quantity;
      setItems((current) =>
        current.map((entry) =>
          entry.id === input.variantId ? { ...entry, quantity: nextQuantity } : entry,
        ),
      );
      setMovements((current) => [
        {
          id: input.id ?? crypto.randomUUID(),
          variantId: input.variantId,
          type: input.type,
          quantity: input.quantity,
          reason: input.reason.trim() || null,
          occurredAt: nowIso(),
          createdBy: DEMO_PROFILES.admin.nom,
        },
        ...current,
      ]);
      return nextQuantity;
    },
    [demo, items, refreshMovements],
  );

  const importRows = useCallback(
    async (fileName: string, rows: readonly ImportPayloadRow[]) => {
      if (!demo) {
        const summary = await apiImportCatalog(fileName, rows);
        await refresh(true);
        if (movementsLoadedRef.current) {
          await refreshMovements();
        }
        return summary;
      }

      let nextCategories = [...categories];
      const nextItems = [...items];
      let success = 0;

      for (const row of rows) {
        let category = nextCategories.find(
          (entry) =>
            entry.codeCourt.toLowerCase() === row.categorie_code.toLowerCase() ||
            entry.nom.toLowerCase() === row.categorie.toLowerCase(),
        );
        if (!category) {
          category = {
            id: crypto.randomUUID(),
            nom: row.categorie,
            codeCourt: row.categorie_code,
            actif: true,
          };
          nextCategories = [...nextCategories, category];
        }

        const variantIndex = nextItems.findIndex(
          (item) => item.code.toLowerCase() === row.code_court.toLowerCase(),
        );
        if (variantIndex >= 0) {
          const existing = nextItems[variantIndex];
          if (!existing) {
            continue;
          }
          nextItems[variantIndex] = {
            ...existing,
            color: row.couleur,
            salePrice: row.prix_vente_xof,
            purchasePrice: row.prix_achat_xof ?? existing.purchasePrice,
            threshold: row.seuil_alerte,
            active: true,
          };
        } else {
          const articleId = articleIdFor(row.article);
          const id = crypto.randomUUID();
          nextItems.push({
            id,
            articleId,
            article: row.article,
            description: row.description,
            categoryId: category.id,
            category: category.nom,
            categoryCode: category.codeCourt,
            color: row.couleur,
            code: row.code_court,
            dimension: row.dimension,
            saleUnit: row.unite_vente,
            salePrice: row.prix_vente_xof,
            purchasePrice: row.prix_achat_xof,
            threshold: row.seuil_alerte,
            quantity: row.quantite_initiale,
            active: true,
          });
          if (row.quantite_initiale > 0) {
            setMovements((current) => [
              {
                id: crypto.randomUUID(),
                variantId: id,
                type: 'reception',
                quantity: row.quantite_initiale,
                reason: 'Stock initial (import)',
                occurredAt: nowIso(),
                createdBy: DEMO_PROFILES.admin.nom,
              },
              ...current,
            ]);
          }
        }
        success += 1;
      }

      setCategories(nextCategories);
      setItems(nextItems);
      return {
        importId: null,
        total: rows.length,
        success,
        errors: rows.length - success,
        statut: 'applied',
      } satisfies ImportSummary;
    },
    [categories, demo, items, refresh, refreshMovements],
  );

  const priceHistory = useCallback(
    async (variantId: string) => {
      if (!demo) {
        return loadPriceHistory(variantId);
      }
      return history[variantId] ?? [];
    },
    [demo, history],
  );

  const value = useMemo<StockContextValue>(
    () => ({
      items,
      categories,
      movements,
      loading,
      cached,
      error,
      movementError,
      refresh,
      refreshLevels,
      refreshMovements,
      createCategory,
      createArticle,
      createVariant,
      updateArticle,
      updateVariant,
      recordMovement,
      importRows,
      priceHistory,
    }),
    [
      categories,
      cached,
      createArticle,
      createCategory,
      createVariant,
      error,
      importRows,
      items,
      loading,
      movementError,
      movements,
      priceHistory,
      recordMovement,
      refresh,
      refreshLevels,
      refreshMovements,
      updateArticle,
      updateVariant,
    ],
  );

  return <StockContext.Provider value={value}>{children}</StockContext.Provider>;
}

export function useStock(): StockContextValue {
  const context = useContext(StockContext);
  if (!context) {
    throw new Error('useStock doit être utilisé dans StockProvider.');
  }
  return context;
}
