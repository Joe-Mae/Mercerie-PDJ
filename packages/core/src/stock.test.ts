import { describe, expect, it } from 'vitest';
import { DomainError } from './errors';
import { xof } from './money';
import {
  isLowStock,
  projectStock,
  projectStockWithPending,
  stockAlerts,
  stockEffectsForCancellation,
  stockEffectsForSale,
  stockValueXof,
  validateMovement,
  type MovementType,
  type PricedLineForStock,
  type StockMovement,
} from './stock';
import { cm, units } from './units';

interface MovementOverrides {
  id?: string;
  variantId?: string;
  type: MovementType;
  quantity: number;
  reason?: string;
  saleLineId?: string;
}

function movement(overrides: MovementOverrides): StockMovement {
  return {
    id: overrides.id ?? 'movement-1',
    variantId: overrides.variantId ?? 'variant-1',
    type: overrides.type,
    quantity: overrides.quantity,
    ...(overrides.reason === undefined ? {} : { reason: overrides.reason }),
    ...(overrides.saleLineId === undefined ? {} : { saleLineId: overrides.saleLineId }),
  };
}

describe('validation des mouvements de stock', () => {
  it('accepte les mouvements cohérents', () => {
    expect(() => validateMovement(movement({ type: 'reception', quantity: 100 }))).not.toThrow();
    expect(() =>
      validateMovement(movement({ type: 'sale', quantity: -30, saleLineId: 'line-1' })),
    ).not.toThrow();
    expect(() =>
      validateMovement(movement({ type: 'sale_cancel', quantity: 30, saleLineId: 'line-1' })),
    ).not.toThrow();
    expect(() =>
      validateMovement(movement({ type: 'loss', quantity: -5, reason: 'Tissu taché' })),
    ).not.toThrow();
    expect(() =>
      validateMovement(movement({ type: 'inventory', quantity: 3, reason: 'Inventaire du 07/11' })),
    ).not.toThrow();
    expect(() =>
      validateMovement(
        movement({ type: 'adjustment', quantity: -2, reason: 'Correction de saisie' }),
      ),
    ).not.toThrow();
  });

  it('refuse les quantités nulles ou non entières', () => {
    expect(() => validateMovement(movement({ type: 'reception', quantity: 0 }))).toThrow(
      DomainError,
    );
    expect(() => validateMovement(movement({ type: 'reception', quantity: 1.5 }))).toThrow(
      DomainError,
    );
  });

  it('refuse une vente sans ligne de vente', () => {
    expect(() => validateMovement(movement({ type: 'sale', quantity: -3 }))).toThrow(DomainError);
  });

  it('refuse les mauvais sens de mouvement', () => {
    expect(() => validateMovement(movement({ type: 'reception', quantity: -3 }))).toThrow(
      DomainError,
    );
    expect(() =>
      validateMovement(movement({ type: 'sale', quantity: 3, saleLineId: 'line-1' })),
    ).toThrow(DomainError);
    expect(() =>
      validateMovement(movement({ type: 'sale_cancel', quantity: -3, saleLineId: 'line-1' })),
    ).toThrow(DomainError);
    expect(() =>
      validateMovement(movement({ type: 'loss', quantity: 3, reason: 'Erreur' })),
    ).toThrow(DomainError);
  });

  it('exige un motif pour les sorties hors vente', () => {
    expect(() => validateMovement(movement({ type: 'loss', quantity: -3 }))).toThrow(DomainError);
    expect(() => validateMovement(movement({ type: 'inventory', quantity: 3 }))).toThrow(
      DomainError,
    );
    expect(() => validateMovement(movement({ type: 'adjustment', quantity: -3 }))).toThrow(
      DomainError,
    );
  });

  it('exige un identifiant et une variante', () => {
    expect(() => validateMovement(movement({ id: '   ', type: 'reception', quantity: 1 }))).toThrow(
      DomainError,
    );
    expect(() =>
      validateMovement(movement({ variantId: '', type: 'reception', quantity: 1 })),
    ).toThrow(DomainError);
  });
});

describe('projection du stock', () => {
  it('additionne le registre et accepte un stock négatif', () => {
    const movements: StockMovement[] = [
      movement({ type: 'reception', quantity: 100 }),
      movement({ type: 'sale', quantity: -30, saleLineId: 'line-1' }),
      movement({ type: 'loss', quantity: -80, reason: 'Perte' }),
    ];

    expect(projectStock(movements)).toBe(-10);
    expect(projectStock(movements, 5)).toBe(-5);
  });

  it('ajoute les opérations en attente au dernier stock connu', () => {
    expect(projectStockWithPending(10, [-3, -8])).toBe(-1);
    expect(projectStockWithPending(0, [])).toBe(0);
  });

  it('refuse un stock initial non entier', () => {
    expect(() => projectStock([], 1.5)).toThrow(DomainError);
  });
});

describe('alertes de stock', () => {
  it('sait si le stock est déjà sous le seuil', () => {
    expect(isLowStock(4, 5)).toBe(true);
    expect(isLowStock(5, 5)).toBe(false);
    expect(isLowStock(-1, 5)).toBe(true);
    expect(() => isLowStock(1, -1)).toThrow(DomainError);
  });

  it('signale le franchissement du seuil vers le bas', () => {
    expect(stockAlerts(10, 4, 5)).toEqual({ lowStock: true, negativeStock: false });
    expect(stockAlerts(5, 4, 5)).toEqual({ lowStock: true, negativeStock: false });
    expect(stockAlerts(4, 2, 5)).toEqual({ lowStock: false, negativeStock: false });
  });

  it('signale le passage en stock négatif', () => {
    expect(stockAlerts(10, -1, 5)).toEqual({ lowStock: true, negativeStock: true });
    expect(stockAlerts(0, -1, 5)).toEqual({ lowStock: false, negativeStock: true });
    expect(stockAlerts(-1, -2, 5)).toEqual({ lowStock: false, negativeStock: false });
  });

  it('gère un seuil à zéro', () => {
    expect(stockAlerts(1, 0, 0)).toEqual({ lowStock: false, negativeStock: false });
    expect(stockAlerts(1, -1, 0)).toEqual({ lowStock: true, negativeStock: true });
  });

  it('refuse un seuil négatif', () => {
    expect(() => stockAlerts(10, 5, -1)).toThrow(DomainError);
  });
});

describe('effets d’une vente sur le stock', () => {
  const lines: PricedLineForStock[] = [
    {
      saleLineId: 'line-1',
      variantId: 'variant-1',
      stock: { dimension: 'length', value: cm(150) },
    },
    {
      saleLineId: 'line-2',
      variantId: 'variant-2',
      stock: null,
    },
    {
      saleLineId: 'line-3',
      variantId: 'variant-3',
      stock: { dimension: 'unit', value: units(3) },
    },
  ];

  it('retire les articles et ignore les prestations', () => {
    expect(stockEffectsForSale(lines)).toEqual([
      { saleLineId: 'line-1', variantId: 'variant-1', quantity: -150 },
      { saleLineId: 'line-3', variantId: 'variant-3', quantity: -3 },
    ]);
  });

  it('remet les quantités en stock lors d’une annulation', () => {
    expect(stockEffectsForCancellation(lines)).toEqual([
      { saleLineId: 'line-1', variantId: 'variant-1', quantity: 150 },
      { saleLineId: 'line-3', variantId: 'variant-3', quantity: 3 },
    ]);
  });
});

describe('valeur du stock', () => {
  it('convertit les prix au mètre et au yard vers les centimètres', () => {
    expect(
      stockValueXof([
        { quantity: 150, unitPriceXof: xof(5000), pricingUnit: 'metre' },
        { quantity: 90, unitPriceXof: xof(5000), pricingUnit: 'yard' },
        { quantity: 3, unitPriceXof: xof(150), pricingUnit: 'piece' },
      ]),
    ).toBe(12950);
  });

  it('refuse un prix d’achat négatif', () => {
    expect(() =>
      stockValueXof([{ quantity: 10, unitPriceXof: xof(-1), pricingUnit: 'piece' }]),
    ).toThrow(DomainError);
  });
});
