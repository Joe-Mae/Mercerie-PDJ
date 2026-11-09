import { describe, expect, it } from 'vitest';
import {
  isStockAlert,
  splitAlerts,
  toTreatCount,
  type AlertEntry,
  type AlertSeverity,
  type AlertType,
} from './alerts';

function alert(
  id: string,
  type: AlertType,
  severity: AlertSeverity,
  createdAt: string,
  state: { acknowledged?: boolean; resolved?: boolean } = {},
): AlertEntry {
  return {
    id,
    type,
    severity,
    message: `Alerte ${id}`,
    variantId: null,
    saleId: null,
    cashSessionId: null,
    resolvedAt: state.resolved ? '2026-11-08T10:00:00.000Z' : null,
    acknowledgedAt: state.acknowledged ? '2026-11-08T09:00:00.000Z' : null,
    acknowledgedBy: state.acknowledged ? 'admin' : null,
    acknowledgedByName: state.acknowledged ? 'Mme Adjovi' : null,
    createdAt,
  };
}

describe('classement des alertes', () => {
  const alerts: readonly AlertEntry[] = [
    alert('warn-old', 'low_stock', 'warning', '2026-11-07T08:00:00.000Z'),
    alert('critical', 'cash_gap', 'critical', '2026-11-06T08:00:00.000Z'),
    alert('warn-new', 'low_stock', 'warning', '2026-11-08T08:00:00.000Z'),
    alert('taken', 'low_stock', 'warning', '2026-11-08T07:00:00.000Z', {
      acknowledged: true,
    }),
    alert('done', 'stock_adjustment', 'info', '2026-11-05T08:00:00.000Z', {
      acknowledged: true,
      resolved: true,
    }),
  ];

  it('sépare à traiter, prises en charge et résolues', () => {
    const sections = splitAlerts(alerts);
    expect(sections.toTreat.map((entry) => entry.id)).toEqual(['critical', 'warn-new', 'warn-old']);
    expect(sections.inProgress.map((entry) => entry.id)).toEqual(['taken']);
    expect(sections.resolved.map((entry) => entry.id)).toEqual(['done']);
  });

  it('compte uniquement les alertes ni résolues ni prises en charge', () => {
    expect(toTreatCount(alerts)).toBe(3);
  });

  it('reconnaît les alertes de stock', () => {
    expect(isStockAlert({ type: 'low_stock' })).toBe(true);
    expect(isStockAlert({ type: 'negative_stock' })).toBe(true);
    expect(isStockAlert({ type: 'cash_gap' })).toBe(false);
  });
});
