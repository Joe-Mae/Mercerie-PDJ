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
import { useStock } from '../data/StockProvider';
import { getDeviceId } from '../lib/supabase';
import { flushOutbox, sendOutboxOperation } from './api';
import {
  buildReference,
  loadOfflineState,
  pendingStockDelta,
  queueCloseSession,
  queueOpenSession,
  queueSale,
  sessionCashTotals,
  type SaleDraft,
  type SessionCashTotals,
} from './store';
import type { LocalSale, LocalSession } from './types';

export interface CompleteSaleInput {
  readonly lines: SaleDraft['lines'];
  readonly payments: SaleDraft['payments'];
  readonly sousTotalXof: number;
  readonly remiseXof: number;
  readonly remiseMotif: string | null;
  readonly totalXof: number;
  readonly caissierNom: string;
}

interface OfflineContextValue {
  readonly deviceId: string;
  readonly session: LocalSession | null;
  readonly sales: readonly LocalSale[];
  readonly pendingCount: number;
  readonly otherAccountPending: number;
  readonly syncing: boolean;
  readonly syncError: string | null;
  readonly lastSyncAt: string | null;
  readonly totals: SessionCashTotals;
  readonly openSession: (fondOuvertureXof: number) => Promise<LocalSession>;
  readonly completeSale: (input: CompleteSaleInput) => Promise<LocalSale>;
  readonly closeSession: (montantCompteXof: number) => Promise<LocalSession>;
  readonly retrySync: () => Promise<void>;
  readonly pendingDeltaFor: (variantId: string) => number;
}

const OfflineContext = createContext<OfflineContextValue | null>(null);

interface OfflineProviderProps {
  readonly userId: string;
  readonly isOnline: boolean;
  readonly demo: boolean;
  readonly children: ReactNode;
}

const EMPTY_TOTALS: SessionCashTotals = {
  cashSalesXof: 0,
  expectedXof: 0,
  saleCount: 0,
};

function nowIso(): string {
  return new Date().toISOString();
}

export function OfflineProvider({ userId, isOnline, demo, children }: OfflineProviderProps) {
  const deviceId = useMemo(() => getDeviceId(), []);
  const { refreshLevels } = useStock();
  const mountedRef = useRef(true);

  const [session, setSession] = useState<LocalSession | null>(null);
  const [sales, setSales] = useState<readonly LocalSale[]>([]);
  const [pendingCount, setPendingCount] = useState(0);
  const [otherAccountPending, setOtherAccountPending] = useState(0);
  const [syncing, setSyncing] = useState(false);
  const [syncError, setSyncError] = useState<string | null>(null);
  const [lastSyncAt, setLastSyncAt] = useState<string | null>(null);

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
    };
  }, []);

  const reload = useCallback(async () => {
    if (demo) {
      return;
    }

    const state = await loadOfflineState(userId, deviceId);
    if (!mountedRef.current) {
      return;
    }

    setSession(state.session);
    setSales(state.sales);
    setPendingCount(state.pendingCount);
    setOtherAccountPending(state.otherAccountPending);
  }, [demo, deviceId, userId]);

  const sync = useCallback(
    async (force: boolean) => {
      if (demo || !isOnline) {
        return;
      }

      setSyncing(true);
      try {
        const result = await flushOutbox(userId, sendOutboxOperation, force);
        if (!mountedRef.current) {
          return;
        }

        setSyncError(result.error);
        if (result.applied > 0) {
          setLastSyncAt(nowIso());
          await refreshLevels();
        }
        await reload();
      } catch (cause) {
        if (mountedRef.current) {
          setSyncError(cause instanceof Error ? cause.message : 'La synchronisation a échoué.');
        }
      } finally {
        if (mountedRef.current) {
          setSyncing(false);
        }
      }
    },
    [demo, isOnline, refreshLevels, reload, userId],
  );

  useEffect(() => {
    void reload();
  }, [reload]);

  useEffect(() => {
    if (isOnline) {
      void sync(false);
    }
  }, [isOnline, sync]);

  const demoOpenSession = useCallback(
    (fondOuvertureXof: number): LocalSession => {
      if (!Number.isSafeInteger(fondOuvertureXof) || fondOuvertureXof < 0) {
        throw new Error('Le fond de caisse doit être un montant entier positif ou nul.');
      }
      if (session?.statut === 'open') {
        throw new Error('Une caisse est déjà ouverte sur cet appareil.');
      }

      const created: LocalSession = {
        id: crypto.randomUUID(),
        userId,
        deviceId,
        fondOuvertureXof,
        ouverteAt: nowIso(),
        statut: 'open',
        fermeeAt: null,
        montantCompteXof: null,
        montantAttenduXof: null,
        ecartXof: null,
        syncStatus: 'synced',
        syncError: null,
      };
      setSession(created);
      return created;
    },
    [deviceId, session, userId],
  );

  const openSession = useCallback(
    async (fondOuvertureXof: number): Promise<LocalSession> => {
      if (demo) {
        return demoOpenSession(fondOuvertureXof);
      }

      const created = await queueOpenSession(userId, deviceId, fondOuvertureXof, nowIso());
      await reload();
      if (isOnline) {
        void sync(false);
      }
      return created;
    },
    [demo, demoOpenSession, deviceId, isOnline, reload, sync, userId],
  );

  const demoCompleteSale = useCallback(
    (input: CompleteSaleInput): LocalSale => {
      if (!session || session.statut !== 'open') {
        throw new Error('La caisse n’est plus ouverte. Rouvre une session avant de vendre.');
      }

      const id = crypto.randomUUID();
      const sale: LocalSale = {
        id,
        userId,
        deviceId,
        sessionId: session.id,
        reference: buildReference(deviceId, id),
        dateVente: nowIso(),
        caissierNom: input.caissierNom,
        sousTotalXof: input.sousTotalXof,
        remiseXof: input.remiseXof,
        remiseMotif: input.remiseMotif,
        totalXof: input.totalXof,
        lines: input.lines,
        payments: input.payments,
        syncStatus: 'synced',
        syncError: null,
        syncedAt: nowIso(),
      };

      setSales((current) => [sale, ...current]);
      return sale;
    },
    [deviceId, session, userId],
  );

  const completeSale = useCallback(
    async (input: CompleteSaleInput): Promise<LocalSale> => {
      if (demo) {
        return demoCompleteSale(input);
      }
      if (!session || session.statut !== 'open') {
        throw new Error('La caisse n’est plus ouverte. Rouvre une session avant de vendre.');
      }

      const sale = await queueSale(
        userId,
        deviceId,
        {
          sessionId: session.id,
          lines: input.lines,
          payments: input.payments,
          sousTotalXof: input.sousTotalXof,
          remiseXof: input.remiseXof,
          remiseMotif: input.remiseMotif,
          totalXof: input.totalXof,
          caissierNom: input.caissierNom,
        },
        nowIso(),
      );

      await reload();
      if (isOnline) {
        void sync(false);
      }
      return sale;
    },
    [demo, demoCompleteSale, deviceId, isOnline, reload, session, sync, userId],
  );

  const closeSession = useCallback(
    async (montantCompteXof: number): Promise<LocalSession> => {
      if (!session || session.statut !== 'open') {
        throw new Error('Aucune caisse ouverte à clôturer.');
      }
      if (!Number.isSafeInteger(montantCompteXof) || montantCompteXof < 0) {
        throw new Error('Le montant compté doit être un montant entier positif ou nul.');
      }

      if (demo) {
        const totals = sessionCashTotals(sales, session);
        const closed: LocalSession = {
          ...session,
          statut: 'closed',
          fermeeAt: nowIso(),
          montantCompteXof,
          montantAttenduXof: totals.expectedXof,
          ecartXof: montantCompteXof - totals.expectedXof,
          syncStatus: 'synced',
          syncError: null,
        };
        setSession(closed);
        return closed;
      }

      const closed = await queueCloseSession(
        userId,
        deviceId,
        session.id,
        montantCompteXof,
        nowIso(),
      );
      await reload();
      if (isOnline) {
        void sync(false);
      }
      return closed;
    },
    [demo, deviceId, isOnline, reload, sales, session, sync, userId],
  );

  const retrySync = useCallback(async () => {
    if (demo) {
      return;
    }
    if (!isOnline) {
      setSyncError('Tu es hors ligne. La synchronisation reprendra au retour du réseau.');
      return;
    }
    await sync(true);
  }, [demo, isOnline, sync]);

  const totals = useMemo(
    () => (session ? sessionCashTotals(sales, session) : EMPTY_TOTALS),
    [sales, session],
  );

  const adjustments = useMemo(() => pendingStockDelta(sales), [sales]);

  const pendingDeltaFor = useCallback(
    (variantId: string) => adjustments.get(variantId) ?? 0,
    [adjustments],
  );

  const value = useMemo<OfflineContextValue>(
    () => ({
      deviceId,
      session,
      sales,
      pendingCount: demo ? 0 : pendingCount,
      otherAccountPending,
      syncing,
      syncError,
      lastSyncAt,
      totals,
      openSession,
      completeSale,
      closeSession,
      retrySync,
      pendingDeltaFor,
    }),
    [
      closeSession,
      completeSale,
      demo,
      deviceId,
      lastSyncAt,
      openSession,
      otherAccountPending,
      pendingCount,
      pendingDeltaFor,
      retrySync,
      sales,
      session,
      syncError,
      syncing,
      totals,
    ],
  );

  return <OfflineContext.Provider value={value}>{children}</OfflineContext.Provider>;
}

export function useOffline(): OfflineContextValue {
  const context = useContext(OfflineContext);
  if (!context) {
    throw new Error('useOffline doit être utilisé dans OfflineProvider.');
  }
  return context;
}
