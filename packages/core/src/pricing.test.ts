import { describe, expect, it } from 'vitest';
import { DomainError } from './errors';
import { xof } from './money';
import {
  computeCashChange,
  computeLine,
  computeSaleTotals,
  validatePayments,
  type PaymentInput,
} from './pricing';

describe('calcul d’une ligne', () => {
  it('vend un tissu au mètre', () => {
    const line = computeLine({
      kind: 'article',
      quantity: '1,50',
      inputUnit: 'm',
      pricingUnit: 'metre',
      unitPriceXof: xof(5000),
    });

    expect(line.totalXof).toBe(7500);
    expect(line.stock).toEqual({ dimension: 'length', value: 150 });
  });

  it('vend un yard sur un article dont le prix est au mètre', () => {
    const line = computeLine({
      kind: 'article',
      quantity: '1',
      inputUnit: 'yard',
      pricingUnit: 'metre',
      unitPriceXof: xof(5000),
    });

    expect(line.totalXof).toBe(4500);
    expect(line.stock).toEqual({ dimension: 'length', value: 90 });
  });

  it('facture au yard une quantité saisie en mètres', () => {
    const line = computeLine({
      kind: 'article',
      quantity: '1,50',
      inputUnit: 'm',
      pricingUnit: 'yard',
      unitPriceXof: xof(5000),
    });

    expect(line.totalXof).toBe(8333);
    expect(line.stock).toEqual({ dimension: 'length', value: 150 });
  });

  it('facture un yard et quart au yard', () => {
    const line = computeLine({
      kind: 'article',
      quantity: '1,25',
      inputUnit: 'yard',
      pricingUnit: 'yard',
      unitPriceXof: xof(5000),
    });

    expect(line.totalXof).toBe(6250);
    expect(line.stock).toEqual({ dimension: 'length', value: 113 });
  });

  it('facture un yard et quart au mètre', () => {
    const line = computeLine({
      kind: 'article',
      quantity: '1,25',
      inputUnit: 'yard',
      pricingUnit: 'metre',
      unitPriceXof: xof(5000),
    });

    expect(line.totalXof).toBe(5625);
    expect(line.stock).toEqual({ dimension: 'length', value: 113 });
  });

  it('arrondit le total au franc le plus proche', () => {
    const line = computeLine({
      kind: 'article',
      quantity: '1',
      inputUnit: 'cm',
      pricingUnit: 'metre',
      unitPriceXof: xof(50),
    });

    expect(line.totalXof).toBe(1);
    expect(line.stock).toEqual({ dimension: 'length', value: 1 });
  });

  it('vend des articles à l’unité', () => {
    const line = computeLine({
      kind: 'article',
      quantity: '3',
      inputUnit: 'piece',
      pricingUnit: 'piece',
      unitPriceXof: xof(150),
    });

    expect(line.totalXof).toBe(450);
    expect(line.stock).toEqual({ dimension: 'unit', value: 3 });
  });

  it('facture une prestation sans stock', () => {
    const line = computeLine({
      kind: 'service',
      quantity: '1',
      inputUnit: 'piece',
      pricingUnit: 'piece',
      unitPriceXof: xof(2000),
    });

    expect(line.totalXof).toBe(2000);
    expect(line.stock).toBeNull();
  });

  it('refuse les unités incohérentes', () => {
    expect(() =>
      computeLine({
        kind: 'article',
        quantity: '1',
        inputUnit: 'piece',
        pricingUnit: 'metre',
        unitPriceXof: xof(5000),
      }),
    ).toThrow(DomainError);

    expect(() =>
      computeLine({
        kind: 'article',
        quantity: '1',
        inputUnit: 'm',
        pricingUnit: 'piece',
        unitPriceXof: xof(5000),
      }),
    ).toThrow(DomainError);

    expect(() =>
      computeLine({
        kind: 'service',
        quantity: '1',
        inputUnit: 'piece',
        pricingUnit: 'metre',
        unitPriceXof: xof(2000),
      }),
    ).toThrow(DomainError);
  });

  it('refuse les quantités nulles et les prix négatifs', () => {
    expect(() =>
      computeLine({
        kind: 'article',
        quantity: '0',
        inputUnit: 'm',
        pricingUnit: 'metre',
        unitPriceXof: xof(5000),
      }),
    ).toThrow(DomainError);

    expect(() =>
      computeLine({
        kind: 'article',
        quantity: '1',
        inputUnit: 'm',
        pricingUnit: 'metre',
        unitPriceXof: xof(-1),
      }),
    ).toThrow(DomainError);
  });

  it('refuse une quantité trop petite pour le stock', () => {
    expect(() =>
      computeLine({
        kind: 'article',
        quantity: '0,001',
        inputUnit: 'cm',
        pricingUnit: 'metre',
        unitPriceXof: xof(5000),
      }),
    ).toThrow(DomainError);
  });
});

describe('totaux d’une vente', () => {
  it('applique une remise au sous-total', () => {
    const totals = computeSaleTotals([xof(7500), xof(2500)], xof(1000));

    expect(totals.subtotalXof).toBe(10000);
    expect(totals.totalXof).toBe(9000);
  });

  it('refuse une remise supérieure au sous-total', () => {
    expect(() => computeSaleTotals([xof(1000)], xof(1001))).toThrow(DomainError);
    expect(() => computeSaleTotals([xof(1000)], xof(-1))).toThrow(DomainError);
  });
});

describe('paiements', () => {
  it('accepte un paiement en espèces exact', () => {
    expect(validatePayments(xof(7500), [{ method: 'cash', amountXof: xof(7500) }])).toBe(7500);
  });

  it('accepte un paiement mixte avec référence Mobile Money', () => {
    const payments: PaymentInput[] = [
      { method: 'tmoney', amountXof: xof(5000), reference: 'TM-12345' },
      { method: 'cash', amountXof: xof(2500) },
    ];

    expect(validatePayments(xof(7500), payments)).toBe(7500);
  });

  it('exige une référence pour T-Money et Flooz', () => {
    expect(() => validatePayments(xof(5000), [{ method: 'tmoney', amountXof: xof(5000) }])).toThrow(
      DomainError,
    );

    expect(() =>
      validatePayments(xof(5000), [{ method: 'flooz', amountXof: xof(5000), reference: '   ' }]),
    ).toThrow(DomainError);
  });

  it('refuse une somme de paiements différente du total', () => {
    expect(() => validatePayments(xof(7500), [{ method: 'cash', amountXof: xof(7000) }])).toThrow(
      DomainError,
    );
  });

  it('refuse l’absence de paiement ou un montant nul', () => {
    expect(() => validatePayments(xof(0), [])).toThrow(DomainError);
    expect(() => validatePayments(xof(0), [{ method: 'cash', amountXof: xof(0) }])).toThrow(
      DomainError,
    );
  });

  it('calcule la monnaie à rendre', () => {
    expect(computeCashChange(xof(10000), xof(7500))).toBe(2500);
    expect(() => computeCashChange(xof(5000), xof(7500))).toThrow(DomainError);
  });
});
