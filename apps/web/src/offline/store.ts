import { getOfflineDb } from './db';
import type {
  CloseSessionPayload,
  LocalPayment,
  LocalSale,
  LocalSaleLine,
  LocalSession,
  OutboxRecord,
  SaleOperationPayload,
} from './types';

export interface SaleDraft {
  readonly sessionId: string;
  readonly lines: readonly LocalSaleLine[];
  readonly payments: readonly LocalPayment[];
  readonly sousTotalXof: number;
  readonly remiseXof: number;
  readonly remiseMotif: string | null;
  readonly totalXof: number;
  readonly caissierNom: string;
}

export interface OfflineState {
  readonly session: LocalSession | null;
  readonly sales: readonly LocalSale[];
  readonly pendingCount: number;
  readonly otherAccountPending: number;
}

export interface SessionCashTotals {
  readonly cashSalesXof: number;
  readonly expectedXof: number;
  readonly saleCount: number;
}

export function buildReference(deviceId: string, saleId: string): string {
  const deviceSuffix = deviceId.replace(/-/g, '').slice(-4).toUpperCase();
  const saleCode = saleId.replace(/-/g, '').slice(0, 10).toUpperCase();
  return `PDJ-${deviceSuffix}-${saleCode}`;
}

export function sessionCashTotals(
  sales: readonly LocalSale[],
  session: Pick<LocalSession, 'id' | 'fondOuvertureXof'>,
): SessionCashTotals {
  let cashSalesXof = 0;
  let saleCount = 0;

  for (const sale of sales) {
    if (sale.sessionId !== session.id) {
      continue;
    }

    saleCount += 1;
    for (const payment of sale.payments) {
      if (payment.method === 'cash') {
        cashSalesXof += payment.montantXof;
      }
    }
  }

  return {
    cashSalesXof,
    expectedXof: session.fondOuvertureXof + cashSalesXof,
    saleCount,
  };
}

export function pendingStockDelta(sales: readonly LocalSale[]): Map<string, number> {
  const deltas = new Map<string, number>();

  for (const sale of sales) {
    if (sale.syncStatus === 'synced') {
      continue;
    }

    for (const line of sale.lines) {
      deltas.set(line.variantId, (deltas.get(line.variantId) ?? 0) - line.quantiteStock);
    }
  }

  return deltas;
}

function assertAmount(value: number, label: string): void {
  if (!Number.isSafeInteger(value) || value < 0) {
    throw new Error(`${label} doit être un montant entier positif ou nul.`);
  }
}

async function nextSequence(
  db: ReturnType<typeof getOfflineDb>,
  deviceId: string,
): Promise<number> {
  const key = `sequence:${deviceId}`;
  const current = await db.meta.get(key);
  const next = (current?.value ?? 0) + 1;
  await db.meta.put({ key, value: next });
  return next;
}

async function findOpenSession(
  db: ReturnType<typeof getOfflineDb>,
  deviceId: string,
): Promise<LocalSession | undefined> {
  const sessions = await db.sessions.where('deviceId').equals(deviceId).toArray();
  return sessions.find((session) => session.statut === 'open');
}

export async function queueOpenSession(
  userId: string,
  deviceId: string,
  fondOuvertureXof: number,
  ouverteAt: string,
): Promise<LocalSession> {
  assertAmount(fondOuvertureXof, 'Le fond de caisse');

  const db = getOfflineDb();

  return db.transaction('rw', db.outbox, db.sessions, db.meta, async () => {
    const existing = await findOpenSession(db, deviceId);
    if (existing) {
      throw new Error('Une caisse est déjà ouverte sur cet appareil.');
    }

    const sequence = await nextSequence(db, deviceId);
    const session: LocalSession = {
      id: crypto.randomUUID(),
      userId,
      deviceId,
      fondOuvertureXof,
      ouverteAt,
      statut: 'open',
      fermeeAt: null,
      montantCompteXof: null,
      montantAttenduXof: null,
      ecartXof: null,
      syncStatus: 'pending',
      syncError: null,
    };

    await db.sessions.put(session);
    await db.outbox.put({
      id: session.id,
      kind: 'open_session',
      userId,
      deviceId,
      sequence,
      occurredAt: ouverteAt,
      attempts: 0,
      lastError: null,
      nextAttemptAt: 0,
      payload: {
        id: session.id,
        deviceId,
        fondOuvertureXof,
        ouverteAt,
      },
    });

    return session;
  });
}

export async function queueSale(
  userId: string,
  deviceId: string,
  draft: SaleDraft,
  dateVente: string,
): Promise<LocalSale> {
  if (draft.lines.length === 0) {
    throw new Error('Ajoute au moins un article avant de valider.');
  }
  if (draft.payments.length === 0) {
    throw new Error('Choisis au moins un moyen de paiement.');
  }
  assertAmount(draft.sousTotalXof, 'Le sous-total');
  assertAmount(draft.remiseXof, 'La remise');
  assertAmount(draft.totalXof, 'Le total');

  if (draft.totalXof !== draft.sousTotalXof - draft.remiseXof) {
    throw new Error('Le total ne correspond pas au sous-total et à la remise.');
  }

  const db = getOfflineDb();

  return db.transaction('rw', db.outbox, db.sales, db.sessions, db.meta, async () => {
    const session = await db.sessions.get(draft.sessionId);
    if (!session || session.statut !== 'open' || session.userId !== userId) {
      throw new Error('La caisse n’est plus ouverte. Rouvre une session avant de vendre.');
    }

    const id = crypto.randomUUID();
    const reference = buildReference(deviceId, id);
    const sequence = await nextSequence(db, deviceId);

    const sale: LocalSale = {
      id,
      userId,
      deviceId,
      sessionId: draft.sessionId,
      reference,
      dateVente,
      caissierNom: draft.caissierNom,
      sousTotalXof: draft.sousTotalXof,
      remiseXof: draft.remiseXof,
      remiseMotif: draft.remiseMotif,
      totalXof: draft.totalXof,
      lines: draft.lines,
      payments: draft.payments,
      syncStatus: 'pending',
      syncError: null,
      syncedAt: null,
    };

    const payload: SaleOperationPayload = {
      id,
      deviceId,
      sessionId: draft.sessionId,
      reference,
      dateVente,
      remiseXof: draft.remiseXof,
      remiseMotif: draft.remiseMotif,
      lines: draft.lines.map((line) => ({
        variantId: line.variantId,
        quantiteSaisie: line.quantiteSaisie,
        uniteSaisie: line.uniteSaisie,
        prixUnitaireXof: line.prixUnitaireXof,
      })),
      payments: draft.payments.map((payment) => ({
        method: payment.method,
        montantXof: payment.montantXof,
        referenceMobile: payment.referenceMobile,
        montantRecuXof: payment.montantRecuXof,
      })),
    };

    await db.sales.put(sale);
    await db.outbox.put({
      id: sale.id,
      kind: 'sale',
      userId,
      deviceId,
      sequence,
      occurredAt: dateVente,
      attempts: 0,
      lastError: null,
      nextAttemptAt: 0,
      payload,
    });

    return sale;
  });
}

export async function queueCloseSession(
  userId: string,
  deviceId: string,
  sessionId: string,
  montantCompteXof: number,
  fermeeAt: string,
): Promise<LocalSession> {
  assertAmount(montantCompteXof, 'Le montant compté');

  const db = getOfflineDb();

  return db.transaction('rw', db.outbox, db.sales, db.sessions, db.meta, async () => {
    const session = await db.sessions.get(sessionId);
    if (!session || session.userId !== userId || session.deviceId !== deviceId) {
      throw new Error('Session de caisse introuvable sur cet appareil.');
    }
    if (session.statut !== 'open') {
      throw new Error('Cette caisse est déjà clôturée.');
    }

    const sales = await db.sales.where('sessionId').equals(sessionId).toArray();
    const totals = sessionCashTotals(sales, session);
    const sequence = await nextSequence(db, deviceId);

    const closed: LocalSession = {
      ...session,
      statut: 'closed',
      fermeeAt,
      montantCompteXof,
      montantAttenduXof: totals.expectedXof,
      ecartXof: montantCompteXof - totals.expectedXof,
      syncStatus: 'pending',
      syncError: null,
    };

    const payload: CloseSessionPayload = {
      id: session.id,
      deviceId,
      montantCompteXof,
      fermeeAt,
    };

    await db.sessions.put(closed);
    await db.outbox.put({
      id: session.id,
      kind: 'close_session',
      userId,
      deviceId,
      sequence,
      occurredAt: fermeeAt,
      attempts: 0,
      lastError: null,
      nextAttemptAt: 0,
      payload,
    });

    return closed;
  });
}

export async function loadOfflineState(userId: string, deviceId: string): Promise<OfflineState> {
  const db = getOfflineDb();

  const [sessions, allSales, pendingCount, otherAccountPending] = await Promise.all([
    db.sessions.where('deviceId').equals(deviceId).toArray(),
    db.sales.where('userId').equals(userId).toArray(),
    db.outbox.where('userId').equals(userId).count(),
    db.outbox
      .where('deviceId')
      .equals(deviceId)
      .filter((op) => op.userId !== userId)
      .count(),
  ]);

  const ownSessions = sessions.filter((session) => session.userId === userId);
  const session =
    ownSessions.find((entry) => entry.statut === 'open') ??
    ownSessions.sort((left, right) => right.ouverteAt.localeCompare(left.ouverteAt))[0] ??
    null;

  const sales = allSales
    .filter((sale) => sale.deviceId === deviceId)
    .sort((left, right) => right.dateVente.localeCompare(left.dateVente))
    .slice(0, 60);

  return {
    session,
    sales,
    pendingCount,
    otherAccountPending,
  };
}

export async function listOutbox(userId: string): Promise<OutboxRecord[]> {
  return getOfflineDb().outbox.where('userId').equals(userId).toArray();
}
