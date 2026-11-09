import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { PGlite } from '@electric-sql/pglite';
import {
  ADMIN_ID,
  CASHIER_ID,
  SUPERADMIN_ID,
  SELLER_ID,
} from './fixtures';
import { asUser, asUserCommitted, createTestDatabase } from './testing/pglite';
import { seedUsers } from './testing/seed';

const OTHER_BOUTIQUE_ID = 'b0000000-0000-4000-8000-000000000099';
const OUTSIDER_ID = 'a0000000-0000-4000-8000-000000000099';

interface TeamRow {
  readonly id: string;
  readonly email: string;
  readonly nom: string;
  readonly role: string;
  readonly actif: boolean;
  readonly est_superadmin: boolean;
  readonly dernier_acces_at: string | null;
}

describe('Gestion des comptes réservée au superadmin', () => {
  let db: PGlite;

  beforeAll(async () => {
    db = await createTestDatabase();
    await seedUsers(db);
    await db.exec(`
      insert into public.boutiques (id, nom, code)
      values ('${OTHER_BOUTIQUE_ID}', 'Boutique voisine', 'VOISINE');

      insert into auth.users (id, email, raw_app_meta_data, raw_user_meta_data)
      values (
        '${OUTSIDER_ID}',
        'voisin@test.local',
        '{"role":"admin","actif":true,"boutique_id":"${OTHER_BOUTIQUE_ID}"}'::jsonb,
        '{"nom":"Compte Voisin"}'::jsonb
      );
    `);
  });

  afterAll(async () => {
    await db.close();
  });

  it('refuse la liste à l’administrateur non superadmin et au caissier', async () => {
    for (const userId of [ADMIN_ID, CASHIER_ID]) {
      await expect(
        asUser(db, userId, () => db.query('select * from public.team_list()')),
      ).rejects.toThrow(/superadmin/);
    }
  });

  it('liste les comptes de la boutique pour le superadmin', async () => {
    const rows = await asUser(db, SUPERADMIN_ID, async () => {
      const result = await db.query<TeamRow>('select * from public.team_list()');
      return result.rows;
    });

    expect(rows).toHaveLength(5);
    expect(rows[0]).toMatchObject({
      id: SUPERADMIN_ID,
      email: 'superadmin@test.local',
      role: 'admin',
      actif: true,
      est_superadmin: true,
    });
    expect(rows.some((row) => row.email === 'voisin@test.local')).toBe(false);
  });

  it('change un rôle et laisse une trace dans le journal d’audit', async () => {
    await asUserCommitted(db, SUPERADMIN_ID, () =>
      db.query('select public.team_set_role($1, $2)', [SELLER_ID, 'cashier']),
    );

    const profile = await db.query<{ role: string }>(
      'select role from public.profiles where id = $1',
      [SELLER_ID],
    );
    const audit = await db.query<{ action: string; details: Record<string, unknown> }>(
      `select action, details from public.audit_log
       where entity = 'profiles' and entity_id = $1
       order by id desc limit 1`,
      [SELLER_ID],
    );

    expect(profile.rows).toEqual([{ role: 'cashier' }]);
    expect(audit.rows[0]?.action).toBe('profile_updated');
    expect(audit.rows[0]?.details).toMatchObject({
      ancien_role: 'seller',
      nouveau_role: 'cashier',
    });
  });

  it('désactive puis réactive un compte', async () => {
    await asUserCommitted(db, SUPERADMIN_ID, () =>
      db.query('select public.team_set_actif($1, $2)', [SELLER_ID, false]),
    );

    const inactive = await db.query<{ actif: boolean }>(
      'select actif from public.profiles where id = $1',
      [SELLER_ID],
    );
    expect(inactive.rows).toEqual([{ actif: false }]);

    await asUserCommitted(db, SUPERADMIN_ID, () =>
      db.query('select public.team_set_actif($1, $2)', [SELLER_ID, true]),
    );

    const active = await db.query<{ actif: boolean }>(
      'select actif from public.profiles where id = $1',
      [SELLER_ID],
    );
    expect(active.rows).toEqual([{ actif: true }]);
  });

  it('protège le compte superadmin contre un changement de rôle ou une désactivation', async () => {
    await expect(
      asUser(db, SUPERADMIN_ID, () =>
        db.query('select public.team_set_role($1, $2)', [SUPERADMIN_ID, 'cashier']),
      ),
    ).rejects.toThrow(/superadmin/);

    await expect(
      asUser(db, SUPERADMIN_ID, () =>
        db.query('select public.team_set_actif($1, $2)', [SUPERADMIN_ID, false]),
      ),
    ).rejects.toThrow(/superadmin/);
  });

  it('ne touche jamais un compte d’une autre boutique', async () => {
    const rows = await asUser(db, SUPERADMIN_ID, async () => {
      const result = await db.query<TeamRow>('select * from public.team_list()');
      return result.rows;
    });
    expect(rows.some((row) => row.id === OUTSIDER_ID)).toBe(false);

    await expect(
      asUser(db, SUPERADMIN_ID, () =>
        db.query('select public.team_set_actif($1, $2)', [OUTSIDER_ID, false]),
      ),
    ).rejects.toThrow(/introuvable/);
  });

  it('interdit les modifications directes de profils depuis l’API', async () => {
    for (const userId of [ADMIN_ID, SUPERADMIN_ID]) {
      await expect(
        asUser(db, userId, () =>
          db.query('update public.profiles set nom = $1 where id = $2', [
            'Nom forgé',
            SELLER_ID,
          ]),
        ),
      ).rejects.toThrow();
    }

    const name = await db.query<{ nom: string }>(
      'select nom from public.profiles where id = $1',
      [SELLER_ID],
    );
    expect(name.rows[0]?.nom).not.toBe('Nom forgé');
  });

  it('impose un seul superadmin par boutique', async () => {
    await expect(
      db.query('update public.profiles set est_superadmin = true where id = $1', [ADMIN_ID]),
    ).rejects.toThrow();
  });

  it('exige que le superadmin soit administrateur', async () => {
    await expect(
      db.query('update public.profiles set role = $1 where id = $2', ['cashier', SUPERADMIN_ID]),
    ).rejects.toThrow();
  });
});
