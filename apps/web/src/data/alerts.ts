export type AlertType =
  | 'low_stock'
  | 'negative_stock'
  | 'cash_gap'
  | 'sale_cancelled'
  | 'discount'
  | 'stock_adjustment'
  | 'login';

export type AlertSeverity = 'info' | 'warning' | 'critical';

export interface AlertEntry {
  readonly id: string;
  readonly type: AlertType;
  readonly severity: AlertSeverity;
  readonly message: string;
  readonly variantId: string | null;
  readonly saleId: string | null;
  readonly cashSessionId: string | null;
  readonly resolvedAt: string | null;
  readonly acknowledgedAt: string | null;
  readonly acknowledgedBy: string | null;
  readonly acknowledgedByName: string | null;
  readonly createdAt: string;
}

export const ALERT_TYPE_LABELS: Readonly<Record<AlertType, string>> = {
  low_stock: 'Stock bas',
  negative_stock: 'Stock négatif',
  cash_gap: 'Écart de caisse',
  sale_cancelled: 'Vente annulée',
  discount: 'Remise',
  stock_adjustment: 'Ajustement de stock',
  login: 'Connexion',
};

export const ALERT_SEVERITY_LABELS: Readonly<Record<AlertSeverity, string>> = {
  info: 'Information',
  warning: 'À surveiller',
  critical: 'Critique',
};

const SEVERITY_ORDER: Readonly<Record<AlertSeverity, number>> = {
  critical: 0,
  warning: 1,
  info: 2,
};

export interface AlertSections {
  readonly toTreat: readonly AlertEntry[];
  readonly inProgress: readonly AlertEntry[];
  readonly resolved: readonly AlertEntry[];
}

export function isStockAlert(alert: Pick<AlertEntry, 'type'>): boolean {
  return alert.type === 'low_stock' || alert.type === 'negative_stock';
}

function reportedOrder(left: AlertEntry, right: AlertEntry): number {
  return (
    SEVERITY_ORDER[left.severity] - SEVERITY_ORDER[right.severity] ||
    right.createdAt.localeCompare(left.createdAt)
  );
}

function recentOrder(left: AlertEntry, right: AlertEntry): number {
  return right.createdAt.localeCompare(left.createdAt);
}

export function splitAlerts(alerts: readonly AlertEntry[]): AlertSections {
  return {
    toTreat: alerts
      .filter((alert) => !alert.resolvedAt && !alert.acknowledgedAt)
      .sort(reportedOrder),
    inProgress: alerts
      .filter((alert) => !alert.resolvedAt && alert.acknowledgedAt)
      .sort(recentOrder),
    resolved: alerts.filter((alert) => alert.resolvedAt).sort(recentOrder),
  };
}

export function toTreatCount(alerts: readonly AlertEntry[]): number {
  return alerts.filter((alert) => !alert.resolvedAt && !alert.acknowledgedAt).length;
}
