import { getSupabase } from '../lib/supabase';
import type { AppRole } from '../types';
import type { AlertEntry, AlertSeverity, AlertType } from './alerts';

interface AlertRow {
  readonly id: string;
  readonly type: AlertType;
  readonly severity: AlertSeverity;
  readonly message: string;
  readonly variant_id: string | null;
  readonly sale_id: string | null;
  readonly cash_session_id: string | null;
  readonly resolved_at: string | null;
  readonly acknowledged_at: string | null;
  readonly acknowledged_by: string | null;
  readonly created_at: string;
}

interface ProfileNameRow {
  readonly id: string;
  readonly nom: string;
}

interface RpcErrorLike {
  readonly message: string;
  readonly code?: string;
}

const ALERT_COLUMNS =
  'id, type, severity, message, variant_id, sale_id, cash_session_id, resolved_at, acknowledged_at, acknowledged_by, created_at';

export async function loadAlerts(role: AppRole): Promise<AlertEntry[]> {
  const supabase = getSupabase();

  const [openResult, resolvedResult] = await Promise.all([
    supabase
      .from('alerts')
      .select(ALERT_COLUMNS)
      .is('resolved_at', null)
      .order('created_at', { ascending: false }),
    supabase
      .from('alerts')
      .select(ALERT_COLUMNS)
      .not('resolved_at', 'is', null)
      .order('resolved_at', { ascending: false })
      .limit(50),
  ]);

  if (openResult.error || resolvedResult.error) {
    throw new Error('Impossible de charger les alertes. Vérifie la connexion puis réessaie.');
  }

  const rows = [
    ...((openResult.data ?? []) as AlertRow[]),
    ...((resolvedResult.data ?? []) as AlertRow[]),
  ];
  const acknowledgedIds = [
    ...new Set(rows.map((row) => row.acknowledged_by).filter((id): id is string => Boolean(id))),
  ];
  const names = new Map<string, string>();

  if (role === 'admin' && acknowledgedIds.length > 0) {
    const profiles = await supabase.from('profiles').select('id, nom').in('id', acknowledgedIds);
    if (profiles.error) {
      throw new Error('Impossible de charger les alertes. Vérifie la connexion puis réessaie.');
    }
    for (const profile of (profiles.data ?? []) as ProfileNameRow[]) {
      names.set(profile.id, profile.nom);
    }
  }

  return rows.map((row) => ({
    id: row.id,
    type: row.type,
    severity: row.severity,
    message: row.message,
    variantId: row.variant_id,
    saleId: row.sale_id,
    cashSessionId: row.cash_session_id,
    resolvedAt: row.resolved_at,
    acknowledgedAt: row.acknowledged_at,
    acknowledgedBy: row.acknowledged_by,
    acknowledgedByName: row.acknowledged_by ? (names.get(row.acknowledged_by) ?? null) : null,
    createdAt: row.created_at,
  }));
}

export interface AcknowledgedAlert {
  readonly acknowledgedAt: string;
  readonly acknowledgedBy: string | null;
  readonly rejoue: boolean;
}

export async function acknowledgeAlert(id: string): Promise<AcknowledgedAlert> {
  const { data, error } = await getSupabase().rpc('acknowledge_alert', { p_id: id });

  if (error) {
    throw new Error(acknowledgeError(error));
  }

  const payload = data as {
    acknowledged_at?: string;
    acknowledged_by?: string | null;
    rejoue?: boolean;
  } | null;

  if (!payload?.acknowledged_at) {
    throw new Error('L’alerte n’a pas pu être prise en charge.');
  }

  return {
    acknowledgedAt: payload.acknowledged_at,
    acknowledgedBy: payload.acknowledged_by ?? null,
    rejoue: payload.rejoue ?? false,
  };
}

function acknowledgeError(error: RpcErrorLike): string {
  if (error.code === '42501' || /autre rôle|administrateur|inactif/i.test(error.message)) {
    return 'Cette action est réservée à un administrateur connecté.';
  }
  if (/introuvable/i.test(error.message)) {
    return 'Cette alerte n’existe plus ou n’appartient pas à cette boutique.';
  }
  return 'La prise en charge a échoué. Vérifie la connexion puis réessaie.';
}
