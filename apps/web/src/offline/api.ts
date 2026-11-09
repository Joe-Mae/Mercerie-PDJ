import { orderOperations } from '@mercerie/core';
import { getSupabase } from '../lib/supabase';
import { getOfflineDb } from './db';
import type { OutboxRecord } from './types';

export interface SyncResult {
  readonly applied: number;
  readonly remaining: number;
  readonly error: string | null;
}

type Sender = (operation: OutboxRecord) => Promise<void>;

function rpcFailure(context: string, message: string): Error {
  return new Error(`${context} : ${message}`);
}

export async function sendOutboxOperation(operation: OutboxRecord): Promise<void> {
  const supabase = getSupabase();

  if (operation.kind === 'open_session') {
    const { error } = await supabase.rpc('open_cash_session', {
      p_id: operation.payload.id,
      p_device_id: operation.payload.deviceId,
      p_fond_ouverture_xof: operation.payload.fondOuvertureXof,
      p_ouverte_at: operation.payload.ouverteAt,
    });

    if (error) {
      throw rpcFailure('Ouverture de caisse refusée', error.message);
    }
    return;
  }

  if (operation.kind === 'close_session') {
    const { error } = await supabase.rpc('close_cash_session', {
      p_id: operation.payload.id,
      p_device_id: operation.payload.deviceId,
      p_montant_compte_xof: operation.payload.montantCompteXof,
      p_fermee_at: operation.payload.fermeeAt,
    });

    if (error) {
      throw rpcFailure('Clôture de caisse refusée', error.message);
    }
    return;
  }

  const { error } = await supabase.rpc('create_sale', {
    p_id: operation.payload.id,
    p_device_id: operation.payload.deviceId,
    p_cash_session_id: operation.payload.sessionId,
    p_reference: operation.payload.reference,
    p_date_vente: operation.payload.dateVente,
    p_remise_xof: operation.payload.remiseXof,
    p_remise_motif: operation.payload.remiseMotif,
    p_lines: operation.payload.lines.map((line) => ({
      variant_id: line.variantId,
      quantite_saisie: line.quantiteSaisie,
      unite_saisie: line.uniteSaisie,
      prix_unitaire_xof: line.prixUnitaireXof,
    })),
    p_payments: operation.payload.payments.map((payment) => ({
      method: payment.method,
      montant_xof: payment.montantXof,
      reference_mobile: payment.referenceMobile,
      montant_recu_xof: payment.montantRecuXof,
    })),
  });

  if (error) {
    throw rpcFailure(`Vente ${operation.payload.reference} refusée`, error.message);
  }
}

let activeFlush: Promise<SyncResult> | null = null;

async function runFlush(userId: string, send: Sender, force: boolean): Promise<SyncResult> {
  const db = getOfflineDb();
  const records = await db.outbox.where('userId').equals(userId).toArray();
  const ordered = orderOperations(
    records.map((record) => ({ ...record, deviceSequence: record.sequence })),
  );

  let applied = 0;

  for (const operation of ordered) {
    if (!force && operation.nextAttemptAt > Date.now()) {
      const remaining = await db.outbox.where('userId').equals(userId).count();
      return {
        applied,
        remaining,
        error: operation.lastError,
      };
    }

    try {
      await send(operation);
    } catch (cause) {
      const message = cause instanceof Error ? cause.message : 'La synchronisation a échoué.';
      const attempts = operation.attempts + 1;
      const delay = Math.min(5000 * 2 ** Math.min(attempts - 1, 6), 300_000);

      await db.transaction('rw', db.outbox, db.sales, db.sessions, async () => {
        await db.outbox.update(operation.id, {
          attempts,
          lastError: message,
          nextAttemptAt: Date.now() + delay,
        });

        if (operation.kind === 'sale') {
          await db.sales.update(operation.id, { syncStatus: 'error', syncError: message });
        } else {
          await db.sessions.update(operation.id, { syncError: message });
        }
      });

      const remaining = await db.outbox.where('userId').equals(userId).count();
      return { applied, remaining, error: message };
    }

    await db.transaction('rw', db.outbox, db.sales, db.sessions, async () => {
      await db.outbox.delete(operation.id);

      if (operation.kind === 'sale') {
        await db.sales.update(operation.id, {
          syncStatus: 'synced',
          syncError: null,
          syncedAt: new Date().toISOString(),
        });
      } else {
        await db.sessions.update(operation.id, {
          syncStatus: 'synced',
          syncError: null,
        });
      }
    });

    applied += 1;
  }

  const remaining = await db.outbox.where('userId').equals(userId).count();
  return { applied, remaining, error: null };
}

export function flushOutbox(
  userId: string,
  send: Sender = sendOutboxOperation,
  force = false,
): Promise<SyncResult> {
  if (activeFlush) {
    return activeFlush;
  }

  activeFlush = runFlush(userId, send, force).finally(() => {
    activeFlush = null;
  });

  return activeFlush;
}
