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
import type { AppRole } from '../types';
import { DEMO_ALERTS, DEMO_PROFILES } from './demo';
import { acknowledgeAlert, loadAlerts } from './alertsApi';
import { isStockAlert, toTreatCount, type AlertEntry } from './alerts';
import { readCache, writeCache } from '../offline/db';
import { useVisiblePolling } from '../lib/useVisiblePolling';

interface AlertCache {
  readonly alerts: AlertEntry[];
  readonly savedAt: string;
}

interface AlertsContextValue {
  readonly alerts: readonly AlertEntry[];
  readonly loading: boolean;
  readonly cached: boolean;
  readonly error: string | null;
  readonly lastUpdated: string | null;
  readonly toTreatTotal: number;
  readonly refresh: () => Promise<void>;
  readonly acknowledge: (id: string) => Promise<void>;
}

const AlertsContext = createContext<AlertsContextValue | null>(null);

interface AlertsProviderProps {
  readonly userId: string;
  readonly userName: string;
  readonly role: AppRole;
  readonly demo: boolean;
  readonly children: ReactNode;
}

export function AlertsProvider({ userId, userName, role, demo, children }: AlertsProviderProps) {
  const [alerts, setAlerts] = useState<readonly AlertEntry[]>(() =>
    demo
      ? DEMO_ALERTS.filter((alert) => role === 'admin' || isStockAlert(alert)).map((alert) => ({
          ...alert,
        }))
      : [],
  );
  const [loading, setLoading] = useState(!demo);
  const [cached, setCached] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [lastUpdated, setLastUpdated] = useState<string | null>(null);
  const cacheKey = `alerts:${userId}`;
  const inFlightRef = useRef<Promise<void> | null>(null);

  const load = useCallback(
    (silent: boolean): Promise<void> => {
      if (demo) {
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
          const next = await loadAlerts(role);
          setAlerts(next);
          setCached(false);
          setError(null);
          setLastUpdated(new Date().toISOString());
          try {
            await writeCache(cacheKey, {
              alerts: next,
              savedAt: new Date().toISOString(),
            } satisfies AlertCache);
          } catch {
            // Le cache local peut être indisponible : les alertes restent consultables en ligne.
          }
        } catch (reason) {
          let fallback: AlertCache | null = null;
          try {
            fallback = await readCache<AlertCache>(cacheKey);
          } catch {
            // Sans cache lisible, on remonte l'erreur réseau.
          }

          if (fallback) {
            setAlerts(fallback.alerts);
            setCached(true);
            setError(null);
            setLastUpdated(fallback.savedAt);
          } else {
            setError(
              reason instanceof Error ? reason.message : 'Impossible de charger les alertes.',
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
    [cacheKey, demo, role],
  );

  useEffect(() => {
    void load(false);
  }, [load]);

  useVisiblePolling(() => load(true), {
    enabled: !demo,
    intervalMs: 300_000,
    minGapMs: 60_000,
    refreshOnOnline: true,
  });

  const refresh = useCallback(async () => {
    await load(false);
  }, [load]);

  const acknowledge = useCallback(
    async (id: string) => {
      if (!alerts.some((alert) => alert.id === id)) {
        throw new Error('Alerte introuvable.');
      }

      if (demo) {
        const at = new Date().toISOString();
        setAlerts((current) =>
          current.map((alert) =>
            alert.id === id
              ? {
                  ...alert,
                  acknowledgedAt: at,
                  acknowledgedBy: DEMO_PROFILES.admin.id,
                  acknowledgedByName: DEMO_PROFILES.admin.nom,
                }
              : alert,
          ),
        );
        return;
      }

      const result = await acknowledgeAlert(id);
      const next = alerts.map((alert) =>
        alert.id === id
          ? {
              ...alert,
              acknowledgedAt: result.acknowledgedAt,
              acknowledgedBy: result.acknowledgedBy,
              acknowledgedByName: userName,
            }
          : alert,
      );
      setAlerts(next);

      try {
        await writeCache(cacheKey, {
          alerts: next,
          savedAt: new Date().toISOString(),
        } satisfies AlertCache);
      } catch {
        // L'acquittement est enregistré côté serveur même si le cache local échoue.
      }
    },
    [alerts, cacheKey, demo, userName],
  );

  const value = useMemo<AlertsContextValue>(
    () => ({
      alerts,
      loading,
      cached,
      error,
      lastUpdated,
      toTreatTotal: toTreatCount(alerts),
      refresh,
      acknowledge,
    }),
    [acknowledge, alerts, cached, error, lastUpdated, loading, refresh],
  );

  return <AlertsContext.Provider value={value}>{children}</AlertsContext.Provider>;
}

export function useAlerts(): AlertsContextValue {
  const context = useContext(AlertsContext);
  if (!context) {
    throw new Error('useAlerts doit être utilisé dans AlertsProvider.');
  }
  return context;
}
