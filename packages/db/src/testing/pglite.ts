import { readdir, readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { PGlite } from '@electric-sql/pglite';

const MIGRATIONS_DIRECTORY = fileURLToPath(
  new URL('../../../../supabase/migrations/', import.meta.url),
);

const SUPABASE_BOOTSTRAP = `
create role anon nologin;
create role authenticated nologin;
create role service_role nologin bypassrls;

create schema auth;

create table auth.users (
  id uuid primary key,
  email text,
  raw_app_meta_data jsonb not null default '{}'::jsonb,
  raw_user_meta_data jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create function auth.uid()
returns uuid
language sql
stable
as $$
  select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid
$$;

grant usage on schema auth to anon, authenticated, service_role;
grant execute on function auth.uid() to public;
`;

export async function createTestDatabase(): Promise<PGlite> {
  const db = new PGlite();
  await db.exec(SUPABASE_BOOTSTRAP);

  const migrationFiles = (await readdir(MIGRATIONS_DIRECTORY))
    .filter((file) => file.endsWith('.sql'))
    .sort((left, right) => left.localeCompare(right));

  for (const file of migrationFiles) {
    const sql = await readFile(`${MIGRATIONS_DIRECTORY}${file}`, 'utf8');
    try {
      await db.exec(sql);
    } catch (error) {
      throw new Error(`Échec de la migration ${file}`, { cause: error });
    }
  }

  return db;
}

export async function asUser<T>(
  db: PGlite,
  userId: string,
  action: () => Promise<T>,
  databaseRole = 'authenticated',
): Promise<T> {
  await db.exec('begin');
  try {
    await db.query(`select set_config('request.jwt.claim.sub', $1, true)`, [userId]);
    await db.exec(`set local role ${databaseRole}`);
    return await action();
  } finally {
    await db.exec('rollback');
  }
}

export async function asUserCommitted<T>(
  db: PGlite,
  userId: string,
  action: () => Promise<T>,
  databaseRole = 'authenticated',
): Promise<T> {
  await db.exec('begin');
  try {
    await db.query(`select set_config('request.jwt.claim.sub', $1, true)`, [userId]);
    await db.exec(`set local role ${databaseRole}`);
    const result = await action();
    await db.exec('commit');
    return result;
  } catch (error) {
    await db.exec('rollback');
    throw error;
  }
}

export async function asAnonymous<T>(db: PGlite, action: () => Promise<T>): Promise<T> {
  await db.exec('begin');
  try {
    await db.exec(`select set_config('request.jwt.claim.sub', '', true)`);
    await db.exec('set local role anon');
    return await action();
  } finally {
    await db.exec('rollback');
  }
}
