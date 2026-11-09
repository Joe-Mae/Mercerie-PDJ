export const ALERT_TYPES = [
  'low_stock',
  'negative_stock',
  'cash_gap',
  'sale_cancelled',
  'discount',
  'stock_adjustment',
  'login',
] as const;

export type AlertType = (typeof ALERT_TYPES)[number];
export type AlertSeverity = 'info' | 'warning' | 'critical';
export type PushRecipientRole = 'admin' | 'cashier';

export interface AlertRecord {
  readonly id: string;
  readonly boutique_id: string;
  readonly type: AlertType;
  readonly severity: AlertSeverity;
  readonly message: string;
}

export interface PushPayload {
  readonly title: string;
  readonly body: string;
  readonly url: string;
  readonly tag: string;
}

export const ALERT_TYPE_LABELS: Readonly<Record<AlertType, string>> = {
  low_stock: 'Stock bas',
  negative_stock: 'Stock négatif',
  cash_gap: 'Écart de caisse',
  sale_cancelled: 'Vente annulée',
  discount: 'Remise accordée',
  stock_adjustment: 'Ajustement de stock',
  login: 'Nouvelle connexion',
};

function isAlertType(value: string): value is AlertType {
  return (ALERT_TYPES as readonly string[]).includes(value);
}

function isSeverity(value: unknown): value is AlertSeverity {
  return value === 'info' || value === 'warning' || value === 'critical';
}

export function recipientRoles(type: AlertType): readonly PushRecipientRole[] {
  return type === 'low_stock' || type === 'negative_stock' ? ['admin', 'cashier'] : ['admin'];
}

export function alertPushPayload(
  record: Pick<AlertRecord, 'id' | 'type' | 'severity' | 'message'>,
): PushPayload {
  const prefix = record.severity === 'critical' ? 'Urgent · ' : '';

  return {
    title: `${prefix}${ALERT_TYPE_LABELS[record.type]}`,
    body: record.message,
    url: '?page=alertes',
    tag: `alert-${record.id}`,
  };
}

export function parseAlertInsert(value: unknown): AlertRecord | null {
  if (!value || typeof value !== 'object') {
    return null;
  }

  const payload = value as Record<string, unknown>;
  if (payload.type !== 'INSERT' || payload.table !== 'alerts' || payload.schema !== 'public') {
    return null;
  }

  const record = payload.record;
  if (!record || typeof record !== 'object') {
    return null;
  }

  const row = record as Record<string, unknown>;
  if (
    typeof row.id !== 'string' ||
    typeof row.boutique_id !== 'string' ||
    typeof row.message !== 'string' ||
    typeof row.type !== 'string' ||
    !isAlertType(row.type)
  ) {
    return null;
  }

  return {
    id: row.id,
    boutique_id: row.boutique_id,
    type: row.type,
    severity: isSeverity(row.severity) ? row.severity : 'info',
    message: row.message,
  };
}
