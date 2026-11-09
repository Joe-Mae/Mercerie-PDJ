import { afterAll, describe, expect, it } from 'vitest';
import { PGlite } from '@electric-sql/pglite';
import { createTestDatabase } from './testing/pglite';

describe('migrations Supabase', () => {
  let db: PGlite | undefined;

  afterAll(async () => {
    await db?.close();
  });

  it('applique toutes les migrations et crée la boutique PDJ', async () => {
    db = await createTestDatabase();
    const result = await db.query<{ nom: string; code: string }>(
      'select nom, code from public.boutiques',
    );
    expect(result.rows).toEqual([{ nom: 'Mercerie PDJ', code: 'PDJ' }]);
  });
});
