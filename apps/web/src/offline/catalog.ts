import type { AppRole } from '../types';
import type { StockCategory, StockItem } from '../data/stock';
import { loadStockData } from '../data/stockApi';
import { readCache, writeCache } from './db';
import type { StockCache } from './types';

export interface StockLoadResult {
  readonly items: StockItem[];
  readonly categories: StockCategory[];
  readonly fromCache: boolean;
}

interface MemoryEntry {
  readonly items: StockItem[];
  readonly categories: StockCategory[];
  readonly savedAt: number;
}

const MEMORY_MAX_AGE_MS = 30_000;
const memory = new Map<AppRole, MemoryEntry>();
const inFlight = new Map<AppRole, Promise<StockLoadResult>>();

export async function loadStockWithCache(
  role: AppRole,
  options: { readonly maxAgeMs?: number } = {},
): Promise<StockLoadResult> {
  const maxAgeMs = options.maxAgeMs ?? MEMORY_MAX_AGE_MS;
  const cached = memory.get(role);

  if (maxAgeMs > 0 && cached && Date.now() - cached.savedAt <= maxAgeMs) {
    return { items: cached.items, categories: cached.categories, fromCache: false };
  }

  const pending = inFlight.get(role);
  if (pending) {
    return pending;
  }

  const task = fetchStock(role, `stock:${role}`).finally(() => {
    inFlight.delete(role);
  });
  inFlight.set(role, task);
  return task;
}

async function fetchStock(role: AppRole, key: string): Promise<StockLoadResult> {
  try {
    const data = await loadStockData(role);

    memory.set(role, {
      items: data.items,
      categories: data.categories,
      savedAt: Date.now(),
    });

    try {
      await writeCache(key, {
        items: data.items,
        categories: data.categories,
        savedAt: new Date().toISOString(),
      } satisfies StockCache);
    } catch {
      // Le stockage local peut être plein ou désactivé : la vente reste possible en ligne.
    }

    return { ...data, fromCache: false };
  } catch (cause) {
    try {
      const cached = await readCache<StockCache>(key);
      if (cached) {
        return {
          items: cached.items as StockItem[],
          categories: cached.categories as StockCategory[],
          fromCache: true,
        };
      }
    } catch {
      // Sans cache lisible, on remonte l'erreur réseau d'origine.
    }

    throw cause;
  }
}

function patchQuantities(
  items: readonly StockItem[],
  levels: ReadonlyMap<string, number>,
): StockItem[] {
  return items.map((item) => {
    const quantity = levels.get(item.id);
    return quantity === undefined || quantity === item.quantity ? item : { ...item, quantity };
  });
}

export async function applyStockLevels(
  role: AppRole,
  levels: ReadonlyMap<string, number>,
): Promise<void> {
  const cached = memory.get(role);
  if (cached) {
    memory.set(role, {
      ...cached,
      items: patchQuantities(cached.items, levels),
      savedAt: Date.now(),
    });
  }

  try {
    const key = `stock:${role}`;
    const stored = await readCache<StockCache>(key);
    if (!stored) {
      return;
    }

    await writeCache(key, {
      items: patchQuantities(stored.items as StockItem[], levels),
      categories: stored.categories as StockCategory[],
      savedAt: new Date().toISOString(),
    } satisfies StockCache);
  } catch {
    // Le cache local peut être indisponible : les quantités affichées restent correctes.
  }
}
