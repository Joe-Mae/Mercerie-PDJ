import 'fake-indexeddb/auto';
import { beforeEach, describe, expect, it } from 'vitest';
import { flushOutbox } from './api';
import { getOfflineDb, resetOfflineDb } from './db';
import {
  buildReference,
  loadOfflineState,
  pendingStockDelta,
  queueCloseSession,
  queueOpenSession,
  queueSale,
  sessionCashTotals,
} from './store';
import type { LocalPayment, LocalSale, LocalSaleLine, OutboxRecord } from './types';

const USER = 'a0000000-0000-4000-8000-000000000002';
const OTHER_USER = 'a0000000-0000-4000-8000-000000000003';
const DEVICE = 'd0000000-0000-4000-8000-000000000001';
const VARIANT = 'c0000000-0000-4000-8000-000000000001';
const OPENED_AT = '2026-11-08T08:00:00.000Z';
const SOLD_AT = '2026-11-08T09:00:00.000Z';

function buildLine(overrides: Partial<LocalSaleLine> = {}): LocalSaleLine {
  return {
    id: crypto.randomUUID(),
    variantId: VARIANT,
    designation: 'Coton — Bleu',
    quantiteSaisie: 1,
    uniteSaisie: 'metre',
    quantiteStock: 100,
    prixUnitaireXof: 1500,
    prixPar: 'metre',
    totalXof: 1500,
    ...overrides,
  };
}

function buildPayment(overrides: Partial<LocalPayment> = {}): LocalPayment {
  return {
    id: crypto.randomUUID(),
    method: 'cash',
    montantXof: 1500,
    referenceMobile: null,
    montantRecuXof: 1500,
    renduXof: 0,
    ...overrides,
  };
}

function buildSale(overrides: Partial<LocalSale> = {}): LocalSale {
  return {
    id: crypto.randomUUID(),
    userId: USER,
    deviceId: DEVICE,
    sessionId: 'session-1',
    reference: 'PDJ-0001-0000000001',
    dateVente: SOLD_AT,
    caissierNom: 'Awa',
    sousTotalXof: 1500,
    remiseXof: 0,
    remiseMotif: null,
    totalXof: 1500,
    lines: [buildLine()],
    payments: [buildPayment()],
    syncStatus: 'pending',
    syncError: null,
    syncedAt: null,
    ...overrides,
  };
}

async function openSession(fond = 10_000) {
  return queueOpenSession(USER, DEVICE, fond, OPENED_AT);
}

async function sell(
  sessionId: string,
  payment: LocalPayment = buildPayment(),
  dateVente = SOLD_AT,
) {
  return queueSale(
    USER,
    DEVICE,
    {
      sessionId,
      lines: [buildLine()],
      payments: [payment],
      sousTotalXof: 1500,
      remiseXof: 0,
      remiseMotif: null,
      totalXof: 1500,
      caissierNom: 'Awa',
    },
    dateVente,
  );
}

beforeEach(async () => {
  await resetOfflineDb();
});

describe('références et totaux de caisse', () => {
  it('construit une référence lisible et unique par vente', () => {
    const first = buildReference(DEVICE, 'aaaa0000-0000-4000-8000-000000000001');
    const second = buildReference(DEVICE, 'bbbb0000-0000-4000-8000-000000000002');

    expect(first).toMatch(/^PDJ-[0-9A-F]{4}-[0-9A-F]{10}$/);
    expect(first).not.toBe(second);
  });

  it('ne compte que les espèces de la session dans la caisse attendue', () => {
    const session = { id: 'session-1', fondOuvertureXof: 10_000 };
    const sales: LocalSale[] = [
      buildSale({
        payments: [
          buildPayment({ montantXof: 5_000 }),
          buildPayment({
            method: 'tmoney',
            montantXof: 2_000,
            referenceMobile: 'MP-1',
            montantRecuXof: null,
            renduXof: null,
          }),
        ],
      }),
      buildSale({ payments: [buildPayment({ montantXof: 3_000 })] }),
      buildSale({
        sessionId: 'autre-session',
        payments: [buildPayment({ montantXof: 9_000 })],
      }),
    ];

    expect(sessionCashTotals(sales, session)).toEqual({
      cashSalesXof: 8_000,
      expectedXof: 18_000,
      saleCount: 2,
    });
  });
});

describe('file hors ligne', () => {
  it('ouvre une session et place l’opération en tête de file', async () => {
    const session = await openSession();

    expect(session.statut).toBe('open');
    expect(session.syncStatus).toBe('pending');

    const outbox = await getOfflineDb().outbox.toArray();
    expect(outbox).toHaveLength(1);
    expect(outbox[0]).toMatchObject({
      id: session.id,
      kind: 'open_session',
      userId: USER,
      deviceId: DEVICE,
      sequence: 1,
    });

    const state = await loadOfflineState(USER, DEVICE);
    expect(state.session?.id).toBe(session.id);
    expect(state.pendingCount).toBe(1);
  });

  it('refuse une seconde ouverture sur le même appareil', async () => {
    await openSession();
    await expect(openSession(5_000)).rejects.toThrow(/déjà ouverte/);
  });

  it('refuse un fond de caisse négatif ou non entier', async () => {
    await expect(openSession(-1)).rejects.toThrow(/entier positif ou nul/);
    await expect(openSession(10.5)).rejects.toThrow(/entier positif ou nul/);
  });

  it('refuse une vente sans session ouverte', async () => {
    await expect(
      queueSale(
        USER,
        DEVICE,
        {
          sessionId: 'inconnue',
          lines: [buildLine()],
          payments: [buildPayment()],
          sousTotalXof: 1500,
          remiseXof: 0,
          remiseMotif: null,
          totalXof: 1500,
          caissierNom: 'Awa',
        },
        SOLD_AT,
      ),
    ).rejects.toThrow(/plus ouverte/);
  });

  it('enregistre la vente après l’ouverture avec une séquence croissante', async () => {
    const session = await openSession();
    const sale = await sell(session.id);

    expect(sale.reference).toMatch(/^PDJ-/);
    expect(sale.syncStatus).toBe('pending');

    const outbox = await getOfflineDb().outbox.toArray();
    const ordered = outbox.sort((left, right) => left.sequence - right.sequence);
    expect(ordered.map((operation) => operation.kind)).toEqual(['open_session', 'sale']);
    expect(ordered.map((operation) => operation.sequence)).toEqual([1, 2]);
  });

  it('refuse une vente dont le total ne correspond pas', async () => {
    const session = await openSession();

    await expect(
      queueSale(
        USER,
        DEVICE,
        {
          sessionId: session.id,
          lines: [buildLine()],
          payments: [buildPayment()],
          sousTotalXof: 1500,
          remiseXof: 0,
          remiseMotif: null,
          totalXof: 1400,
          caissierNom: 'Awa',
        },
        SOLD_AT,
      ),
    ).rejects.toThrow(/ne correspond pas/);
  });

  it('déduit les ventes non synchronisées du stock affiché', async () => {
    const session = await openSession();
    const sale = await sell(session.id, buildPayment(), SOLD_AT);

    expect(pendingStockDelta([sale]).get(VARIANT)).toBe(-100);
    expect(pendingStockDelta([{ ...sale, syncStatus: 'synced' }]).size).toBe(0);
  });

  it('clôture avec le montant attendu et l’écart signé', async () => {
    const session = await openSession();
    await sell(session.id, buildPayment({ montantXof: 5_000 }));

    const closed = await queueCloseSession(
      USER,
      DEVICE,
      session.id,
      15_500,
      '2026-11-08T19:00:00.000Z',
    );

    expect(closed.statut).toBe('closed');
    expect(closed.montantAttenduXof).toBe(15_000);
    expect(closed.montantCompteXof).toBe(15_500);
    expect(closed.ecartXof).toBe(500);

    await expect(
      queueCloseSession(USER, DEVICE, session.id, 15_000, '2026-11-08T19:05:00.000Z'),
    ).rejects.toThrow(/déjà clôturée/);
  });

  it('ne mélange pas les opérations d’un autre compte sur l’appareil', async () => {
    await queueOpenSession(OTHER_USER, DEVICE, 2_000, OPENED_AT);

    const state = await loadOfflineState(USER, DEVICE);
    expect(state.session).toBeNull();
    expect(state.sales).toHaveLength(0);
    expect(state.pendingCount).toBe(0);
    expect(state.otherAccountPending).toBe(1);
  });
});

describe('synchronisation de la file', () => {
  it('envoie les opérations dans l’ordre et les marque synchronisées', async () => {
    const session = await openSession();
    const sale = await sell(session.id);
    const sent: OutboxRecord[] = [];

    const result = await flushOutbox(USER, async (operation) => {
      sent.push(operation);
    });

    expect(result).toEqual({ applied: 2, remaining: 0, error: null });
    expect(sent.map((operation) => operation.kind)).toEqual(['open_session', 'sale']);
    expect(await getOfflineDb().outbox.count()).toBe(0);

    const storedSession = await getOfflineDb().sessions.get(session.id);
    const storedSale = await getOfflineDb().sales.get(sale.id);
    expect(storedSession?.syncStatus).toBe('synced');
    expect(storedSale?.syncStatus).toBe('synced');
    expect(storedSale?.syncedAt).not.toBeNull();
  });

  it('ne renvoie jamais une opération déjà synchronisée', async () => {
    const session = await openSession();
    await sell(session.id);

    await flushOutbox(USER, async () => undefined);

    const sent: OutboxRecord[] = [];
    const second = await flushOutbox(USER, async (operation) => {
      sent.push(operation);
    });

    expect(second).toEqual({ applied: 0, remaining: 0, error: null });
    expect(sent).toHaveLength(0);
  });

  it('bloque la file après un échec et conserve l’erreur', async () => {
    const session = await openSession();
    const sale = await sell(session.id);
    const error = new Error('Vente refusée par le serveur');

    const failed = await flushOutbox(USER, async (operation) => {
      if (operation.kind === 'sale') {
        throw error;
      }
    });

    expect(failed.applied).toBe(1);
    expect(failed.remaining).toBe(1);
    expect(failed.error).toContain('Vente refusée');

    const storedSale = await getOfflineDb().sales.get(sale.id);
    expect(storedSale?.syncStatus).toBe('error');
    expect(storedSale?.syncError).toContain('Vente refusée');

    const pending = await getOfflineDb().outbox.toArray();
    expect(pending).toHaveLength(1);
    expect(pending[0]?.attempts).toBe(1);
    expect(pending[0]?.nextAttemptAt).toBeGreaterThan(Date.now());

    const sent: OutboxRecord[] = [];
    const waiting = await flushOutbox(USER, async (operation) => {
      sent.push(operation);
    });

    expect(waiting.applied).toBe(0);
    expect(waiting.remaining).toBe(1);
    expect(waiting.error).toContain('Vente refusée');
    expect(sent).toHaveLength(0);
  });

  it('rejoue une opération en échec uniquement en mode forcé', async () => {
    const session = await openSession();
    const sale = await sell(session.id);

    await flushOutbox(USER, async (operation) => {
      if (operation.kind === 'sale') {
        throw new Error('Réseau indisponible');
      }
    });

    const sent: OutboxRecord[] = [];
    const retried = await flushOutbox(
      USER,
      async (operation) => {
        sent.push(operation);
      },
      true,
    );

    expect(retried).toEqual({ applied: 1, remaining: 0, error: null });
    expect(sent.map((operation) => operation.kind)).toEqual(['sale']);

    const storedSale = await getOfflineDb().sales.get(sale.id);
    expect(storedSale?.syncStatus).toBe('synced');
    expect(storedSale?.syncError).toBeNull();
    expect(await getOfflineDb().outbox.count()).toBe(0);
  });
});
