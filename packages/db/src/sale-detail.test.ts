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

const OTHER_BOUTIQUE_ID = 'b0000000-0000-4000-8000-000000000022';
const OTHER_ADMIN_ID = 'a0000000-0000-4000-8000-000000000022';
const OTHER_DEVICE_ID = 'd0000000-0000-4000-8000-000000000022';

const SALE_A_ID = 'f0000000-0000-4000-8000-000000000501';
const SALE_CANCELLED_ID = 'f0000000-0000-4000-8000-000000000502';
const SALE_DISCOUNT_ID = 'f0000000-0000-4000-8000-000000000503';
const SALE_OTHER_ID = 'f0000000-0000-4000-8000-000000000504';

const LINE_A1_ID = 'f0000000-0000-4000-8000-000000000601';
const LINE_A2_ID = 'f0000000-0000-4000-8000-000000000602';
const LINE_CANCELLED_ID = 'f0000000-0000-4000-8000-000000000603';
const LINE_DISCOUNT_ID = 'f0000000-0000-4000-8000-000000000604';

interface DetailLine {
  readonly id: string;
  readonly kind: 'article' | 'service';
  readonly designation: string;
  readonly quantite_saisie: number;
  readonly unite_saisie: string;
  readonly prix_unitaire_xof: number;
  readonly prix_par: string;
  readonly total_xof: number;
}

interface DetailPayment {
  readonly id: string;
  readonly method: 'cash' | 'tmoney' | 'flooz';
  readonly montant_xof: number;
  readonly reference_mobile: string | null;
  readonly montant_recu_xof: number | null;
  readonly rendu_xof: number | null;
}

interface DetailPayload {
  readonly id: string;
  readonly reference: string;
  readonly statut: 'validated' | 'cancelled';
  readonly date_vente: string;
  readonly heure: string;
  readonly caissier: string;
  readonly sous_total_xof: number;
  readonly remise_xof: number;
  readonly remise_motif: string | null;
  readonly total_xof: number;
  readonly annulee_at: string | null;
  readonly annulee_par: string | null;
  readonly lignes: readonly DetailLine[];
  readonly paiements: readonly DetailPayment[];
}

async function detail(db: PGlite, saleId: string): Promise<DetailPayload> {
  const result = await db.query<{ get_sale_detail: DetailPayload }>(
    `select public.get_sale_detail($1::uuid)`,
    [saleId],
  );
  const payload = result.rows[0]?.get_sale_detail;
  if (!payload) {
    throw new Error('Le détail n’a rien renvoyé.');
  }
  return payload;
}

function insertSale(
  db: PGlite,
  values: {
    readonly id: string;
    readonly reference: string;
    readonly total: number;
    readonly status?: 'validated' | 'cancelled';
    readonly sousTotal?: number;
    readonly discount?: number;
    readonly discountReason?: string | null;
    readonly boutiqueId?: string;
    readonly cashierId?: string;
    readonly deviceId?: string;
    readonly cancelledBy?: string | null;
    readonly cancelledAt?: string | null;
  },
): Promise<unknown> {
  return db.query(
    `insert into public.sales (
       id, boutique_id, reference, caissier_id, device_id, statut, date_vente,
       sous_total_xof, remise_xof, total_xof, remise_motif, annulee_par, annulee_at
     )
     values ($1, $2, $3, $4, $5, $6, now(), $7, $8, $9, $10, $11, $12)`,
    [
      values.id,
      values.boutiqueId ?? BOUTIQUE_ID,
      values.reference,
      values.cashierId ?? CASHIER_ID,
      values.deviceId ?? DEVICE_ID,
      values.status ?? 'validated',
      values.sousTotal ?? values.total + (values.discount ?? 0),
      values.discount ?? 0,
      values.total,
      values.discountReason ?? null,
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
     values ($1, $2, $3, 'article', $4, $5, $6, 'metre', $7, $8, 'metre', $9)`,
    [
      values.id,
      values.saleId,
      BOUTIQUE_ID,
      VARIANT_ID,
      values.designation,
      values.quantity,
      values.stock,
      values.price,
      values.total,
    ],
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
      BOUTIQUE_ID,
      values.method,
      values.amount,
      values.method === 'cash' ? CASH_SESSION_ID : null,
      values.reference ?? null,
      values.received ?? null,
      values.change ?? null,
      CASHIER_ID,
    ],
  );
}

describe('détail d’une vente', () => {
  let db: PGlite;

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

    await insertSale(db, { id: SALE_A_ID, reference: 'DET-A', total: 10000 });
    await insertLine(db, {
      id: LINE_A2_ID,
      saleId: SALE_A_ID,
      designation: 'Satin duchesse test — Ivoire',
      quantity: 0.5,
      stock: 50,
      price: 5000,
      total: 2500,
    });
    await insertLine(db, {
      id: LINE_A1_ID,
      saleId: SALE_A_ID,
      designation: 'Bazin riche — Bleu roi',
      quantity: 1.5,
      stock: 150,
      price: 5000,
      total: 7500,
    });
    await insertPayment(db, {
      saleId: SALE_A_ID,
      method: 'tmoney',
      amount: 4000,
      reference: 'DET-MOMO-1',
    });
    await insertPayment(db, {
      saleId: SALE_A_ID,
      method: 'cash',
      amount: 6000,
      received: 10000,
      change: 4000,
    });

    await insertSale(db, {
      id: SALE_CANCELLED_ID,
      reference: 'DET-ANNULEE',
      total: 5000,
      status: 'cancelled',
      cancelledBy: ADMIN_ID,
      cancelledAt: new Date().toISOString(),
    });
    await insertLine(db, {
      id: LINE_CANCELLED_ID,
      saleId: SALE_CANCELLED_ID,
      designation: 'Wax Hollandais — Jaune',
      quantity: 1,
      stock: 100,
      price: 5000,
      total: 5000,
    });

    await insertSale(db, {
      id: SALE_DISCOUNT_ID,
      reference: 'DET-REMISE',
      total: 9500,
      sousTotal: 10000,
      discount: 500,
      discountReason: 'Geste commercial',
    });
    await insertLine(db, {
      id: LINE_DISCOUNT_ID,
      saleId: SALE_DISCOUNT_ID,
      designation: 'Dentelle brodée — Rose poudré',
      quantity: 1,
      stock: 100,
      price: 10000,
      total: 10000,
    });
    await insertPayment(db, {
      saleId: SALE_DISCOUNT_ID,
      method: 'flooz',
      amount: 9500,
      reference: 'DET-FLOOZ-1',
    });

    await insertSale(db, {
      id: SALE_OTHER_ID,
      reference: 'DET-AUTRE',
      total: 77777,
      boutiqueId: OTHER_BOUTIQUE_ID,
      cashierId: OTHER_ADMIN_ID,
      deviceId: OTHER_DEVICE_ID,
    });
  });

  afterAll(async () => {
    await db.close();
  });

  it('refuse le vendeur, le compte inactif et l’anonyme', async () => {
    await expect(
      asUser(db, SELLER_ID, () => db.query(`select public.get_sale_detail($1::uuid)`, [SALE_A_ID])),
    ).rejects.toThrow(/autre rôle/);

    await expect(
      asUser(db, INACTIVE_ID, () =>
        db.query(`select public.get_sale_detail($1::uuid)`, [SALE_A_ID]),
      ),
    ).rejects.toThrow(/inactif|authentifié/);

    await expect(
      asAnonymous(db, () =>
        db.query(`select public.get_sale_detail($1::uuid)`, [SALE_A_ID]),
      ),
    ).rejects.toThrow(/inactif|authentifié|permission denied/);
  });

  it('renvoie les articles, la remise et les paiements au caissier', async () => {
    const data = await asUserCommitted(db, CASHIER_ID, () => detail(db, SALE_A_ID));

    expect(data.reference).toBe('DET-A');
    expect(data.statut).toBe('validated');
    expect(data.caissier).toBe('Caisse Test');
    expect(data.sous_total_xof).toBe(10000);
    expect(data.remise_xof).toBe(0);
    expect(data.remise_motif).toBeNull();
    expect(data.total_xof).toBe(10000);
    expect(data.annulee_at).toBeNull();
    expect(data.annulee_par).toBeNull();
    expect(data.heure).toMatch(/^\d{2}:\d{2}$/);

    expect(data.lignes.map((line) => line.designation)).toEqual([
      'Bazin riche — Bleu roi',
      'Satin duchesse test — Ivoire',
    ]);
    expect(data.lignes[0]).toMatchObject({
      kind: 'article',
      quantite_saisie: 1.5,
      unite_saisie: 'metre',
      prix_unitaire_xof: 5000,
      prix_par: 'metre',
      total_xof: 7500,
    });

    expect(data.paiements.map((payment) => payment.method)).toEqual(['cash', 'tmoney']);
    expect(data.paiements[0]).toMatchObject({
      montant_xof: 6000,
      montant_recu_xof: 10000,
      rendu_xof: 4000,
      reference_mobile: null,
    });
    expect(data.paiements[1]).toMatchObject({
      montant_xof: 4000,
      reference_mobile: 'DET-MOMO-1',
    });
  });

  it('donne le même détail à l’administrateur, sans coût d’achat', async () => {
    const data = await asUserCommitted(db, ADMIN_ID, () => detail(db, SALE_A_ID));

    expect(data.total_xof).toBe(10000);
    expect(data.lignes).toHaveLength(2);
    expect(data).not.toHaveProperty('cout_xof');
    expect(data).not.toHaveProperty('benefice_xof');
    for (const line of data.lignes) {
      expect(line).not.toHaveProperty('cout_xof');
    }
  });

  it('affiche une vente annulée avec son auteur', async () => {
    const data = await asUserCommitted(db, ADMIN_ID, () => detail(db, SALE_CANCELLED_ID));

    expect(data.statut).toBe('cancelled');
    expect(data.total_xof).toBe(5000);
    expect(data.annulee_par).toBe('Admin Test');
    expect(data.annulee_at).toBeTruthy();
    expect(data.lignes).toHaveLength(1);
  });

  it('conserve le motif de remise', async () => {
    const data = await asUserCommitted(db, CASHIER_ID, () => detail(db, SALE_DISCOUNT_ID));

    expect(data.sous_total_xof).toBe(10000);
    expect(data.remise_xof).toBe(500);
    expect(data.remise_motif).toBe('Geste commercial');
    expect(data.total_xof).toBe(9500);
  });

  it('refuse une vente d’une autre boutique ou inconnue', async () => {
    await expect(
      asUserCommitted(db, ADMIN_ID, () => detail(db, SALE_OTHER_ID)),
    ).rejects.toThrow(/introuvable/);

    await expect(
      asUserCommitted(db, ADMIN_ID, () =>
        detail(db, 'f0000000-0000-4000-8000-00000000ffff'),
      ),
    ).rejects.toThrow(/introuvable/);
  });
});
