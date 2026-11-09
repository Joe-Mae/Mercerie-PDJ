import Dexie, { type Table } from 'dexie';
import type { LocalSale, LocalSession, OutboxRecord } from './types';

interface CacheRecord {
  key: string;
  value: unknown;
  savedAt: string;
}

interface MetaRecord {
  key: string;
  value: number;
}

class OfflineDatabase extends Dexie {
  outbox!: Table<OutboxRecord, string>;
  sales!: Table<LocalSale, string>;
  sessions!: Table<LocalSession, string>;
  cache!: Table<CacheRecord, string>;
  meta!: Table<MetaRecord, string>;

  constructor() {
    super('mercerie.pdj.v1');
    this.version(1).stores({
      outbox: 'id, userId, deviceId, sequence, [deviceId+sequence]',
      sales: 'id, userId, sessionId, deviceId, dateVente, syncStatus, reference',
      sessions: 'id, userId, deviceId, statut',
      cache: 'key',
      meta: 'key',
    });
  }
}

let database: OfflineDatabase | null = null;

export function getOfflineDb(): OfflineDatabase {
  if (typeof indexedDB === 'undefined') {
    throw new Error('Le stockage local n’est pas disponible sur cet appareil.');
  }

  database ??= new OfflineDatabase();
  return database;
}

export async function resetOfflineDb(): Promise<void> {
  if (typeof indexedDB === 'undefined') {
    return;
  }

  if (database) {
    await database.delete();
    database = null;
    return;
  }

  const temporary = new OfflineDatabase();
  await temporary.delete();
  temporary.close();
}

export async function readCache<T>(key: string): Promise<T | null> {
  const record = await getOfflineDb().cache.get(key);
  return record ? (record.value as T) : null;
}

export async function writeCache(key: string, value: unknown): Promise<void> {
  await getOfflineDb().cache.put({
    key,
    value,
    savedAt: new Date().toISOString(),
  });
}
