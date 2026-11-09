import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { PGlite } from '@electric-sql/pglite';
import {
  ADMIN_ID,
  BOUTIQUE_ID,
  CASHIER_ID,
  SUPERADMIN_ID,
  INACTIVE_ID,
  SELLER_ID,
  VARIANT_ID,
} from './fixtures';
import { asAnonymous, asUser, asUserCommitted, createTestDatabase } from './testing/pglite';
import { seedCatalog, seedSaleData, seedUsers } from './testing/seed';

const REGISTERED_DEVICE_ID = 'd0000000-0000-4000-8000-000000000002';

describe('RLS et autorisations', () => {
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

  it('crée automatiquement les profils avec le bon rôle et le bon état', async () => {
    const result = await db.query<{ email: string; role: string; actif: boolean }>(
      'select email, role, actif from public.profiles order by email',
    );
    expect(result.rows).toEqual([
      { email: 'admin@test.local', role: 'admin', actif: true },
      { email: 'caisse@test.local', role: 'cashier', actif: true },
      { email: 'inactif@test.local', role: 'seller', actif: false },
      { email: 'superadmin@test.local', role: 'admin', actif: true },
      { email: 'vente@test.local', role: 'seller', actif: true },
    ]);
  });

  it('limite chaque personne à son propre profil, sauf pour l’administrateur', async () => {
    const sellerProfiles = await asUser(db, SELLER_ID, async () => {
      const result = await db.query<{ id: string }>('select id from public.profiles');
      return result.rows;
    });
    const adminProfiles = await asUser(db, ADMIN_ID, async () => {
      const result = await db.query<{ id: string }>('select id from public.profiles');
      return result.rows;
    });

    expect(sellerProfiles).toEqual([{ id: SELLER_ID }]);
    expect(adminProfiles).toHaveLength(5);
  });

  it('masque les variantes inactives aux non-administrateurs', async () => {
    const sellerVariants = await asUser(db, SELLER_ID, async () => {
      const result = await db.query<{ id: string }>('select id from public.variants');
      return result.rows;
    });
    const adminVariants = await asUser(db, ADMIN_ID, async () => {
      const result = await db.query<{ id: string }>('select id from public.variants');
      return result.rows;
    });

    expect(sellerVariants).toEqual([{ id: VARIANT_ID }]);
    expect(adminVariants).toHaveLength(2);
  });

  it('réserve les prix d’achat et l’historique des prix à l’administrateur', async () => {
    const adminCosts = await asUser(db, ADMIN_ID, async () => {
      const result = await db.query('select * from public.variant_costs');
      return result.rows;
    });
    const cashierCosts = await asUser(db, CASHIER_ID, async () => {
      const result = await db.query('select * from public.variant_costs');
      return result.rows;
    });
    const sellerHistory = await asUser(db, SELLER_ID, async () => {
      const result = await db.query('select * from public.price_history');
      return result.rows;
    });

    expect(adminCosts).toHaveLength(1);
    expect(cashierCosts).toHaveLength(0);
    expect(sellerHistory).toHaveLength(0);
  });

  it('ouvre le journal des ventes au caissier et à l’administrateur seulement', async () => {
    const counts: Array<number | undefined> = [];
    for (const userId of [ADMIN_ID, CASHIER_ID, SELLER_ID]) {
      counts.push(
        await asUser(db, userId, async () => {
          const result = await db.query<{ total: number }>(
            'select count(*)::int as total from public.sales',
          );
          return result.rows[0]?.total;
        }),
      );
    }

    expect(counts).toEqual([1, 1, 0]);
  });

  it('cache les coûts de vente aux caissiers', async () => {
    const cashierCosts = await asUser(db, CASHIER_ID, async () => {
      const result = await db.query('select * from public.sale_line_costs');
      return result.rows;
    });
    const adminCosts = await asUser(db, ADMIN_ID, async () => {
      const result = await db.query('select * from public.sale_line_costs');
      return result.rows;
    });

    expect(cashierCosts).toHaveLength(0);
    expect(adminCosts).toHaveLength(1);
  });

  it('laisse les stocks consultables par tous les rôles actifs', async () => {
    const sellerStock = await asUser(db, SELLER_ID, async () => {
      const result = await db.query<{ quantite: number }>(
        'select quantite from public.stock_levels order by variant_id',
      );
      return result.rows;
    });

    expect(sellerStock).toHaveLength(2);
    expect(sellerStock.every((row) => row.quantite === 0)).toBe(true);
  });

  it('refuse toute écriture directe sur le catalogue, les stocks et les ventes', async () => {
    await expect(
      asUser(db, CASHIER_ID, () =>
        db.query('update public.variants set prix_vente_xof = 1 where id = $1', [VARIANT_ID]),
      ),
    ).rejects.toThrow();

    await expect(
      asUser(db, SELLER_ID, () =>
        db.query(
          `insert into public.stock_movements
            (id, boutique_id, variant_id, type, quantite, created_by)
           values (gen_random_uuid(), $1, $2, 'reception', 10, $3)`,
          [BOUTIQUE_ID, VARIANT_ID, SELLER_ID],
        ),
      ),
    ).rejects.toThrow();

    await expect(
      asUser(db, CASHIER_ID, () =>
        db.query(
          `insert into public.sales
            (id, boutique_id, reference, caissier_id, device_id, date_vente,
             sous_total_xof, remise_xof, total_xof)
           values (gen_random_uuid(), $1, 'FORGE', $2, gen_random_uuid(), now(), 0, 0, 0)`,
          [BOUTIQUE_ID, CASHIER_ID],
        ),
      ),
    ).rejects.toThrow();
  });

  it('bloque les lectures anonymes', async () => {
    await expect(
      asAnonymous(db, () => db.query('select * from public.categories')),
    ).rejects.toThrow();
  });

  it('rend un compte inactif inopérant', async () => {
    const result = await asUser(db, INACTIVE_ID, async () => {
      const categories = await db.query('select * from public.categories');
      const ownProfile = await db.query<{ id: string }>('select id from public.profiles');
      return { categories: categories.rows.length, ownProfile: ownProfile.rows };
    });

    expect(result.categories).toBe(0);
    expect(result.ownProfile).toEqual([{ id: INACTIVE_ID }]);
  });

  it('enregistre un appareil et une connexion pour l’utilisateur connecté', async () => {
    await asUserCommitted(db, CASHIER_ID, async () => {
      await db.query('select public.register_device($1, $2, $3, $4)', [
        REGISTERED_DEVICE_ID,
        'Téléphone caisse',
        'web',
        '0.1.0',
      ]);
      await db.query('select public.record_login($1)', [REGISTERED_DEVICE_ID]);
    });

    const device = await db.query<{ nom: string }>('select nom from public.devices where id = $1', [
      REGISTERED_DEVICE_ID,
    ]);
    const link = await db.query(
      'select * from public.user_devices where device_id = $1 and user_id = $2',
      [REGISTERED_DEVICE_ID, CASHIER_ID],
    );
    const audit = await db.query<{ action: string }>(
      `select action from public.audit_log
       where user_id = $1 and action in ('device_registered', 'login')
       order by id`,
      [CASHIER_ID],
    );

    expect(device.rows).toEqual([{ nom: 'Téléphone caisse' }]);
    expect(link.rows).toHaveLength(1);
    expect(audit.rows.map((row) => row.action)).toEqual(['device_registered', 'login']);
  });

  it('protège le dernier administrateur actif', async () => {
    await db.exec('begin');
    try {
      await db.query('update public.profiles set actif = false where id = $1', [SUPERADMIN_ID]);
      await expect(
        db.query('update public.profiles set actif = false where id = $1', [ADMIN_ID]),
      ).rejects.toThrow(/dernier administrateur/);
    } finally {
      await db.exec('rollback');
    }
  });

  it('autorise l’administrateur à modifier les paramètres, pas le caissier', async () => {
    await asUserCommitted(db, ADMIN_ID, () =>
      db.query(
        `update public.settings set value = '"Bienvenue"'::jsonb
         where boutique_id = $1 and key = 'ticket_message'`,
        [BOUTIQUE_ID],
      ),
    );

    const value = await db.query<{ value: string }>(
      `select value #>> '{}' as value from public.settings
       where boutique_id = $1 and key = 'ticket_message'`,
      [BOUTIQUE_ID],
    );
    expect(value.rows).toEqual([{ value: 'Bienvenue' }]);

    const cashierUpdate = await asUser(db, CASHIER_ID, () =>
      db.query(
        `update public.settings set value = '"Interdit"'::jsonb
         where boutique_id = $1 and key = 'ticket_message'`,
        [BOUTIQUE_ID],
      ),
    );
    expect(cashierUpdate.affectedRows).toBe(0);

    const unchanged = await db.query<{ value: string }>(
      `select value #>> '{}' as value from public.settings
       where boutique_id = $1 and key = 'ticket_message'`,
      [BOUTIQUE_ID],
    );
    expect(unchanged.rows).toEqual([{ value: 'Bienvenue' }]);
  });
});
