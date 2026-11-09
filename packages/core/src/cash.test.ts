import { describe, expect, it } from 'vitest';
import { cashFromPayments, cashGap, expectedCash, hasCashGap } from './cash';
import { DomainError } from './errors';
import { xof } from './money';
import type { PaymentInput } from './pricing';

describe('caisse attendue', () => {
  it('additionne le fond, les ventes et les dépôts, puis retranche les sorties', () => {
    const expected = expectedCash({
      openingFloat: xof(10000),
      cashSales: xof(25000),
      cashRefunds: xof(2000),
      deposits: xof(5000),
      withdrawals: xof(3000),
    });

    expect(expected).toBe(35000);
  });

  it('ignore T-Money et Flooz dans le tiroir-caisse', () => {
    const payments: PaymentInput[] = [
      { method: 'cash', amountXof: xof(2500) },
      { method: 'tmoney', amountXof: xof(5000), reference: 'TM-123' },
      { method: 'flooz', amountXof: xof(1000), reference: 'FL-456' },
    ];

    expect(cashFromPayments(payments)).toBe(2500);
    expect(cashFromPayments([])).toBe(0);
  });

  it('refuse les composantes négatives', () => {
    expect(() =>
      expectedCash({
        openingFloat: xof(-1),
        cashSales: xof(0),
        cashRefunds: xof(0),
        deposits: xof(0),
        withdrawals: xof(0),
      }),
    ).toThrow(DomainError);

    expect(() => cashFromPayments([{ method: 'cash', amountXof: xof(-1) }])).toThrow(DomainError);
  });
});

describe('écart de caisse', () => {
  it('calcule un écart négatif quand il manque de l’argent', () => {
    const gap = cashGap(xof(34500), xof(35000));

    expect(gap).toBe(-500);
    expect(hasCashGap(gap)).toBe(true);
  });

  it('accepte une caisse juste', () => {
    expect(cashGap(xof(35000), xof(35000))).toBe(0);
    expect(hasCashGap(xof(0))).toBe(false);
  });

  it('refuse un montant compté négatif', () => {
    expect(() => cashGap(xof(-1), xof(0))).toThrow(DomainError);
  });
});
