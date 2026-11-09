import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { PGlite } from '@electric-sql/pglite';
import { ADMIN_ID, CASHIER_ID, SELLER_ID, VARIANT_ID } from './fixtures';
import { asUser, asUserCommitted, createTestDatabase } from './testing/pglite';
import { seedCatalog, seedSaleData, seedUsers } from './testing/seed';

async function scalar<T>(db: PGlite, sql: string, params: unknown[] = []): Promise<T | undefined> {
  const result = await db.query<T>(sql, params);
  return result.rows[0];
}

describe('opérations catalogue et stock', () => {
  let db: PGlite;
  let categoryId: string;
  let variantId: string;

  beforeAll(async () => {
    db = await createTestDatabase();
    await seedUsers(db);
    await seedCatalog(db);
    await seedSaleData(db);
  });

  afterAll(async () => {
    await db.close();
  });

  it('réserve les écritures du catalogue aux administrateurs', async () => {
    await expect(
      asUser(db, SELLER_ID, () => db.query(`select public.create_category('Test', 'TST')`)),
    ).rejects.toThrow(/autre rôle/);

    await expect(
      asUser(db, CASHIER_ID, () =>
        db.query(
          `select public.record_stock_movement(
            gen_random_uuid(), $1, 'reception', 10, null, null
          )`,
          [VARIANT_ID],
        ),
      ),
    ).rejects.toThrow(/autre rôle/);

    await expect(
      asUser(db, SELLER_ID, () =>
        db.query(`select public.import_catalog('test.xlsx', '[]'::jsonb)`),
      ),
    ).rejects.toThrow(/autre rôle/);
  });

  it('crée une catégorie, un article et une variante avec stock et coût initiaux', async () => {
    const category = await asUserCommitted(db, ADMIN_ID, () =>
      scalar<{ create_category: string }>(db, `select public.create_category('Mercerie', 'MER')`),
    );
    categoryId = category?.create_category ?? '';
    expect(categoryId).toMatch(/^[0-9a-f-]{36}$/);

    await asUserCommitted(db, ADMIN_ID, () =>
      db.query(
        `select public.create_article_with_variant(
          $1, 'Fil coton', 'Fil à coudre', 'unit',
          'Blanc', 'fil-co', 'piece', 500, 300, 10, 25
        )`,
        [categoryId],
      ),
    );

    const variant = await scalar<{ id: string; code_court: string; seuil_alerte: number }>(
      db,
      `select id, code_court, seuil_alerte from public.variants where lower(code_court) = 'fil-co'`,
    );
    variantId = variant?.id ?? '';
    expect(variant).toEqual({ id: variantId, code_court: 'FIL-CO', seuil_alerte: 10 });

    const stock = await scalar<{ quantite: number }>(
      db,
      'select quantite from public.stock_levels where variant_id = $1',
      [variantId],
    );
    const cost = await scalar<{ prix_achat_xof: number }>(
      db,
      'select prix_achat_xof from public.variant_costs where variant_id = $1',
      [variantId],
    );
    const history = await scalar<{ total: number }>(
      db,
      'select count(*)::int as total from public.price_history where variant_id = $1',
      [variantId],
    );

    expect(stock?.quantite).toBe(25);
    expect(cost?.prix_achat_xof).toBe(300);
    expect(history?.total).toBe(1);
  });

  it('refuse un code court déjà utilisé', async () => {
    await expect(
      asUserCommitted(db, ADMIN_ID, () =>
        db.query(
          `select public.create_article_with_variant(
            $1, 'Autre fil', null, 'unit',
            'Noir', 'FIL-CO', 'piece', 500, 300, 10, 0
          )`,
          [categoryId],
        ),
      ),
    ).rejects.toThrow(/code court/);
  });

  it('met à jour les prix et conserve l’historique daté', async () => {
    await asUserCommitted(db, ADMIN_ID, () =>
      db.query(`select public.update_variant($1, 'Blanc', 'FIL-CO', 600, 350, 12, true)`, [
        variantId,
      ]),
    );

    const variant = await scalar<{ prix_vente_xof: number; seuil_alerte: number }>(
      db,
      'select prix_vente_xof, seuil_alerte from public.variants where id = $1',
      [variantId],
    );
    expect(variant).toEqual({ prix_vente_xof: 600, seuil_alerte: 12 });

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
       order by change_at, id`,
      [variantId],
    );
    expect(history.rows).toEqual([
      {
        ancien_prix_vente_xof: null,
        nouveau_prix_vente_xof: null,
        ancien_prix_achat_xof: null,
        nouveau_prix_achat_xof: 300,
      },
      {
        ancien_prix_vente_xof: 500,
        nouveau_prix_vente_xof: 600,
        ancien_prix_achat_xof: null,
        nouveau_prix_achat_xof: null,
      },
      {
        ancien_prix_vente_xof: null,
        nouveau_prix_vente_xof: null,
        ancien_prix_achat_xof: 300,
        nouveau_prix_achat_xof: 350,
      },
    ]);

    await expect(
      asUser(db, CASHIER_ID, () =>
        db.query(`select public.update_variant($1, 'Blanc', 'FIL-CO', 700, 350, 12, true)`, [
          variantId,
        ]),
      ),
    ).rejects.toThrow(/autre rôle/);
  });

  it('enregistre un mouvement idempotent avec motif obligatoire', async () => {
    const movementId = 'f0000000-0000-4000-8000-0000000000aa';

    await expect(
      asUserCommitted(db, ADMIN_ID, () =>
        db.query(`select public.record_stock_movement($1, $2, 'loss', -5, null, null)`, [
          movementId,
          variantId,
        ]),
      ),
    ).rejects.toThrow(/motif/);

    const loss = await asUserCommitted(db, ADMIN_ID, () =>
      scalar<{ record_stock_movement: { quantite_apres: number; rejoue: boolean } }>(
        db,
        `select public.record_stock_movement($1, $2, 'loss', -5, 'Tissu taché', null)`,
        [movementId, variantId],
      ),
    );
    expect(loss?.record_stock_movement).toMatchObject({ quantite_apres: 20, rejoue: false });

    const replayed = await asUserCommitted(db, ADMIN_ID, () =>
      scalar<{ record_stock_movement: { quantite_apres: number; rejoue: boolean } }>(
        db,
        `select public.record_stock_movement($1, $2, 'loss', -5, 'Tissu taché', null)`,
        [movementId, variantId],
      ),
    );
    expect(replayed?.record_stock_movement).toMatchObject({ quantite_apres: 20, rejoue: true });

    const count = await scalar<{ total: number }>(
      db,
      'select count(*)::int as total from public.stock_movements where variant_id = $1',
      [variantId],
    );
    expect(count?.total).toBe(2);

    await expect(
      asUserCommitted(db, ADMIN_ID, () =>
        db.query(`select public.record_stock_movement($1, $2, 'loss', -9, 'Autre motif', null)`, [
          movementId,
          variantId,
        ]),
      ),
    ).rejects.toThrow(/déjà utilisé/);
  });

  it('importe des lignes valides, signale les erreurs et ne réapplique pas le stock', async () => {
    const rows = [
      {
        ligne: 2,
        categorie_code: 'TIS',
        categorie: 'Tissus',
        article: 'Bazin riche',
        dimension: 'length',
        couleur: 'Blanc',
        code_court: 'BAZ-BL',
        unite_vente: 'metre',
        prix_vente_xof: 5000,
        prix_achat_xof: 3400,
        seuil_alerte: 300,
        quantite_initiale: 350,
      },
      {
        ligne: 3,
        categorie_code: 'TIS',
        categorie: 'Tissus',
        article: 'Satin duchesse test',
        dimension: 'length',
        couleur: 'Ivoire',
        code_court: 'SAT-001',
        unite_vente: 'metre',
        prix_vente_xof: 5500,
        prix_achat_xof: 3100,
        seuil_alerte: 120,
        quantite_initiale: 100,
      },
      {
        ligne: 4,
        categorie_code: 'TIS',
        categorie: 'Tissus',
        article: 'Article invalide',
        dimension: 'length',
        couleur: 'Rouge',
        code_court: 'INV-01',
        unite_vente: 'metre',
        prix_vente_xof: -1,
        seuil_alerte: 0,
        quantite_initiale: 0,
      },
    ];

    const result = await asUserCommitted(db, ADMIN_ID, () =>
      scalar<{ import_catalog: { success: number; errors: number; statut: string } }>(
        db,
        `select public.import_catalog('catalogue.xlsx', $1::jsonb)`,
        [JSON.stringify(rows)],
      ),
    );
    expect(result?.import_catalog).toMatchObject({
      success: 2,
      errors: 1,
      statut: 'partial',
    });

    const bazin = await scalar<{ id: string; quantite: number }>(
      db,
      `select v.id, s.quantite
       from public.variants v
       join public.stock_levels s on s.variant_id = v.id
       where v.code_court = 'BAZ-BL'`,
    );
    expect(bazin?.quantite).toBe(350);

    const existing = await scalar<{ prix_vente_xof: number; quantite: number }>(
      db,
      `select v.prix_vente_xof, s.quantite
       from public.variants v
       join public.stock_levels s on s.variant_id = v.id
       where v.id = $1`,
      [VARIANT_ID],
    );
    expect(existing).toEqual({ prix_vente_xof: 5500, quantite: 0 });

    const statuses = await db.query<{
      line_number: number;
      statut: string;
      error_message: string | null;
    }>(
      `select line_number, statut, error_message
       from public.import_rows
       order by line_number`,
    );
    expect(statuses.rows).toHaveLength(3);
    expect(statuses.rows.map((row) => row.statut)).toEqual(['ok', 'ok', 'error']);
    expect(statuses.rows[2]?.error_message).toMatch(/Prix de vente invalide/);

    const imports = await scalar<{
      statut: string;
      total_rows: number;
      success_rows: number;
      error_rows: number;
    }>(db, 'select statut, total_rows, success_rows, error_rows from public.imports');
    expect(imports).toEqual({
      statut: 'partial',
      total_rows: 3,
      success_rows: 2,
      error_rows: 1,
    });

    await asUserCommitted(db, ADMIN_ID, () =>
      db.query(`select public.import_catalog('catalogue.xlsx', $1::jsonb)`, [
        JSON.stringify([{ ...rows[0], quantite_initiale: 999 }]),
      ]),
    );

    const afterReimport = await scalar<{ quantite: number }>(
      db,
      'select quantite from public.stock_levels where variant_id = $1',
      [bazin?.id],
    );
    expect(afterReimport?.quantite).toBe(350);
  });
});
