import { DomainError } from './errors';
import { assertNonNegativeXof, roundHalfUp, xof, type Xof } from './money';
import type { PricingUnit } from './pricing';
import { CM_PER_METRE, CM_PER_YARD, type StockQuantity } from './units';

export type MovementType =
  'reception' | 'sale' | 'sale_cancel' | 'loss' | 'inventory' | 'adjustment';

export interface StockMovement {
  readonly id: string;
  readonly variantId: string;
  readonly type: MovementType;
  readonly quantity: number;
  readonly reason?: string;
  readonly saleLineId?: string;
}

export interface SaleStockEffect {
  readonly saleLineId: string;
  readonly variantId: string;
  readonly quantity: number;
}

export interface PricedLineForStock {
  readonly saleLineId: string;
  readonly variantId: string;
  readonly stock: StockQuantity | null;
}

export interface StockAlerts {
  readonly lowStock: boolean;
  readonly negativeStock: boolean;
}

export interface StockValueLine {
  readonly quantity: number;
  readonly unitPriceXof: Xof;
  readonly pricingUnit: PricingUnit;
}

function assertIdentifier(value: string, label: string): void {
  if (!value.trim()) {
    throw new DomainError(`${label} est obligatoire.`);
  }
}

function assertQuantityIntegrity(value: number): void {
  if (!Number.isSafeInteger(value) || value === 0) {
    throw new DomainError('La quantité du mouvement doit être un entier non nul.');
  }
}

function requireReason(movement: StockMovement): void {
  if (!movement.reason?.trim()) {
    throw new DomainError('Un motif est obligatoire pour ce mouvement de stock.');
  }
}

function requireSaleLine(movement: StockMovement): void {
  if (!movement.saleLineId?.trim()) {
    throw new DomainError('Un mouvement de vente doit être rattaché à une ligne de vente.');
  }
}

export function validateMovement(movement: StockMovement): void {
  assertIdentifier(movement.id, 'L’identifiant du mouvement');
  assertIdentifier(movement.variantId, 'La variante');
  assertQuantityIntegrity(movement.quantity);

  switch (movement.type) {
    case 'reception':
      if (movement.quantity <= 0) {
        throw new DomainError('Une réception doit ajouter une quantité positive.');
      }
      return;
    case 'sale':
      if (movement.quantity >= 0) {
        throw new DomainError('Une vente doit retirer une quantité positive.');
      }
      requireSaleLine(movement);
      return;
    case 'sale_cancel':
      if (movement.quantity <= 0) {
        throw new DomainError('Une annulation doit remettre la quantité vendue en stock.');
      }
      requireSaleLine(movement);
      return;
    case 'loss':
      if (movement.quantity >= 0) {
        throw new DomainError('Une perte doit retirer une quantité positive.');
      }
      requireReason(movement);
      return;
    case 'inventory':
      requireReason(movement);
      return;
    case 'adjustment':
      requireReason(movement);
      return;
  }
}

function applyQuantities(initial: number, deltas: readonly number[]): number {
  if (!Number.isSafeInteger(initial)) {
    throw new DomainError('Le stock initial doit être un entier.');
  }

  let total = initial;

  for (const delta of deltas) {
    if (!Number.isSafeInteger(delta)) {
      throw new DomainError('Une quantité de stock doit être un entier.');
    }

    total += delta;

    if (!Number.isSafeInteger(total)) {
      throw new DomainError('Le stock dépasse la capacité de calcul.');
    }
  }

  return total;
}

export function projectStock(movements: readonly StockMovement[], initial = 0): number {
  return applyQuantities(
    initial,
    movements.map((movement) => movement.quantity),
  );
}

export function projectStockWithPending(
  baseline: number,
  pendingDeltas: readonly number[],
): number {
  return applyQuantities(baseline, pendingDeltas);
}

export function isLowStock(quantity: number, threshold: number): boolean {
  if (!Number.isSafeInteger(quantity)) {
    throw new DomainError('Le stock doit être un entier.');
  }

  if (!Number.isSafeInteger(threshold) || threshold < 0) {
    throw new DomainError('Le seuil d’alerte doit être un entier positif ou nul.');
  }

  return quantity < threshold;
}

export function stockValueXof(lines: readonly StockValueLine[]): Xof {
  let total = 0n;

  for (const line of lines) {
    if (!Number.isSafeInteger(line.quantity)) {
      throw new DomainError('Le stock doit être un entier.');
    }
    assertNonNegativeXof(line.unitPriceXof, 'Le prix d’achat');

    const divisor =
      line.pricingUnit === 'metre'
        ? BigInt(CM_PER_METRE)
        : line.pricingUnit === 'yard'
          ? BigInt(CM_PER_YARD)
          : 1n;

    total += roundHalfUp(BigInt(line.quantity) * BigInt(line.unitPriceXof), divisor);
  }

  if (total > BigInt(Number.MAX_SAFE_INTEGER) || total < BigInt(Number.MIN_SAFE_INTEGER)) {
    throw new DomainError('La valeur du stock dépasse la capacité de calcul.');
  }

  return xof(Number(total));
}

export function stockAlerts(previous: number, next: number, threshold: number): StockAlerts {
  if (!Number.isSafeInteger(previous) || !Number.isSafeInteger(next)) {
    throw new DomainError('Le stock doit être un entier.');
  }

  if (!Number.isSafeInteger(threshold) || threshold < 0) {
    throw new DomainError('Le seuil d’alerte doit être un entier positif ou nul.');
  }

  return {
    lowStock: previous >= threshold && next < threshold,
    negativeStock: previous >= 0 && next < 0,
  };
}

export function stockEffectsForSale(lines: readonly PricedLineForStock[]): SaleStockEffect[] {
  return lines.flatMap((line) => {
    if (!line.stock) {
      return [];
    }

    return [
      {
        saleLineId: line.saleLineId,
        variantId: line.variantId,
        quantity: -line.stock.value,
      },
    ];
  });
}

export function stockEffectsForCancellation(
  lines: readonly PricedLineForStock[],
): SaleStockEffect[] {
  return stockEffectsForSale(lines).map((effect) => ({
    ...effect,
    quantity: Math.abs(effect.quantity),
  }));
}
