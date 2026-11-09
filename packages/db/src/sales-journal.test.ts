import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { PGlite } from '@electric-sql/pglite';
import {
  ADMIN_ID,
  BOUTIQUE_ID,
  CASHIER_ID,
  CASH_SESSION_ID,
  DEVICE_ID,
  INACTIVE_ID,
  SELLER_ID,
  VARIANT_ID,
} from './fixtures';
import { asAnonymous, asUser, asUserCommitted, createTestDatabase } from './testing/pglite';
import { seedCatalog, seedUsers } from './testing/seed';

const OTHER_BOUTIQUE_ID = 'b0000000-0000-4000-8000-000000000002';
const OTHER_ADMIN_ID = 'a0000000-0000-4000-8000-000000000020';
const OTHER_DEVICE_ID = 'd0000000-0000-4000-8000-000000000020';

const SALE_A_ID = 'f0000000-0000-4000-8000-000000000301';
const SALE_B_ID = 'f0000000-0000-4000-8000-000000000302';
const SALE_CANCELLED_ID = 'f0000000-0000-4000-8000-000000000303';
const SALE_YESTERDAY_ID = 'f0000000-0000-4000-8000-000000000304';
const SALE_OTHER_ID = 'f0000000-0000-4000-8000-000000000305';
const SALE_PARTIAL_ID = 'f0000000-0000-4000-8000-000000000306';

const LINE_A1_ID = 'f0000000-0000-4000-8000-000000000401';
const LINE_A2_ID = 'f0000000-0000-4000-8000-000000000402';
const LINE_B1_ID = 'f0000000-0000-4000-8000-000000000403';
const LINE_CANCELLED_ID = 'f0000000-0000-4000-8000-000000000404';
const LINE_YESTERDAY_ID = 'f0000000-0000-4000-8000-000000000405';
const LINE_PARTIAL_ID = 'f0000000-0000-4000-8000-000000000406';

interface JournalTicket {
  readonly id: string;
  readonly reference: string;
  readonly statut: 'validated' | 'cancelled';
  readonly date_vente: string;
  readonly heure: string;
  readonly lignes: number;
  readonly total_xof: number;
  readonly remise_xof: number;
  readonly caissier: string;
  readonly methodes: readonly string[];
  readonly annulee_at: string | null;
  readonly annulee_par: string | null;
}

interface JournalPayload {
  readonly role: string;
  readonly jour: string;
  readonly aujourd_hui: string;
  readonly dernier_jour_vente: string | null;
  readonly tickets_valides: number;
  readonly tickets_annules: number;
  readonly total_xof: number;
  readonly remise_xof: number;
  readonly especes_xof: number;
  readonly mobile_xof: number;
  readonly cout_xof: number | null;
  readonly benefice_xof: number | null;
  readonly tickets: readonly JournalTicket[];
}

async function journal(db: PGlite, day: string | null = null): Promise<JournalPayload> {
  const result = await db.query<{ get_sales_journal: JournalPayload }>(
    `select public.get_sales_journal($1::date)`,
    [day],
  );
  const payload = result.rows[0]?.get_sales_journal;
  if (!payload) {
    throw new Error('Le journal n’a rien renvoyé.');
  }
  return payload;
}

function isoMinutesAgo(minutes: number): string {
  return new Date(Date.now() - minutes * 60 * 1000).toISOString();
}

function insertSale(
  db: PGlite,
  values: {
    readonly id: string;
    readonly reference: string;
    readonly date: string;
    readonly total: number;
    readonly status?: 'validated' | 'cancelled';
    readonly boutiqueId?: string;
    readonly cashierId?: string;
    readonly deviceId?: string;
    readonly cashSessionId?: string | null;
    readonly cancelledAt?: string | null;
    readonly cancelledBy?: string | null;
  },
): Promise<unknown> {
  return db.query(
    `insert into public.sales (
       id, boutique_id, reference, cash_session_id, caissier_id, device_id, statut,
       date_vente, sous_total_xof, remise_xof, total_xof, annulee_par, annulee_at
     )
     values ($1, $2, $3, $4, $5, $6, $7, $8, $9, 0, $9, $10, $11)`,
    [
      values.id,
      values.boutiqueId ?? BOUTIQUE_ID,
      values.reference,
      values.cashSessionId ?? null,
      values.cashierId ?? CASHIER_ID,
      values.deviceId ?? DEVICE_ID,
      values.status ?? 'validated',
      values.date,
      values.total,
      values.cancelledBy ?? null,
      values.cancelledAt ?? null,
    ],
  );
}

function insertLine(
  db: PGlite,
  values: {
    readonly id: string;
    readonly saleId: string;
    readonly quantity: number;
    readonly stock: number;
    readonly price: number;
    readonly total: number;
  },
): Promise<unknown> {
  return db.query(
    `insert into public.sale_lines (
       id, sale_id, boutique_id, kind, variant_id, designation,
       quantite_saisie, unite_saisie, quantite_stock, prix_unitaire_xof, prix_par, total_xof
     )
     values ($1, $2, $3, 'article', $4, 'Satin duchesse test — Ivoire', $5, 'metre', $6, $7, 'metre', $8)`,
    [
      values.id,
      values.saleId,
      BOUTIQUE_ID,
      VARIANT_ID,
      values.quantity,
      values.stock,
      values.price,
      values.total,
    ],
  );
}

function insertCost(db: PGlite, lineId: string, amount: number): Promise<unknown> {
  return db.query(
    `insert into public.sale_line_costs (sale_line_id, boutique_id, cout_total_xof)
     values ($1, $2, $3)`,
    [lineId, BOUTIQUE_ID, amount],
  );
}

function insertPayment(
  db: PGlite,
  values: {
    readonly saleId: string;
    readonly method: 'cash' | 'tmoney' | 'flooz';
    readonly amount: number;
    readonly reference?: string;
    readonly received?: number;
    readonly change?: number;
    readonly boutiqueId?: string;
    readonly cashSessionId?: string | null;
  },
): Promise<unknown> {
  return db.query(
    `insert into public.payments (
       id, sale_id, boutique_id, method, montant_xof, cash_session_id,
       reference_mobile, montant_recu_xof, rendu_xof, created_by
     )
     values (gen_random_uuid(), $1, $2, $3, $4, $5, $6, $7, $8, $9)`,
    [
      values.saleId,
      values.boutiqueId ?? BOUTIQUE_ID,
      values.method,
      values.amount,
      values.cashSessionId ?? null,
      values.reference ?? null,
      values.received ?? null,
      values.change ?? null,
      CASHIER_ID,
    ],
  );
}

describe('journal des ventes', () => {
  let db: PGlite;
  let today: string;
  let yesterday: string;
  let tomorrow: string;
  let quietDay: string;

  beforeAll(async () => {
    db = await createTestDatabase();
    await seedUsers(db);
    await seedCatalog(db);

    await db.exec(`
      insert into public.devices (id, boutique_id, nom, plateforme, created_by)
      values ('${DEVICE_ID}', '${BOUTIQUE_ID}', 'Tablette caisse', 'web', '${ADMIN_ID}');

      insert into public.cash_sessions (
        id, boutique_id, device_id, ouverte_par, ouverte_at, fond_ouverture_xof
      )
      values (
        '${CASH_SESSION_ID}', '${BOUTIQUE_ID}', '${DEVICE_ID}', '${CASHIER_ID}',
        now(), 10000
      );

      insert into public.boutiques (id, nom, code)
      values ('${OTHER_BOUTIQUE_ID}', 'Autre boutique', 'AUT');

      insert into auth.users (id, email, raw_app_meta_data, raw_user_meta_data)
      values (
        '${OTHER_ADMIN_ID}', 'autre@test.local',
        '{"role":"admin","actif":true,"boutique_id":"${OTHER_BOUTIQUE_ID}"}'::jsonb,
        '{"nom":"Autre Admin"}'::jsonb
      );

      insert into public.devices (id, boutique_id, nom, plateforme, created_by)
      values (
        '${OTHER_DEVICE_ID}', '${OTHER_BOUTIQUE_ID}', 'Caisse autre', 'web',
        '${OTHER_ADMIN_ID}'
      );
    `);

    await insertSale(db, {
      id: SALE_A_ID,
      reference: 'JRN-A',
      date: isoMinutesAgo(30),
      total: 10000,
      cashSessionId: CASH_SESSION_ID,
    });
    await insertLine(db, {
      id: LINE_A1_ID,
      saleId: SALE_A_ID,
      quantity: 1.5,
      stock: 150,
      price: 5000,
      total: 7500,
    });
    await insertCost(db, LINE_A1_ID, 4500);
    await insertLine(db, {
      id: LINE_A2_ID,
      saleId: SALE_A_ID,
      quantity: 0.5,
      stock: 50,
      price: 5000,
      total: 2500,
    });
    await insertCost(db, LINE_A2_ID, 1500);
    await insertPayment(db, {
      saleId: SALE_A_ID,
      method: 'cash',
      amount: 6000,
      received: 10000,
      change: 4000,
      cashSessionId: CASH_SESSION_ID,
    });
    await insertPayment(db, {
      saleId: SALE_A_ID,
      method: 'tmoney',
      amount: 4000,
      reference: 'JRN-MOMO-1',
    });

    await insertSale(db, {
      id: SALE_B_ID,
      reference: 'JRN-B',
      date: isoMinutesAgo(20),
      total: 5000,
      cashSessionId: CASH_SESSION_ID,
    });
    await insertLine(db, {
      id: LINE_B1_ID,
      saleId: SALE_B_ID,
      quantity: 1,
      stock: 100,
      price: 5000,
      total: 5000,
    });
    await insertCost(db, LINE_B1_ID, 3000);
    await insertPayment(db, {
      saleId: SALE_B_ID,
      method: 'flooz',
      amount: 5000,
      reference: 'JRN-FLOOZ-1',
    });

    await insertSale(db, {
      id: SALE_CANCELLED_ID,
      reference: 'JRN-ANNULEE',
      date: isoMinutesAgo(40),
      total: 99999,
      status: 'cancelled',
      cashSessionId: CASH_SESSION_ID,
      cancelledBy: ADMIN_ID,
      cancelledAt: new Date().toISOString(),
    });
    await insertLine(db, {
      id: LINE_CANCELLED_ID,
      saleId: SALE_CANCELLED_ID,
      quantity: 2,
      stock: 200,
      price: 5000,
      total: 10000,
    });

    await insertSale(db, {
      id: SALE_YESTERDAY_ID,
      reference: 'JRN-VEILLE',
      date: isoMinutesAgo(24 * 60),
      total: 10000,
      cashSessionId: CASH_SESSION_ID,
    });
    await insertLine(db, {
      id: LINE_YESTERDAY_ID,
      saleId: SALE_YESTERDAY_ID,
      quantity: 2,
      stock: 200,
      price: 5000,
      total: 10000,
    });
    await insertCost(db, LINE_YESTERDAY_ID, 6000);
    await insertPayment(db, {
      saleId: SALE_YESTERDAY_ID,
      method: 'tmoney',
      amount: 10000,
      reference: 'JRN-MOMO-VEILLE',
    });

    await insertSale(db, {
      id: SALE_OTHER_ID,
      reference: 'JRN-AUTRE',
      date: isoMinutesAgo(10),
      total: 77777,
      boutiqueId: OTHER_BOUTIQUE_ID,
      cashierId: OTHER_ADMIN_ID,
      deviceId: OTHER_DEVICE_ID,
    });

    const days = await db.query<{
      today: string;
      yesterday: string;
      tomorrow: string;
      quiet: string;
    }>(
      `select
         to_char(today, 'YYYY-MM-DD') as today,
         to_char(today - 1, 'YYYY-MM-DD') as yesterday,
         to_char(today + 1, 'YYYY-MM-DD') as tomorrow,
         to_char(today - 10, 'YYYY-MM-DD') as quiet
       from (
         select (now() at time zone 'Africa/Lome')::date as today
       ) d`,
    );
    today = days.rows[0]?.today ?? '';
    yesterday = days.rows[0]?.yesterday ?? '';
    tomorrow = days.rows[0]?.tomorrow ?? '';
    quietDay = days.rows[0]?.quiet ?? '';
  });

  afterAll(async () => {
    await db.close();
  });

  it('refuse le vendeur, le compte inactif et l’anonyme', async () => {
    await expect(
      asUser(db, SELLER_ID, () => db.query(`select public.get_sales_journal()`)),
    ).rejects.toThrow(/autre rôle/);

    await expect(
      asUser(db, INACTIVE_ID, () => db.query(`select public.get_sales_journal()`)),
    ).rejects.toThrow(/inactif|authentifié/);

    await expect(
      asAnonymous(db, () => db.query(`select public.get_sales_journal()`)),
    ).rejects.toThrow(/inactif|authentifié|permission denied/);
  });

  it('liste les tickets du jour, annulés compris, et totalise les validés', async () => {
    const data = await asUserCommitted(db, ADMIN_ID, () => journal(db));

    expect(data.role).toBe('admin');
    expect(data.jour).toBe(today);
    expect(data.aujourd_hui).toBe(today);
    expect(data.dernier_jour_vente).toBe(today);
    expect(data.tickets_valides).toBe(2);
    expect(data.tickets_annules).toBe(1);
    expect(data.total_xof).toBe(15000);
    expect(data.remise_xof).toBe(0);
    expect(data.especes_xof).toBe(6000);
    expect(data.mobile_xof).toBe(9000);
    expect(data.cout_xof).toBe(9000);
    expect(data.benefice_xof).toBe(6000);

    expect(data.tickets.map((ticket) => ticket.reference)).toEqual([
      'JRN-B',
      'JRN-A',
      'JRN-ANNULEE',
    ]);

    const latest = data.tickets[0];
    expect(latest).toMatchObject({
      statut: 'validated',
      lignes: 1,
      total_xof: 5000,
      caissier: 'Caisse Test',
      methodes: ['flooz'],
      annulee_at: null,
      annulee_par: null,
    });
    expect(latest?.heure).toMatch(/^\d{2}:\d{2}$/);

    const cancelled = data.tickets.find((ticket) => ticket.statut === 'cancelled');
    expect(cancelled).toMatchObject({
      reference: 'JRN-ANNULEE',
      total_xof: 99999,
      annulee_par: 'Admin Test',
    });
    expect(cancelled?.annulee_at).toBeTruthy();
  });

  it('affiche une journée passée et exclut les autres boutiques', async () => {
    const data = await asUserCommitted(db, ADMIN_ID, () => journal(db, yesterday));

    expect(data.jour).toBe(yesterday);
    expect(data.tickets_valides).toBe(1);
    expect(data.tickets_annules).toBe(0);
    expect(data.total_xof).toBe(10000);
    expect(data.mobile_xof).toBe(10000);
    expect(data.especes_xof).toBe(0);
    expect(data.cout_xof).toBe(6000);
    expect(data.benefice_xof).toBe(4000);
    expect(data.dernier_jour_vente).toBe(today);
    expect(data.tickets.map((ticket) => ticket.reference)).toEqual(['JRN-VEILLE']);
  });

  it('renvoie un journal vide pour une journée sans vente', async () => {
    const data = await asUserCommitted(db, ADMIN_ID, () => journal(db, quietDay));

    expect(data.jour).toBe(quietDay);
    expect(data.tickets).toEqual([]);
    expect(data.tickets_valides).toBe(0);
    expect(data.total_xof).toBe(0);
    expect(data.benefice_xof).toBeNull();
    expect(data.dernier_jour_vente).toBe(today);
  });

  it('cache les coûts et le bénéfice au caissier', async () => {
    const data = await asUserCommitted(db, CASHIER_ID, () => journal(db));

    expect(data.role).toBe('cashier');
    expect(data.total_xof).toBe(15000);
    expect(data.cout_xof).toBeNull();
    expect(data.benefice_xof).toBeNull();
    expect(data.tickets).toHaveLength(3);
  });

  it('refuse une journée à venir', async () => {
    await expect(asUserCommitted(db, ADMIN_ID, () => journal(db, tomorrow))).rejects.toThrow(
      /journée à venir/,
    );
  });

  it('ne calcule pas de bénéfice quand un coût d’achat manque', async () => {
    await insertSale(db, {
      id: SALE_PARTIAL_ID,
      reference: 'JRN-SANS-COUT',
      date: isoMinutesAgo(0),
      total: 2000,
      cashSessionId: CASH_SESSION_ID,
    });
    await insertLine(db, {
      id: LINE_PARTIAL_ID,
      saleId: SALE_PARTIAL_ID,
      quantity: 0.4,
      stock: 40,
      price: 5000,
      total: 2000,
    });
    await insertPayment(db, {
      saleId: SALE_PARTIAL_ID,
      method: 'tmoney',
      amount: 2000,
      reference: 'JRN-MOMO-2',
    });

    const data = await asUserCommitted(db, ADMIN_ID, () => journal(db));

    expect(data.tickets_valides).toBe(3);
    expect(data.total_xof).toBe(17000);
    expect(data.cout_xof).toBe(9000);
    expect(data.benefice_xof).toBeNull();
    expect(data.tickets).toHaveLength(4);
  });
});
