import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { PGlite } from '@electric-sql/pglite';
import {
  ADMIN_ID,
  ARTICLE_ID,
  BOUTIQUE_ID,
  CASHIER_ID,
  CASH_SESSION_ID,
  DEVICE_ID,
  SELLER_ID,
  VARIANT_ID,
} from './fixtures';
import { asUser, asUserCommitted, createTestDatabase } from './testing/pglite';
import { seedCatalog, seedSaleData, seedUsers } from './testing/seed';

const OPEN_DEVICE_ID = 'd0000000-0000-4000-8000-000000000010';
const CLOSE_DEVICE_ID = 'd0000000-0000-4000-8000-000000000011';
const OPEN_SESSION_ID = 'f0000000-0000-4000-8000-000000000010';
const CLOSE_SESSION_ID = 'f0000000-0000-4000-8000-000000000011';
const PRICE_VARIANT_ID = 'e0000000-0000-4000-8000-000000000010';

const SALE_CASH_ID = 'f0000000-0000-4000-8000-000000000020';
const SALE_BAD_PRICE_ID = 'f0000000-0000-4000-8000-000000000021';
const SALE_BAD_PAYMENT_ID = 'f0000000-0000-4000-8000-000000000022';
const SALE_DISCOUNT_ID = 'f0000000-0000-4000-8000-000000000023';
const SALE_OLD_PRICE_ID = 'f0000000-0000-4000-8000-000000000024';
const SALE_INACTIVE_ID = 'f0000000-0000-4000-8000-000000000025';

async function scalar<T>(db: PGlite, sql: string, params: unknown[] = []): Promise<T | undefined> {
  const result = await db.query<T>(sql, params);
  return result.rows[0];
}

function saleCall(
  db: PGlite,
  id: string,
  reference: string,
  options: {
    readonly variantId?: string;
    readonly date?: string;
    readonly price?: number;
    readonly quantity?: number;
    readonly remise?: number;
    readonly motif?: string | null;
    readonly payments?: readonly Record<string, unknown>[];
    readonly sessionId?: string;
    readonly deviceId?: string;
  } = {},
): Promise<unknown> {
  const date = options.date ?? new Date().toISOString();
  const lines = [
    {
      variant_id: options.variantId ?? VARIANT_ID,
      quantite_saisie: options.quantity ?? 1.5,
      unite_saisie: 'metre',
      prix_unitaire_xof: options.price ?? 5000,
    },
  ];
  const payments = options.payments ?? [
    { method: 'cash', montant_xof: 7500, montant_recu_xof: 10000 },
  ];

  return db.query(`select public.create_sale($1, $2, $3, $4, $5, $6, $7, $8::jsonb, $9::jsonb)`, [
    id,
    options.deviceId ?? DEVICE_ID,
    options.sessionId ?? CASH_SESSION_ID,
    reference,
    date,
    options.remise ?? 0,
    options.motif ?? null,
    JSON.stringify(lines),
    JSON.stringify(payments),
  ]);
}

describe('opérations de caisse et de vente', () => {
  let db: PGlite;

  beforeAll(async () => {
    db = await createTestDatabase();
    await seedUsers(db);
    await seedCatalog(db);
    await seedSaleData(db);

    await db.exec(`
      insert into public.devices (id, boutique_id, nom, plateforme, created_by)
      values
        ('${OPEN_DEVICE_ID}', '${BOUTIQUE_ID}', 'Tablette ouverture', 'web', '${ADMIN_ID}'),
        ('${CLOSE_DEVICE_ID}', '${BOUTIQUE_ID}', 'Tablette clôture', 'web', '${ADMIN_ID}');
    `);
  });

  afterAll(async () => {
    await db.close();
  });

  it('ouvre une session de caisse et rejoue sans doublon', async () => {
    const first = await asUserCommitted(db, CASHIER_ID, () =>
      scalar<{ open_cash_session: { id: string; rejoue: boolean; statut: string } }>(
        db,
        `select public.open_cash_session($1, $2, 5000, now())`,
        [OPEN_SESSION_ID, OPEN_DEVICE_ID],
      ),
    );

    expect(first?.open_cash_session).toMatchObject({
      id: OPEN_SESSION_ID,
      statut: 'open',
      rejoue: false,
    });

    const replay = await asUserCommitted(db, CASHIER_ID, () =>
      scalar<{ open_cash_session: { id: string; rejoue: boolean } }>(
        db,
        `select public.open_cash_session($1, $2, 5000, now())`,
        [OPEN_SESSION_ID, OPEN_DEVICE_ID],
      ),
    );

    expect(replay?.open_cash_session.rejoue).toBe(true);

    const count = await scalar<{ total: number }>(
      db,
      `select count(*)::int as total from public.cash_sessions where device_id = $1`,
      [OPEN_DEVICE_ID],
    );
    expect(count?.total).toBe(1);

    await expect(
      asUserCommitted(db, CASHIER_ID, () =>
        db.query(`select public.open_cash_session(gen_random_uuid(), $1, 1000, now())`, [
          OPEN_DEVICE_ID,
        ]),
      ),
    ).rejects.toThrow(/déjà ouverte/);

    await expect(
      asUserCommitted(db, SELLER_ID, () =>
        db.query(`select public.open_cash_session(gen_random_uuid(), $1, 1000, now())`, [
          CLOSE_DEVICE_ID,
        ]),
      ),
    ).rejects.toThrow(/autre rôle/);
  });

  it('clôture une session, calcule l’écart et crée une alerte', async () => {
    await asUserCommitted(db, CASHIER_ID, () =>
      db.query(`select public.open_cash_session($1, $2, 10000, now())`, [
        CLOSE_SESSION_ID,
        CLOSE_DEVICE_ID,
      ]),
    );

    await db.query(
      `insert into public.cash_movements
        (id, boutique_id, session_id, type, direction, montant_xof, motif, created_by)
       values (gen_random_uuid(), $1, $2, 'deposit', 'in', 5000, 'Apport de monnaie', $3)`,
      [BOUTIQUE_ID, CLOSE_SESSION_ID, CASHIER_ID],
    );

    const closed = await asUserCommitted(db, CASHIER_ID, () =>
      scalar<{
        close_cash_session: {
          statut: string;
          montant_attendu_xof: number;
          ecart_xof: number;
          rejoue: boolean;
        };
      }>(db, `select public.close_cash_session($1, $2, 14000, now())`, [
        CLOSE_SESSION_ID,
        CLOSE_DEVICE_ID,
      ]),
    );

    expect(closed?.close_cash_session).toMatchObject({
      statut: 'closed',
      montant_attendu_xof: 15000,
      ecart_xof: -1000,
      rejoue: false,
    });

    const alert = await scalar<{ severity: string }>(
      db,
      `select severity::text from public.alerts
       where cash_session_id = $1 and type = 'cash_gap'`,
      [CLOSE_SESSION_ID],
    );
    expect(alert?.severity).toBe('warning');

    const replay = await asUserCommitted(db, CASHIER_ID, () =>
      scalar<{ close_cash_session: { rejoue: boolean } }>(
        db,
        `select public.close_cash_session($1, $2, 14000, now())`,
        [CLOSE_SESSION_ID, CLOSE_DEVICE_ID],
      ),
    );
    expect(replay?.close_cash_session.rejoue).toBe(true);

    await expect(
      asUserCommitted(db, CASHIER_ID, () =>
        db.query(`select public.close_cash_session($1, $2, 15000, now())`, [
          CLOSE_SESSION_ID,
          CLOSE_DEVICE_ID,
        ]),
      ),
    ).rejects.toThrow(/déjà clôturée/);
  });

  it('enregistre une vente, déduit le stock et trace les paiements', async () => {
    const saleDate = new Date().toISOString();
    const created = await asUserCommitted(db, CASHIER_ID, () =>
      scalar<{
        create_sale: {
          id: string;
          total_xof: number;
          sous_total_xof: number;
          rejoue: boolean;
        };
      }>(db, `select public.create_sale($1, $2, $3, $4, $5, 0, null, $6::jsonb, $7::jsonb)`, [
        SALE_CASH_ID,
        DEVICE_ID,
        CASH_SESSION_ID,
        'CAISSE-0001',
        saleDate,
        JSON.stringify([
          {
            variant_id: VARIANT_ID,
            quantite_saisie: 1.5,
            unite_saisie: 'metre',
            prix_unitaire_xof: 5000,
          },
        ]),
        JSON.stringify([{ method: 'cash', montant_xof: 7500, montant_recu_xof: 10000 }]),
      ]),
    );

    expect(created?.create_sale).toMatchObject({
      id: SALE_CASH_ID,
      sous_total_xof: 7500,
      total_xof: 7500,
      rejoue: false,
    });

    const stock = await scalar<{ quantite: number }>(
      db,
      `select quantite from public.stock_levels where variant_id = $1`,
      [VARIANT_ID],
    );
    expect(stock?.quantite).toBe(-150);

    const line = await scalar<{ quantite_stock: number; prix_unitaire_xof: number }>(
      db,
      `select quantite_stock, prix_unitaire_xof from public.sale_lines where sale_id = $1`,
      [SALE_CASH_ID],
    );
    expect(line).toEqual({ quantite_stock: 150, prix_unitaire_xof: 5000 });

    const cost = await scalar<{ cout_total_xof: number }>(
      db,
      `select cout_total_xof from public.sale_line_costs where boutique_id = $1
       order by created_at desc limit 1`,
      [BOUTIQUE_ID],
    );
    expect(cost?.cout_total_xof).toBe(4500);

    const payment = await scalar<{ rendu_xof: number; cash_session_id: string }>(
      db,
      `select rendu_xof, cash_session_id from public.payments where sale_id = $1`,
      [SALE_CASH_ID],
    );
    expect(payment).toEqual({ rendu_xof: 2500, cash_session_id: CASH_SESSION_ID });

    const movement = await scalar<{ montant_xof: number; direction: string }>(
      db,
      `select montant_xof, direction::text from public.cash_movements where sale_id = $1`,
      [SALE_CASH_ID],
    );
    expect(movement).toEqual({ montant_xof: 7500, direction: 'in' });

    const replay = await asUserCommitted(db, CASHIER_ID, () =>
      scalar<{ create_sale: { rejoue: boolean } }>(
        db,
        `select public.create_sale($1, $2, $3, $4, $5, 0, null, $6::jsonb, $7::jsonb)`,
        [
          SALE_CASH_ID,
          DEVICE_ID,
          CASH_SESSION_ID,
          'CAISSE-0001',
          saleDate,
          JSON.stringify([
            {
              variant_id: VARIANT_ID,
              quantite_saisie: 1.5,
              unite_saisie: 'metre',
              prix_unitaire_xof: 5000,
            },
          ]),
          JSON.stringify([{ method: 'cash', montant_xof: 7500, montant_recu_xof: 10000 }]),
        ],
      ),
    );

    expect(replay?.create_sale.rejoue).toBe(true);

    const afterReplay = await scalar<{ quantite: number }>(
      db,
      `select quantite from public.stock_levels where variant_id = $1`,
      [VARIANT_ID],
    );
    expect(afterReplay?.quantite).toBe(-150);

    const movements = await scalar<{ total: number }>(
      db,
      `select count(*)::int as total from public.stock_movements
       where sale_line_id in (select id from public.sale_lines where sale_id = $1)`,
      [SALE_CASH_ID],
    );
    expect(movements?.total).toBe(1);
  });

  it('refuse un prix falsifié, un total incohérent et un vendeur', async () => {
    await expect(
      asUserCommitted(db, CASHIER_ID, () =>
        saleCall(db, SALE_BAD_PRICE_ID, 'CAISSE-0002', { price: 4000 }),
      ),
    ).rejects.toThrow(/prix.*changé/);

    const badPrice = await scalar<{ id: string }>(db, `select id from public.sales where id = $1`, [
      SALE_BAD_PRICE_ID,
    ]);
    expect(badPrice).toBeUndefined();

    await expect(
      asUserCommitted(db, CASHIER_ID, () =>
        saleCall(db, SALE_BAD_PAYMENT_ID, 'CAISSE-0003', {
          payments: [{ method: 'cash', montant_xof: 7000, montant_recu_xof: 7000 }],
        }),
      ),
    ).rejects.toThrow(/somme des paiements/);

    await expect(
      asUserCommitted(db, SELLER_ID, () => saleCall(db, SALE_BAD_PAYMENT_ID, 'CAISSE-0004')),
    ).rejects.toThrow(/autre rôle/);

    await expect(
      asUserCommitted(db, CASHIER_ID, () =>
        saleCall(db, SALE_DISCOUNT_ID, 'CAISSE-0005', {
          remise: 500,
          motif: 'Geste commercial',
          payments: [{ method: 'tmoney', montant_xof: 7000, reference_mobile: 'MOMO-001' }],
        }),
      ),
    ).rejects.toThrow(/réservées aux administrateurs/);
  });

  it('accepte un prix antérieur à un changement de prix', async () => {
    await db.exec(`
      insert into public.variants (
        id, boutique_id, article_id, couleur, code_court, dimension, unite_vente,
        prix_vente_xof, seuil_alerte
      )
      values (
        '${PRICE_VARIANT_ID}', '${BOUTIQUE_ID}', '${ARTICLE_ID}', 'Bleu',
        'SAT-PRIX', 'length', 'metre', 5000, 0
      );

      insert into public.variant_costs (variant_id, boutique_id, prix_achat_xof)
      values ('${PRICE_VARIANT_ID}', '${BOUTIQUE_ID}', 3000);

      update public.variants set prix_vente_xof = 6000 where id = '${PRICE_VARIANT_ID}';
    `);

    const saleDate = new Date(Date.now() - 60 * 60 * 1000).toISOString();

    const created = await asUserCommitted(db, CASHIER_ID, () =>
      saleCall(db, SALE_OLD_PRICE_ID, 'CAISSE-0006', {
        variantId: PRICE_VARIANT_ID,
        date: saleDate,
        quantity: 1,
        price: 5000,
        payments: [{ method: 'tmoney', montant_xof: 5000, reference_mobile: 'MOMO-002' }],
      }),
    );

    expect(created).toBeDefined();
    const sale = await scalar<{ total_xof: number }>(
      db,
      `select total_xof from public.sales where id = $1`,
      [SALE_OLD_PRICE_ID],
    );
    expect(sale?.total_xof).toBe(5000);
  });

  it('refuse une variante inactive et une session d’un autre appareil', async () => {
    await expect(
      asUserCommitted(db, CASHIER_ID, () =>
        saleCall(db, SALE_INACTIVE_ID, 'CAISSE-0007', {
          variantId: 'e0000000-0000-4000-8000-000000000003',
        }),
      ),
    ).rejects.toThrow(/Variante active introuvable/);

    await expect(
      asUserCommitted(db, CASHIER_ID, () =>
        saleCall(db, SALE_INACTIVE_ID, 'CAISSE-0008', { deviceId: OPEN_DEVICE_ID }),
      ),
    ).rejects.toThrow(/autre appareil/);
  });

  it('autorise une remise administrateur motivée', async () => {
    const created = await asUserCommitted(db, ADMIN_ID, () =>
      saleCall(db, SALE_DISCOUNT_ID, 'CAISSE-0009', {
        remise: 500,
        motif: 'Geste commercial',
        payments: [{ method: 'tmoney', montant_xof: 7000, reference_mobile: 'MOMO-003' }],
      }),
    );

    expect(created).toBeDefined();
    const sale = await scalar<{ remise_xof: number; total_xof: number; remise_motif: string }>(
      db,
      `select remise_xof, total_xof, remise_motif from public.sales where id = $1`,
      [SALE_DISCOUNT_ID],
    );
    expect(sale).toEqual({
      remise_xof: 500,
      total_xof: 7000,
      remise_motif: 'Geste commercial',
    });
  });

  it('refuse une vente hors d’une session ouverte', async () => {
    await expect(
      asUserCommitted(db, CASHIER_ID, () =>
        saleCall(db, 'f0000000-0000-4000-8000-000000000030', 'CAISSE-0010', {
          sessionId: CLOSE_SESSION_ID,
          deviceId: CLOSE_DEVICE_ID,
        }),
      ),
    ).rejects.toThrow(/clôturée/);

    await expect(
      asUser(db, CASHIER_ID, () =>
        db.query(
          `select public.create_sale(gen_random_uuid(), $1, null, 'CAISSE-0011', now(),
            0, null, '[]'::jsonb, '[]'::jsonb)`,
          [DEVICE_ID],
        ),
      ),
    ).rejects.toThrow(/session de caisse ouverte/);
  });
});
