import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { PGlite } from '@electric-sql/pglite';
import { ADMIN_ID, BOUTIQUE_ID, CASHIER_ID, DEVICE_ID, INACTIVE_ID, SELLER_ID } from './fixtures';
import { asAnonymous, asUser, asUserCommitted, createTestDatabase } from './testing/pglite';
import { seedUsers } from './testing/seed';

const ENDPOINT = 'https://push.example.test/subscription/appareil-caisse';
const OTHER_ENDPOINT = 'https://push.example.test/subscription/autre-boutique';
const OTHER_BOUTIQUE_ID = 'b7e2c1a4-5d6f-4e8a-9b0c-1d2e3f4a5b6d';
const OTHER_ADMIN_ID = 'a0000000-0000-4000-8000-000000000007';
const P256DH = 'BOr8Y3Q5u0V3Jz6y2w6d4x9m1c7k5p8s3n0r4t6v2b9l1h5f8j3q7w4e6';
const AUTH = 'k3P8s1Qz5V7m2N4x';

async function scalar<T>(db: PGlite, sql: string, params: unknown[] = []): Promise<T | undefined> {
  const result = await db.query<T>(sql, params);
  return result.rows[0];
}

async function register(
  db: PGlite,
  userId: string,
  endpoint: string,
  deviceId: string | null = DEVICE_ID,
) {
  return asUserCommitted(db, userId, () =>
    scalar<{
      register_push_subscription: {
        id: string;
        created: boolean;
        reassigned: boolean;
      };
    }>(db, 'select public.register_push_subscription($1, $2, $3, $4)', [
      endpoint,
      P256DH,
      AUTH,
      deviceId,
    ]),
  );
}

describe('abonnements aux notifications Web Push', () => {
  let db: PGlite;

  beforeAll(async () => {
    db = await createTestDatabase();
    await seedUsers(db);

    await db.exec(`
      insert into public.devices (id, boutique_id, nom, plateforme)
      values ('${DEVICE_ID}', '${BOUTIQUE_ID}', 'Tablette test', 'web');

      insert into public.boutiques (id, nom, code)
      values ('${OTHER_BOUTIQUE_ID}', 'Autre mercerie', 'AUTRE');

      insert into auth.users (id, email, raw_app_meta_data, raw_user_meta_data)
      values (
        '${OTHER_ADMIN_ID}',
        'autre@test.local',
        '{"role":"admin","actif":true,"boutique_id":"${OTHER_BOUTIQUE_ID}"}'::jsonb,
        '{"nom":"Admin Autre"}'::jsonb
      );

      insert into public.push_subscriptions (
        boutique_id, user_id, endpoint, p256dh, auth
      )
      values ('${OTHER_BOUTIQUE_ID}', '${OTHER_ADMIN_ID}', '${OTHER_ENDPOINT}', '${P256DH}', '${AUTH}');
    `);
  });

  afterAll(async () => {
    await db.close();
  });

  it('réserve l’inscription aux administrateurs et à la caisse', async () => {
    await expect(register(db, SELLER_ID, ENDPOINT)).rejects.toThrow(/rôle/);
    await expect(register(db, INACTIVE_ID, ENDPOINT)).rejects.toThrow(/inactif|rôle/);
    await expect(
      asAnonymous(db, () =>
        db.query('select public.register_push_subscription($1, $2, $3, $4)', [
          ENDPOINT,
          P256DH,
          AUTH,
          DEVICE_ID,
        ]),
      ),
    ).rejects.toThrow(/permission|droit/i);

    const rows = await scalar<{ count: string }>(
      db,
      'select count(*)::text from public.push_subscriptions',
    );
    expect(rows?.count).toBe('1');
  });

  it('inscrit un abonnement, puis le rafraîchit sans doublon', async () => {
    const first = await register(db, ADMIN_ID, ENDPOINT);
    expect(first?.register_push_subscription.created).toBe(true);
    expect(first?.register_push_subscription.reassigned).toBe(false);

    const second = await register(db, ADMIN_ID, ENDPOINT);
    expect(second?.register_push_subscription.created).toBe(false);
    expect(second?.register_push_subscription.reassigned).toBe(false);
    expect(second?.register_push_subscription.id).toBe(first?.register_push_subscription.id);

    const row = await scalar<{ user_id: string; revoked_at: string | null; device_id: string }>(
      db,
      'select user_id, revoked_at, device_id from public.push_subscriptions where endpoint = $1',
      [ENDPOINT],
    );
    expect(row?.user_id).toBe(ADMIN_ID);
    expect(row?.device_id).toBe(DEVICE_ID);
    expect(row?.revoked_at).toBeNull();

    const audit = await scalar<{ count: string }>(
      db,
      `select count(*)::text from public.audit_log
       where action = 'push_subscription_registered' and entity_id = $1`,
      [first?.register_push_subscription.id],
    );
    expect(audit?.count).toBe('1');
  });

  it('réaffecte un endpoint partagé au compte qui se connecte', async () => {
    const result = await register(db, CASHIER_ID, ENDPOINT);
    expect(result?.register_push_subscription.reassigned).toBe(true);
    expect(result?.register_push_subscription.created).toBe(false);

    const row = await scalar<{ user_id: string }>(
      db,
      'select user_id from public.push_subscriptions where endpoint = $1',
      [ENDPOINT],
    );
    expect(row?.user_id).toBe(CASHIER_ID);
  });

  it('révoque l’abonnement sans supprimer la trace', async () => {
    const first = await asUserCommitted(db, CASHIER_ID, () =>
      scalar<{ revoke_push_subscription: { revoked: boolean } }>(
        db,
        'select public.revoke_push_subscription($1)',
        [ENDPOINT],
      ),
    );
    expect(first?.revoke_push_subscription.revoked).toBe(true);

    const second = await asUserCommitted(db, CASHIER_ID, () =>
      scalar<{ revoke_push_subscription: { revoked: boolean } }>(
        db,
        'select public.revoke_push_subscription($1)',
        [ENDPOINT],
      ),
    );
    expect(second?.revoke_push_subscription.revoked).toBe(false);

    const row = await scalar<{ revoked_at: string | null }>(
      db,
      'select revoked_at from public.push_subscriptions where endpoint = $1',
      [ENDPOINT],
    );
    expect(row?.revoked_at).not.toBeNull();

    const audit = await scalar<{ count: string }>(
      db,
      `select count(*)::text from public.audit_log
       where action = 'push_subscription_revoked'`,
    );
    expect(audit?.count).toBe('1');
  });

  it('refuse un endpoint déjà rattaché à une autre boutique', async () => {
    await expect(register(db, ADMIN_ID, OTHER_ENDPOINT)).rejects.toThrow(/autre boutique/);

    const row = await scalar<{ user_id: string }>(
      db,
      'select user_id from public.push_subscriptions where endpoint = $1',
      [OTHER_ENDPOINT],
    );
    expect(row?.user_id).toBe(OTHER_ADMIN_ID);
  });

  it('garde les abonnements en lecture seule pour les clients', async () => {
    await expect(
      asUserCommitted(db, ADMIN_ID, () =>
        db.query(
          `insert into public.push_subscriptions (boutique_id, user_id, endpoint, p256dh, auth)
           values ($1, $2, 'https://push.example.test/direct', $3, $4)`,
          [BOUTIQUE_ID, ADMIN_ID, P256DH, AUTH],
        ),
      ),
    ).rejects.toThrow(/permission|droit/i);

    await expect(
      asUserCommitted(db, CASHIER_ID, () =>
        db.query(`update public.push_subscriptions set revoked_at = null where endpoint = $1`, [
          ENDPOINT,
        ]),
      ),
    ).rejects.toThrow(/permission|droit/i);

    await expect(
      asUserCommitted(db, CASHIER_ID, () =>
        db.query('delete from public.push_subscriptions where endpoint = $1', [ENDPOINT]),
      ),
    ).rejects.toThrow(/permission|droit/i);

    const visibleToSeller = await asUser(db, SELLER_ID, async () => {
      const result = await db.query('select id from public.push_subscriptions');
      return result.rows.length;
    });
    expect(visibleToSeller).toBe(0);

    const visibleToCashier = await asUser(db, CASHIER_ID, async () => {
      const result = await db.query<{ endpoint: string }>(
        'select endpoint from public.push_subscriptions',
      );
      return result.rows.map((row) => row.endpoint);
    });
    expect(visibleToCashier).toEqual([ENDPOINT]);
  });
});
