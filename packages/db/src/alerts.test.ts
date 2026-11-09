import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { PGlite } from '@electric-sql/pglite';
import { ADMIN_ID, BOUTIQUE_ID, CASHIER_ID, INACTIVE_ID, SELLER_ID, VARIANT_ID } from './fixtures';
import { asAnonymous, asUser, asUserCommitted, createTestDatabase } from './testing/pglite';
import { seedCatalog, seedUsers } from './testing/seed';

const CASH_GAP_ALERT_ID = 'b0000000-0000-4000-8000-000000000010';
const UNKNOWN_ALERT_ID = 'b0000000-0000-4000-8000-000000000099';

async function scalar<T>(db: PGlite, sql: string, params: unknown[] = []): Promise<T | undefined> {
  const result = await db.query<T>(sql, params);
  return result.rows[0];
}

async function receiveBootstrapStockAlert(db: PGlite): Promise<string> {
  const alert = await scalar<{ id: string }>(
    db,
    `select id from public.alerts
     where variant_id = $1 and type = 'low_stock' and resolved_at is null`,
    [VARIANT_ID],
  );
  if (!alert) {
    throw new Error('Alerte de stock attendue après le seed du catalogue.');
  }
  return alert.id;
}

describe('acquittement des alertes', () => {
  let db: PGlite;
  let stockAlertId: string;

  beforeAll(async () => {
    db = await createTestDatabase();
    await seedUsers(db);
    await seedCatalog(db);
    stockAlertId = await receiveBootstrapStockAlert(db);

    await db.exec(`
      insert into public.alerts (id, boutique_id, type, severity, message, variant_id, resolved_at)
      values (
        gen_random_uuid(), '${BOUTIQUE_ID}', 'negative_stock', 'critical',
        'Stock négatif historique résolu.', '${VARIANT_ID}', now()
      );

      insert into public.alerts (id, boutique_id, type, severity, message)
      values (
        '${CASH_GAP_ALERT_ID}', '${BOUTIQUE_ID}', 'cash_gap', 'critical',
        'Écart de caisse de 5000 XOF à la clôture.'
      );
    `);
  });

  afterAll(async () => {
    await db.close();
  });

  it('limite la lecture des alertes selon le rôle', async () => {
    const cashierTypes = await asUser(db, CASHIER_ID, async () => {
      const result = await db.query<{ type: string }>(
        'select type::text from public.alerts order by type',
      );
      return result.rows.map((row) => row.type);
    });

    expect(cashierTypes).toEqual(['low_stock', 'negative_stock']);

    const adminTypes = await asUser(db, ADMIN_ID, async () => {
      const result = await db.query<{ type: string }>(
        'select type::text from public.alerts order by type',
      );
      return result.rows.map((row) => row.type);
    });

    expect(adminTypes).toEqual(['cash_gap', 'low_stock', 'negative_stock']);
  });

  it('interdit au caissier, au vendeur et à un compte inactif d’acquitter', async () => {
    for (const userId of [CASHIER_ID, SELLER_ID, INACTIVE_ID]) {
      await expect(
        asUserCommitted(db, userId, () =>
          db.query('select public.acknowledge_alert($1)', [CASH_GAP_ALERT_ID]),
        ),
      ).rejects.toThrow(/rôle|inactif/);
    }

    const alert = await scalar<{ acknowledged_at: string | null }>(
      db,
      'select acknowledged_at from public.alerts where id = $1',
      [CASH_GAP_ALERT_ID],
    );
    expect(alert?.acknowledged_at).toBeNull();
  });

  it('acquitte une alerte, journalise et rejoue sans doublon', async () => {
    const first = await asUserCommitted(db, ADMIN_ID, () =>
      scalar<{
        acknowledge_alert: {
          id: string;
          acknowledged_at: string;
          acknowledged_by: string;
          rejoue: boolean;
        };
      }>(db, 'select public.acknowledge_alert($1)', [CASH_GAP_ALERT_ID]),
    );

    expect(first?.acknowledge_alert).toMatchObject({
      id: CASH_GAP_ALERT_ID,
      acknowledged_by: ADMIN_ID,
      rejoue: false,
    });
    expect(first?.acknowledge_alert.acknowledged_at).toBeTruthy();

    const stored = await scalar<{ acknowledged_by: string; acknowledged_at: string }>(
      db,
      'select acknowledged_by, acknowledged_at from public.alerts where id = $1',
      [CASH_GAP_ALERT_ID],
    );
    expect(stored?.acknowledged_by).toBe(ADMIN_ID);
    expect(stored?.acknowledged_at).toBeTruthy();

    const audit = await scalar<{ details: { type: string; severity: string } }>(
      db,
      `select details from public.audit_log
       where action = 'alert_acknowledged' and entity_id = $1`,
      [CASH_GAP_ALERT_ID],
    );
    expect(audit?.details).toMatchObject({ type: 'cash_gap', severity: 'critical' });

    const replay = await asUserCommitted(db, ADMIN_ID, () =>
      scalar<{ acknowledge_alert: { acknowledged_at: string; rejoue: boolean } }>(
        db,
        'select public.acknowledge_alert($1)',
        [CASH_GAP_ALERT_ID],
      ),
    );
    expect(replay?.acknowledge_alert.rejoue).toBe(true);
    expect(replay?.acknowledge_alert.acknowledged_at).toBe(
      first?.acknowledge_alert.acknowledged_at,
    );

    const auditCount = await scalar<{ total: number }>(
      db,
      `select count(*)::int as total from public.audit_log
       where action = 'alert_acknowledged' and entity_id = $1`,
      [CASH_GAP_ALERT_ID],
    );
    expect(auditCount?.total).toBe(1);
  });

  it('refuse une alerte inconnue', async () => {
    await expect(
      asUserCommitted(db, ADMIN_ID, () =>
        db.query('select public.acknowledge_alert($1)', [UNKNOWN_ALERT_ID]),
      ),
    ).rejects.toThrow(/introuvable/);
  });

  it('interdit toute écriture directe sur la table des alertes', async () => {
    await expect(
      asUserCommitted(db, ADMIN_ID, () =>
        db.query('update public.alerts set resolved_at = now() where id = $1', [stockAlertId]),
      ),
    ).rejects.toThrow(/permission denied/);
  });

  it('refuse l’acquittement aux appels anonymes', async () => {
    await expect(
      asAnonymous(db, () => db.query('select public.acknowledge_alert($1)', [CASH_GAP_ALERT_ID])),
    ).rejects.toThrow(/permission denied/);
  });
});
