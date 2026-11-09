import { useCallback, useEffect, useRef, useState } from 'react';
import type { ProfileSnapshot } from '../types';
import { DEMO_SALES, demoPaymentMethods } from './demo';
import { dayKey, loadSalesJournal } from './sales';
import type { SalesJournal, SalesJournalTicket } from './sales';
import { useVisiblePolling } from '../lib/useVisiblePolling';

function buildDemoJournal(): SalesJournal {
  const today = new Date();
  const jour = dayKey(today);

  const tickets: SalesJournalTicket[] = DEMO_SALES.map((sale, index) => {
    const [hour, minute] = sale.heure.split(':');
    const date = new Date(
      today.getFullYear(),
      today.getMonth(),
      today.getDate(),
      Number(hour ?? 0),
      Number(minute ?? 0),
      0,
      0,
    );

    return {
      id: `${sale.reference}-${index}`,
      reference: sale.reference,
      statut: 'validated',
      dateVente: date.toISOString(),
      heure: sale.heure,
      lignes: sale.lignes,
      totalXof: sale.total,
      remiseXof: 0,
      caissier: sale.caissier,
      methodes: demoPaymentMethods(sale.moyen),
      annuleeAt: null,
      annuleePar: null,
    };
  });

  const total = tickets.reduce((sum, ticket) => sum + ticket.totalXof, 0);
  const cash = tickets
    .filter((ticket) => ticket.methodes[0] === 'cash')
    .reduce((sum, ticket) => sum + ticket.totalXof, 0);
  const profit = Math.round(total * 0.3);

  return {
    role: 'admin',
    jour,
    aujourdHui: jour,
    dernierJourVente: jour,
    ticketsValides: tickets.length,
    ticketsAnnules: 0,
    totalXof: total,
    remiseXof: 0,
    especesXof: cash,
    mobileXof: total - cash,
    coutXof: total - profit,
    beneficeXof: profit,
    tickets,
  };
}

export interface SalesJournalState {
  readonly data: SalesJournal | null;
  readonly loading: boolean;
  readonly error: string | null;
  readonly refresh: () => Promise<void>;
}

export function useSalesJournal(
  profile: ProfileSnapshot,
  demo: boolean,
  day: string | null,
): SalesJournalState {
  const enabled = profile.role !== 'seller';
  const [data, setData] = useState<SalesJournal | null>(() =>
    enabled && demo ? buildDemoJournal() : null,
  );
  const [loading, setLoading] = useState(enabled && !demo);
  const [error, setError] = useState<string | null>(null);
  const requestRef = useRef(0);

  const load = useCallback(
    async (silent: boolean) => {
      if (!enabled || demo) {
        return;
      }

      const request = ++requestRef.current;

      if (!silent) {
        setLoading(true);
      }

      try {
        const next = await loadSalesJournal(day);
        if (request !== requestRef.current) {
          return;
        }
        setData(next);
        setError(null);
      } catch (reason) {
        if (request !== requestRef.current) {
          return;
        }
        setError(
          reason instanceof Error ? reason.message : 'Impossible de charger le journal des ventes.',
        );
      } finally {
        if (!silent && request === requestRef.current) {
          setLoading(false);
        }
      }
    },
    [day, demo, enabled],
  );

  useEffect(() => {
    if (!enabled || demo) {
      return;
    }

    setData(null);
    setError(null);
    void load(false);
  }, [demo, enabled, load]);

  useVisiblePolling(() => load(true), {
    enabled: enabled && !demo,
    intervalMs: 180_000,
    minGapMs: 60_000,
    refreshOnOnline: true,
  });

  const refresh = useCallback(async () => {
    await load(false);
  }, [load]);

  return { data, loading, error, refresh };
}
