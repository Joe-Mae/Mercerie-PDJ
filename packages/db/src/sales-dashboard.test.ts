import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { PGlite } from '@electric-sql/pglite';
import {
  ADMIN_ID,
  ARTICLE_ID,
  BOUTIQUE_ID,
  CASHIER_ID,
  CASH_SESSION_ID,
  DEVICE_ID,
  INACTIVE_ID,
  SELLER_ID,
  TISSU_CATEGORY_ID,
  VARIANT_ID,
} from './fixtures';
import { asAnonymous, asUser, asUserCommitted, createTestDatabase } from './testing/pglite';
import { seedCatalog, seedUsers } from './testing/seed';

const SATIN_BLUE_VARIANT_ID = 'e0000000-0000-4000-8000-000000000020';
const UNIT_ARTICLE_ID = 'e0000000-0000-4000-8000-000000000030';
const UNIT_VARIANT_ID = 'e0000000-0000-4000-8000-000000000031';

const OTHER_BOUTIQUE_ID = 'b0000000-0000-4000-8000-000000000002';
const OTHER_ADMIN_ID = 'a0000000-0000-4000-8000-000000000020';
const OTHER_DEVICE_ID = 'd0000000-0000-4000-8000-000000000020';

const SALE_A_ID = 'f0000000-0000-4000-8000-000000000101';
const SALE_B_ID = 'f0000000-0000-4000-8000-000000000102';
const SALE_C_ID = 'f0000000-0000-4000-8000-000000000103';
const SALE_CANCELLED_ID = 'f0000000-0000-4000-8000-000000000104';
const SALE_OLD_ID = 'f0000000-0000-4000-8000-000000000105';
const SALE_OTHER_ID = 'f0000000-0000-4000-8000-000000000106';
const SALE_PARTIAL_ID = 'f0000000-0000-4000-8000-000000000107';

const LINE_A1_ID = 'f0000000-0000-4000-8000-000000000201';
const LINE_A2_ID = 'f0000000-0000-4000-8000-000000000202';
const LINE_B1_ID = 'f0000000-0000-4000-8000-000000000203';
const LINE_C1_ID = 'f0000000-0000-4000-8000-000000000204';
const LINE_OLD_ID = 'f0000000-0000-4000-8000-000000000205';
const LINE_PARTIAL_ID = 'f0000000-0000-4000-8000-000000000206';

interface DashboardBestSeller {
  readonly article_id: string;
  readonly nom: string;
  readonly dimension: 'length' | 'unit';
  readonly quantite: number;
  readonly montant_xof: number;
}

interface DashboardRecentSale {
  readonly id: string;
  readonly reference: string;
  readonly date_vente: string;
  readonly lignes: number;
  readonly total_xof: number;
  readonly caissier: string;
  readonly methodes: readonly string[];
}

interface DashboardPayload {
  readonly role: string;
  readonly jour: string;
  readonly periode_jours: number;
  readonly ventes_jour_xof: number;
  readonly ventes_hier_xof: number;
  readonly variation_pct: number | null;
  readonly tickets_jour: number;
  readonly panier_moyen_xof: number;
  readonly especes_jour_xof: number;
  readonly mobile_jour_xof: number;
  readonly benefice_jour_xof: number | null;
  readonly cout_jour_xof: number | null;
  readonly lignes_jour: number;
  readonly lignes_avec_cout_jour: number;
  readonly serie: readonly { readonly jour: string; readonly montant_xof: number }[];
  readonly meilleures_ventes: readonly DashboardBestSeller[];
  readonly dernieres_ventes: readonly DashboardRecentSale[];
  readonly caisse: { readonly ouverte_at: string; readonly fond_ouverture_xof: number } | null;
}

async function dashboard(db: PGlite, days = 7): Promise<DashboardPayload> {
  const result = await db.query<{ get_sales_dashboard: DashboardPayload }>(
    `select public.get_sales_dashboard($1)`,
    [days],
  );
  const payload = result.rows[0]?.get_sales_dashboard;
  if (!payload) {
    throw new Error('Le tableau de bord n’a rien renvoyé.');
  }
  return payload;
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
    readonly variantId: string;
    readonly kind?: 'article' | 'service';
    readonly designation: string;
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
     values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)`,
    [
      values.id,
      values.saleId,
      BOUTIQUE_ID,
      values.kind ?? 'article',
      values.variantId,
      values.designation,
      values.quantity,
      values.variantId === UNIT_VARIANT_ID ? 'piece' : 'metre',
      values.stock,
      values.price,
      values.variantId === UNIT_VARIANT_ID ? 'piece' : 'metre',
      values.total,
    ],
  );
}

function isoMinutesAgo(minutes: number): string {
  return new Date(Date.now() - minutes * 60 * 1000).toISOString();
}

function insertCost(db: PGlite, lineId: string, amount: number): Promise<unknown> {
  return db.query(
    `insert into public.sale_line_costs (sale_line_id, boutique_id, cout_total_xof)
     values ($1, $2, $3)`,
    [lineId, BOUTIQUE_ID, amount],
  );
}

function insertMobilePayment(
  db: PGlite,
  saleId: string,
  method: 'tmoney' | 'flooz',
  amount: number,
  reference: string,
): Promise<unknown> {
  return db.query(
    `insert into public.payments (
       id, sale_id, boutique_id, method, montant_xof, reference_mobile, created_by
     )
     values (gen_random_uuid(), $1, $2, $3, $4, $5, $6)`,
    [saleId, BOUTIQUE_ID, method, amount, reference, CASHIER_ID],
  );
}

describe('tableau de bord des ventes', () => {
  let db: PGlite;
  let today: string;

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

      insert into public.variants (
        id, boutique_id, article_id, couleur, code_court, dimension, unite_vente,
        prix_vente_xof, seuil_alerte
      )
      values (
        '${SATIN_BLUE_VARIANT_ID}', '${BOUTIQUE_ID}', '${ARTICLE_ID}', 'Bleu',
        'SAT-003', 'length', 'metre', 5000, 0
      );

      insert into public.variant_costs (variant_id, boutique_id, prix_achat_xof)
      values ('${SATIN_BLUE_VARIANT_ID}', '${BOUTIQUE_ID}', 3000);

      insert into public.articles (
        id, boutique_id, categorie_id, nom, dimension
      )
      values (
        '${UNIT_ARTICLE_ID}', '${BOUTIQUE_ID}', '${TISSU_CATEGORY_ID}',
        'Boutons test', 'unit'
      );

      insert into public.variants (
        id, boutique_id, article_id, couleur, code_court, dimension, unite_vente,
        prix_vente_xof, seuil_alerte
      )
      values (
        '${UNIT_VARIANT_ID}', '${BOUTIQUE_ID}', '${UNIT_ARTICLE_ID}', 'Nacré',
        'BOU-003', 'unit', 'piece', 500, 0
      );

      insert into public.variant_costs (variant_id, boutique_id, prix_achat_xof)
      values ('${UNIT_VARIANT_ID}', '${BOUTIQUE_ID}', 200);

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
      reference: 'DASH-A',
      date: isoMinutesAgo(10),
      total: 9000,
      cashSessionId: CASH_SESSION_ID,
    });
    await db.query(
      `insert into public.payments (
         id, sale_id, boutique_id, method, montant_xof, cash_session_id,
         montant_recu_xof, rendu_xof, created_by
       )
       values (gen_random_uuid(), $1, $2, 'cash', 6000, $3, 10000, 4000, $4)`,
      [SALE_A_ID, BOUTIQUE_ID, CASH_SESSION_ID, CASHIER_ID],
    );
    await insertLine(db, {
      id: LINE_A1_ID,
      saleId: SALE_A_ID,
      variantId: VARIANT_ID,
      designation: 'Satin duchesse test — Ivoire',
      quantity: 1.5,
      stock: 150,
      price: 5000,
      total: 7500,
    });
    await insertCost(db, LINE_A1_ID, 4500);
    await insertLine(db, {
      id: LINE_A2_ID,
      saleId: SALE_A_ID,
      variantId: UNIT_VARIANT_ID,
      designation: 'Boutons test — Nacré',
      quantity: 3,
      stock: 3,
      price: 500,
      total: 1500,
    });
    await insertCost(db, LINE_A2_ID, 600);
    await insertMobilePayment(db, SALE_A_ID, 'tmoney', 3000, 'DASH-MOMO-1');

    await insertSale(db, {
      id: SALE_B_ID,
      reference: 'DASH-B',
      date: isoMinutesAgo(5),
      total: 5000,
      cashSessionId: CASH_SESSION_ID,
    });
    await insertLine(db, {
      id: LINE_B1_ID,
      saleId: SALE_B_ID,
      variantId: SATIN_BLUE_VARIANT_ID,
      designation: 'Satin duchesse test — Bleu',
      quantity: 1,
      stock: 100,
      price: 5000,
      total: 5000,
    });
    await insertCost(db, LINE_B1_ID, 3000);
    await insertMobilePayment(db, SALE_B_ID, 'flooz', 5000, 'DASH-FLOOZ-1');

    await insertSale(db, {
      id: SALE_C_ID,
      reference: 'DASH-C',
      date: isoMinutesAgo(24 * 60),
      total: 10000,
      cashSessionId: CASH_SESSION_ID,
    });
    await insertLine(db, {
      id: LINE_C1_ID,
      saleId: SALE_C_ID,
      variantId: VARIANT_ID,
      designation: 'Satin duchesse test — Ivoire',
      quantity: 2,
      stock: 200,
      price: 5000,
      total: 10000,
    });
    await insertCost(db, LINE_C1_ID, 6000);
    await insertMobilePayment(db, SALE_C_ID, 'tmoney', 10000, 'DASH-MOMO-2');

    await insertSale(db, {
      id: SALE_CANCELLED_ID,
      reference: 'DASH-ANNULEE',
      date: isoMinutesAgo(1),
      total: 99999,
      status: 'cancelled',
      cashSessionId: CASH_SESSION_ID,
      cancelledBy: ADMIN_ID,
      cancelledAt: new Date().toISOString(),
    });

    await insertSale(db, {
      id: SALE_OLD_ID,
      reference: 'DASH-VIEILLE',
      date: isoMinutesAgo(8 * 24 * 60),
      total: 12345,
      cashSessionId: CASH_SESSION_ID,
    });
    await insertLine(db, {
      id: LINE_OLD_ID,
      saleId: SALE_OLD_ID,
      variantId: VARIANT_ID,
      designation: 'Satin duchesse test — Ivoire',
      quantity: 1,
      stock: 100,
      price: 5000,
      total: 12345,
    });
    await insertCost(db, LINE_OLD_ID, 8000);
    await insertMobilePayment(db, SALE_OLD_ID, 'tmoney', 12345, 'DASH-MOMO-3');

    await insertSale(db, {
      id: SALE_OTHER_ID,
      reference: 'DASH-AUTRE',
      date: isoMinutesAgo(2),
      total: 77777,
      boutiqueId: OTHER_BOUTIQUE_ID,
      cashierId: OTHER_ADMIN_ID,
      deviceId: OTHER_DEVICE_ID,
    });

    const expected = await db.query<{ jour: string }>(
      `select to_char((now() at time zone 'Africa/Lome')::date, 'YYYY-MM-DD') as jour`,
    );
    today = expected.rows[0]?.jour ?? '';
  });

  afterAll(async () => {
    await db.close();
  });

  it('refuse le vendeur, le compte inactif et l’anonyme', async () => {
    await expect(
      asUser(db, SELLER_ID, () => db.query(`select public.get_sales_dashboard(7)`)),
    ).rejects.toThrow(/autre rôle/);

    await expect(
      asUser(db, INACTIVE_ID, () => db.query(`select public.get_sales_dashboard(7)`)),
    ).rejects.toThrow(/inactif|authentifié/);

    await expect(
      asAnonymous(db, () => db.query(`select public.get_sales_dashboard(7)`)),
    ).rejects.toThrow(/inactif|authentifié|permission denied/);
  });

  it('agrège les ventes du jour, la veille et les encaissements', async () => {
    const data = await asUserCommitted(db, ADMIN_ID, () => dashboard(db));

    expect(data.role).toBe('admin');
    expect(data.jour).toBe(today);
    expect(data.periode_jours).toBe(7);
    expect(data.ventes_jour_xof).toBe(14000);
    expect(data.ventes_hier_xof).toBe(10000);
    expect(data.variation_pct).toBe(40);
    expect(data.tickets_jour).toBe(2);
    expect(data.panier_moyen_xof).toBe(7000);
    expect(data.especes_jour_xof).toBe(6000);
    expect(data.mobile_jour_xof).toBe(8000);
    expect(data.lignes_jour).toBe(3);
    expect(data.lignes_avec_cout_jour).toBe(3);
    expect(data.cout_jour_xof).toBe(8100);
    expect(data.benefice_jour_xof).toBe(5900);
    expect(data.caisse).toBeNull();
  });

  it('exclut les ventes annulées, hors période ou d’une autre boutique', async () => {
    const data = await asUserCommitted(db, ADMIN_ID, () => dashboard(db));

    expect(data.serie).toHaveLength(7);
    expect(data.serie.map((point) => point.jour)).toContain(today);
    expect(data.serie.at(-2)?.montant_xof).toBe(10000);
    expect(data.serie.at(-1)).toMatchObject({ jour: today, montant_xof: 14000 });
    expect(data.serie.reduce((total, point) => total + point.montant_xof, 0)).toBe(24000);

    const references = data.dernieres_ventes.map((sale) => sale.reference);
    expect(references).toEqual(['DASH-B', 'DASH-A', 'DASH-C', 'DASH-VIEILLE']);
    expect(references).not.toContain('DASH-ANNULEE');
    expect(references).not.toContain('DASH-AUTRE');

    const latest = data.dernieres_ventes[0];
    expect(latest).toMatchObject({
      reference: 'DASH-B',
      lignes: 1,
      total_xof: 5000,
      caissier: 'Caisse Test',
      methodes: ['flooz'],
    });
  });

  it('classe les meilleures ventes par article sur la période', async () => {
    const data = await asUserCommitted(db, ADMIN_ID, () => dashboard(db));

    expect(data.meilleures_ventes).toHaveLength(2);
    expect(data.meilleures_ventes[0]).toMatchObject({
      nom: 'Satin duchesse test',
      dimension: 'length',
      quantite: 4.5,
      montant_xof: 22500,
    });
    expect(data.meilleures_ventes[1]).toMatchObject({
      nom: 'Boutons test',
      dimension: 'unit',
      quantite: 3,
      montant_xof: 1500,
    });
  });

  it('cache le bénéfice et les coûts au caissier mais montre sa caisse', async () => {
    const data = await asUserCommitted(db, CASHIER_ID, () => dashboard(db));

    expect(data.role).toBe('cashier');
    expect(data.ventes_jour_xof).toBe(14000);
    expect(data.benefice_jour_xof).toBeNull();
    expect(data.cout_jour_xof).toBeNull();
    expect(data.caisse).toMatchObject({ fond_ouverture_xof: 10000 });
    expect(data.caisse?.ouverte_at).toBeTruthy();
  });

  it('borne la période demandée', async () => {
    await expect(asUserCommitted(db, ADMIN_ID, () => dashboard(db, 0))).rejects.toThrow(
      /entre 1 et 31/,
    );
    await expect(asUserCommitted(db, ADMIN_ID, () => dashboard(db, 32))).rejects.toThrow(
      /entre 1 et 31/,
    );
  });

  it('limite la série et les meilleures ventes à la période demandée', async () => {
    const data = await asUserCommitted(db, ADMIN_ID, () => dashboard(db, 1));

    expect(data.periode_jours).toBe(1);
    expect(data.serie).toEqual([{ jour: today, montant_xof: 14000 }]);
    expect(data.ventes_hier_xof).toBe(10000);
    expect(data.meilleures_ventes[0]).toMatchObject({
      nom: 'Satin duchesse test',
      quantite: 2.5,
      montant_xof: 12500,
    });
    expect(data.meilleures_ventes[1]).toMatchObject({
      nom: 'Boutons test',
      quantite: 3,
    });
  });

  it('ne calcule pas de bénéfice quand un coût d’achat manque', async () => {
    await insertSale(db, {
      id: SALE_PARTIAL_ID,
      reference: 'DASH-SANS-COUT',
      date: isoMinutesAgo(0),
      total: 2000,
      cashSessionId: CASH_SESSION_ID,
    });
    await insertLine(db, {
      id: LINE_PARTIAL_ID,
      saleId: SALE_PARTIAL_ID,
      variantId: UNIT_VARIANT_ID,
      designation: 'Boutons test — Nacré',
      quantity: 1,
      stock: 1,
      price: 2000,
      total: 2000,
    });
    await insertMobilePayment(db, SALE_PARTIAL_ID, 'tmoney', 2000, 'DASH-MOMO-4');

    const data = await asUserCommitted(db, ADMIN_ID, () => dashboard(db));

    expect(data.ventes_jour_xof).toBe(16000);
    expect(data.tickets_jour).toBe(3);
    expect(data.lignes_jour).toBe(4);
    expect(data.lignes_avec_cout_jour).toBe(3);
    expect(data.cout_jour_xof).toBe(8100);
    expect(data.benefice_jour_xof).toBeNull();
  });
});
