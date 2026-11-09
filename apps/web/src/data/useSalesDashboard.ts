import { useCallback, useEffect, useRef, useState } from 'react';
import type { ProfileSnapshot } from '../types';
import { DEMO_BEST_SELLERS, DEMO_DAY, DEMO_SALES, DEMO_WEEK, demoPaymentMethods } from './demo';
import { dayKey, loadSalesDashboard } from './sales';
import type { SalesDashboard, SalesDayPoint } from './sales';
import { readCache, writeCache } from '../offline/db';
import { useVisiblePolling } from '../lib/useVisiblePolling';

interface CachedDashboard {
  readonly dashboard: SalesDashboard;
  readonly savedAt: string;
}

const DEMO_YESTERDAY = 78_125;

function buildDemoDashboard(): SalesDashboard {
  const today = new Date();
  const openedAt = new Date(today.getFullYear(), today.getMonth(), today.getDate(), 8, 12, 0, 0);

  const serie: SalesDayPoint[] = DEMO_WEEK.map((point, index) => {
    const date = new Date(
      today.getFullYear(),
      today.getMonth(),
      today.getDate() - (DEMO_WEEK.length - 1 - index),
      12,
    );
    return { jour: dayKey(date), montantXof: point.montant };
  });

  return {
    role: 'admin',
    jour: dayKey(today),
    periodeJours: DEMO_WEEK.length,
    ventesJourXof: DEMO_DAY.ventes,
    ventesHierXof: DEMO_YESTERDAY,
    variationPct: 12,
    ticketsJour: DEMO_DAY.tickets,
    panierMoyenXof: DEMO_DAY.panierMoyen,
    especesJourXof: DEMO_DAY.encaisse,
    mobileJourXof: DEMO_DAY.mobile,
    beneficeJourXof: DEMO_DAY.benefice,
    coutJourXof: DEMO_DAY.ventes - DEMO_DAY.benefice,
    lignesJour: DEMO_SALES.reduce((total, sale) => total + sale.lignes, 0),
    lignesAvecCoutJour: DEMO_SALES.reduce((total, sale) => total + sale.lignes, 0),
    serie,
    meilleuresVentes: DEMO_BEST_SELLERS.map((seller) => ({
      articleId: seller.nom,
      nom: seller.nom,
      dimension: 'length',
      quantite: Number.parseFloat(seller.detail.replace(',', '.')) || 0,
      montantXof: seller.montant,
    })),
    dernieresVentes: DEMO_SALES.slice(0, 5).map((sale) => {
      const [hour, minute] = sale.heure.split(':');
      const date = new Date(today);
      date.setHours(Number(hour ?? 0), Number(minute ?? 0), 0, 0);
      return {
        id: sale.reference,
        reference: sale.reference,
        dateVente: date.toISOString(),
        lignes: sale.lignes,
        totalXof: sale.total,
        caissier: sale.caissier,
        methodes: demoPaymentMethods(sale.moyen),
      };
    }),
    caisse: {
      ouverteAt: openedAt.toISOString(),
      fondOuvertureXof: DEMO_DAY.fondCaisse,
    },
  };
}

export interface SalesDashboardState {
  readonly data: SalesDashboard | null;
  readonly loading: boolean;
  readonly cached: boolean;
  readonly error: string | null;
  readonly refresh: () => Promise<void>;
}

export function useSalesDashboard(profile: ProfileSnapshot, demo: boolean): SalesDashboardState {
  const enabled = profile.role !== 'seller';
  const [data, setData] = useState<SalesDashboard | null>(() =>
    enabled ? (demo ? buildDemoDashboard() : null) : null,
  );
  const [loading, setLoading] = useState(enabled && !demo);
  const [cached, setCached] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const cacheKey = `sales-dashboard:${profile.id}`;
  const inFlightRef = useRef<Promise<void> | null>(null);

  const load = useCallback(
    (silent: boolean): Promise<void> => {
      if (!enabled || demo) {
        return Promise.resolve();
      }

      const pending = inFlightRef.current;
      if (pending) {
        return pending;
      }

      const task = (async () => {
        if (!silent) {
          setLoading(true);
        }

        try {
          const next = await loadSalesDashboard(7);
          setData(next);
          setCached(false);
          setError(null);
          try {
            await writeCache(cacheKey, {
              dashboard: next,
              savedAt: new Date().toISOString(),
            } satisfies CachedDashboard);
          } catch {
            // Le tableau de bord reste consultable en ligne même sans cache local.
          }
        } catch (reason) {
          let fallback: CachedDashboard | null = null;
          try {
            fallback = await readCache<CachedDashboard>(cacheKey);
          } catch {
            // Sans cache lisible, on remonte l'erreur réseau.
          }

          if (fallback) {
            setData(fallback.dashboard);
            setCached(true);
            setError(null);
          } else {
            setError(
              reason instanceof Error ? reason.message : 'Impossible de charger les ventes.',
            );
          }
        } finally {
          if (!silent) {
            setLoading(false);
          }
        }
      })();

      inFlightRef.current = task;
      void task.finally(() => {
        if (inFlightRef.current === task) {
          inFlightRef.current = null;
        }
      });

      return task;
    },
    [cacheKey, demo, enabled],
  );

  useEffect(() => {
    void load(false);
  }, [load]);

  useVisiblePolling(() => load(true), {
    enabled: enabled && !demo,
    intervalMs: 180_000,
    minGapMs: 60_000,
    refreshOnOnline: true,
  });

  const refresh = useCallback(async () => {
    await load(false);
  }, [load]);

  return { data, loading, cached, error, refresh };
}
