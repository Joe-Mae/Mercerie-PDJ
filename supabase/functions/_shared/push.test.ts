import { describe, expect, it } from 'vitest';
import {
  ALERT_TYPE_LABELS,
  ALERT_TYPES,
  alertPushPayload,
  parseAlertInsert,
  recipientRoles,
} from './push';

const BOUTIQUE_ID = 'b7e2c1a4-5d6f-4e8a-9b0c-1d2e3f4a5b6c';

function insertPayload(record: Record<string, unknown>) {
  return {
    type: 'INSERT',
    table: 'alerts',
    schema: 'public',
    record: {
      id: 'b0000000-0000-4000-8000-000000000001',
      boutique_id: BOUTIQUE_ID,
      type: 'low_stock',
      severity: 'warning',
      message: 'Stock bas : Satin ivoire (0,5 m restant).',
      ...record,
    },
    old_record: null,
  };
}

describe('notifications Web Push des alertes', () => {
  it('envoie les alertes de stock à l’administration et à la caisse', () => {
    expect(recipientRoles('low_stock')).toEqual(['admin', 'cashier']);
    expect(recipientRoles('negative_stock')).toEqual(['admin', 'cashier']);

    for (const type of ALERT_TYPES) {
      if (type !== 'low_stock' && type !== 'negative_stock') {
        expect(recipientRoles(type)).toEqual(['admin']);
      }
    }
  });

  it('construit un message court, prioritaire et sans doublon', () => {
    const payload = alertPushPayload({
      id: 'b0000000-0000-4000-8000-000000000001',
      type: 'cash_gap',
      severity: 'critical',
      message: 'Écart de caisse de 5 000 XOF à la clôture.',
    });

    expect(payload).toEqual({
      title: 'Urgent · Écart de caisse',
      body: 'Écart de caisse de 5 000 XOF à la clôture.',
      url: '?page=alertes',
      tag: 'alert-b0000000-0000-4000-8000-000000000001',
    });
  });

  it('n’ajoute pas de mention urgente aux alertes ordinaires', () => {
    const payload = alertPushPayload({
      id: 'b0000000-0000-4000-8000-000000000002',
      type: 'low_stock',
      severity: 'warning',
      message: 'Stock bas.',
    });

    expect(payload.title).toBe('Stock bas');
  });

  it('lit le contenu d’un webhook INSERT sur les alertes', () => {
    expect(parseAlertInsert(insertPayload({}))).toEqual({
      id: 'b0000000-0000-4000-8000-000000000001',
      boutique_id: BOUTIQUE_ID,
      type: 'low_stock',
      severity: 'warning',
      message: 'Stock bas : Satin ivoire (0,5 m restant).',
    });
  });

  it('ramène une sévérité inconnue au niveau information', () => {
    const alert = parseAlertInsert(insertPayload({ severity: 'inconnue' }));
    expect(alert?.severity).toBe('info');
  });

  it('refuse les autres événements et les alertes incomplètes', () => {
    expect(parseAlertInsert({ ...insertPayload({}), type: 'UPDATE' })).toBeNull();
    expect(parseAlertInsert({ ...insertPayload({}), table: 'sales' })).toBeNull();
    expect(parseAlertInsert({ ...insertPayload({}), schema: 'private' })).toBeNull();
    expect(parseAlertInsert({ ...insertPayload({}), record: null })).toBeNull();
    expect(parseAlertInsert(insertPayload({ type: 'inconnue' }))).toBeNull();
    expect(parseAlertInsert(insertPayload({ boutique_id: undefined }))).toBeNull();
    expect(parseAlertInsert(insertPayload({ message: undefined }))).toBeNull();
    expect(parseAlertInsert(null)).toBeNull();
  });

  it('connaît le libellé de chaque type d’alerte', () => {
    for (const type of ALERT_TYPES) {
      expect(ALERT_TYPE_LABELS[type].length).toBeGreaterThan(0);
    }
  });
});
