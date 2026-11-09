import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { PGlite } from '@electric-sql/pglite';
import {
  BOUTIQUE_ID,
  CASHIER_ID,
  CASH_SESSION_ID,
  DEVICE_ID,
  SALE_ID,
  VARIANT_ID,
} from './fixtures';
import { createTestDatabase } from './testing/pglite';
import { seedCatalog, seedSaleData, seedUsers } from './testing/seed';

describe('prix et ventes', () => {
  let db: PGlite;

  beforeAll(async () => {
    db = await createTestDatabase();
    await seedUsers(db);
    await seedCatalog(db);
    await seedSaleData(db);
  });

  afterAll(async () => {
    await db.close();
  });

  it('historise chaque changement de prix avec sa date', async () => {
    await db.query('update public.variants set prix_vente_xof = 5500 where id = $1', [VARIANT_ID]);
    await db.query('update public.variant_costs set prix_achat_xof = 3200 where variant_id = $1', [
      VARIANT_ID,
    ]);

    const history = await db.query<{
      ancien_prix_vente_xof: number | null;
      nouveau_prix_vente_xof: number | null;
      ancien_prix_achat_xof: number | null;
      nouveau_prix_achat_xof: number | null;
    }>(
      `select ancien_prix_vente_xof, nouveau_prix_vente_xof,
              ancien_prix_achat_xof, nouveau_prix_achat_xof
       from public.price_history
       where variant_id = $1
       order by id`,
      [VARIANT_ID],
    );

    expect(history.rows).toEqual([
      {
        ancien_prix_vente_xof: null,
        nouveau_prix_vente_xof: null,
        ancien_prix_achat_xof: null,
        nouveau_prix_achat_xof: 3000,
      },
      {
        ancien_prix_vente_xof: 5000,
        nouveau_prix_vente_xof: 5500,
        ancien_prix_achat_xof: null,
        nouveau_prix_achat_xof: null,
      },
      {
        ancien_prix_vente_xof: null,
        nouveau_prix_vente_xof: null,
        ancien_prix_achat_xof: 3000,
        nouveau_prix_achat_xof: 3200,
      },
    ]);
  });

  it('rend l’historique des prix immuable', async () => {
    await expect(
      db.query('update public.price_history set nouveau_prix_vente_xof = 1'),
    ).rejects.toThrow(/lecture seule/);
  });

  it('refuse un total incohérent avec le sous-total et la remise', async () => {
    await expect(
      db.query(
        `insert into public.sales
          (id, boutique_id, reference, cash_session_id, caissier_id, device_id,
           date_vente, sous_total_xof, remise_xof, total_xof)
         values (gen_random_uuid(), $1, 'BAD-TOTAL', $2, $3, $4, now(), 1000, 100, 950)`,
        [BOUTIQUE_ID, CASH_SESSION_ID, CASHIER_ID, DEVICE_ID],
      ),
    ).rejects.toThrow();
  });

  it('exige une référence pour un paiement Mobile Money', async () => {
    await expect(
      db.query(
        `insert into public.payments
          (id, sale_id, boutique_id, method, montant_xof, created_by)
         values (gen_random_uuid(), $1, $2, 'flooz', 100, $3)`,
        [SALE_ID, BOUTIQUE_ID, CASHIER_ID],
      ),
    ).rejects.toThrow();
  });

  it('exige une session et le montant reçu pour un paiement en espèces', async () => {
    await expect(
      db.query(
        `insert into public.payments
          (id, sale_id, boutique_id, method, montant_xof, created_by)
         values (gen_random_uuid(), $1, $2, 'cash', 100, $3)`,
        [SALE_ID, BOUTIQUE_ID, CASHIER_ID],
      ),
    ).rejects.toThrow();

    const valid = await db.query(
      `insert into public.payments
        (id, sale_id, boutique_id, method, montant_xof, cash_session_id,
         montant_recu_xof, rendu_xof, created_by)
       values (gen_random_uuid(), $1, $2, 'cash', 100, $3, 500, 400, $4)`,
      [SALE_ID, BOUTIQUE_ID, CASH_SESSION_ID, CASHIER_ID],
    );
    expect(valid.affectedRows).toBe(1);
  });
});
