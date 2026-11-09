import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { PGlite } from '@electric-sql/pglite';
import {
  ADMIN_ID,
  BOUTIQUE_ID,
  MOVEMENT_ID,
  SALE_LINE_ID,
  SALE_MOVEMENT_ID,
  VARIANT_ID,
} from './fixtures';
import { createTestDatabase } from './testing/pglite';
import { seedCatalog, seedSaleData, seedUsers } from './testing/seed';

async function stockQuantity(db: PGlite): Promise<number> {
  const result = await db.query<{ quantite: number }>(
    'select quantite from public.stock_levels where variant_id = $1',
    [VARIANT_ID],
  );
  return result.rows[0]?.quantite ?? Number.NaN;
}

async function openAlerts(db: PGlite): Promise<string[]> {
  const result = await db.query<{ type: string }>(
    `select type from public.alerts
     where variant_id = $1 and resolved_at is null
     order by type`,
    [VARIANT_ID],
  );
  return result.rows.map((row) => row.type);
}

describe('registre de stock', () => {
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

  it('initialise le stock à zéro et signale déjà le seuil bas', async () => {
    expect(await stockQuantity(db)).toBe(0);
    expect(await openAlerts(db)).toEqual(['low_stock']);
  });

  it('applique une réception et résout l’alerte de seuil', async () => {
    await db.query(
      `insert into public.stock_movements
        (id, boutique_id, variant_id, type, quantite, created_by)
       values ($1, $2, $3, 'reception', 500, $4)`,
      [MOVEMENT_ID, BOUTIQUE_ID, VARIANT_ID, ADMIN_ID],
    );

    expect(await stockQuantity(db)).toBe(500);
    expect(await openAlerts(db)).toEqual([]);
  });

  it('rend le registre immuable, même pour une correction', async () => {
    await expect(
      db.query('update public.stock_movements set quantite = 999 where id = $1', [MOVEMENT_ID]),
    ).rejects.toThrow(/lecture seule/);

    await expect(
      db.query('delete from public.stock_movements where id = $1', [MOVEMENT_ID]),
    ).rejects.toThrow(/lecture seule/);
  });

  it('accepte un stock négatif et ouvre les deux alertes', async () => {
    await db.query(
      `insert into public.stock_movements
        (id, boutique_id, variant_id, type, quantite, sale_line_id, created_by)
       values ($1, $2, $3, 'sale', -600, $4, $5)`,
      [SALE_MOVEMENT_ID, BOUTIQUE_ID, VARIANT_ID, SALE_LINE_ID, ADMIN_ID],
    );

    expect(await stockQuantity(db)).toBe(-100);
    expect(await openAlerts(db)).toEqual(['low_stock', 'negative_stock']);
  });

  it('refuse un deuxième mouvement de vente pour la même ligne', async () => {
    await expect(
      db.query(
        `insert into public.stock_movements
          (id, boutique_id, variant_id, type, quantite, sale_line_id, created_by)
         values (gen_random_uuid(), $1, $2, 'sale', -1, $3, $4)`,
        [BOUTIQUE_ID, VARIANT_ID, SALE_LINE_ID, ADMIN_ID],
      ),
    ).rejects.toThrow();
  });

  it('résout les alertes quand le stock repasse au-dessus du seuil', async () => {
    await db.query(
      `insert into public.stock_movements
        (id, boutique_id, variant_id, type, quantite, motif, created_by)
       values (gen_random_uuid(), $1, $2, 'adjustment', 200, 'Correction test', $3)`,
      [BOUTIQUE_ID, VARIANT_ID, ADMIN_ID],
    );

    expect(await stockQuantity(db)).toBe(100);
    expect(await openAlerts(db)).toEqual([]);
  });

  it('exige un motif pour une sortie hors vente', async () => {
    await expect(
      db.query(
        `insert into public.stock_movements
          (id, boutique_id, variant_id, type, quantite, created_by)
         values (gen_random_uuid(), $1, $2, 'loss', -10, $3)`,
        [BOUTIQUE_ID, VARIANT_ID, ADMIN_ID],
      ),
    ).rejects.toThrow();

    await db.query(
      `insert into public.stock_movements
        (id, boutique_id, variant_id, type, quantite, motif, created_by)
       values (gen_random_uuid(), $1, $2, 'loss', -10, 'Tissu taché', $3)`,
      [BOUTIQUE_ID, VARIANT_ID, ADMIN_ID],
    );

    expect(await stockQuantity(db)).toBe(90);
    expect(await openAlerts(db)).toEqual(['low_stock']);
  });

  it('réintègre le stock lors d’une annulation de vente', async () => {
    await db.query(
      `insert into public.stock_movements
        (id, boutique_id, variant_id, type, quantite, sale_line_id, created_by)
       values (gen_random_uuid(), $1, $2, 'sale_cancel', 600, $3, $4)`,
      [BOUTIQUE_ID, VARIANT_ID, SALE_LINE_ID, ADMIN_ID],
    );

    expect(await stockQuantity(db)).toBe(690);
    expect(await openAlerts(db)).toEqual([]);
  });

  it('relie un mouvement d’inventaire à sa ligne de comptage', async () => {
    const inventoryId = '90000000-0000-4000-8000-000000000001';
    const inventoryLineId = '90000000-0000-4000-8000-000000000002';

    await db.query(
      `insert into public.inventories (id, boutique_id, started_by)
       values ($1, $2, $3)`,
      [inventoryId, BOUTIQUE_ID, ADMIN_ID],
    );
    await db.query(
      `insert into public.inventory_lines
        (id, inventory_id, boutique_id, variant_id, quantite_theorique, quantite_comptee)
       values ($1, $2, $3, $4, 690, 680)`,
      [inventoryLineId, inventoryId, BOUTIQUE_ID, VARIANT_ID],
    );
    await db.query(
      `insert into public.stock_movements
        (id, boutique_id, variant_id, type, quantite, motif, inventory_line_id, created_by)
       values (gen_random_uuid(), $1, $2, 'inventory', -10, 'Écart inventaire test', $3, $4)`,
      [BOUTIQUE_ID, VARIANT_ID, inventoryLineId, ADMIN_ID],
    );

    expect(await stockQuantity(db)).toBe(680);
  });
});
