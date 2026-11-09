import { DomainError } from '@mercerie/core';

export type StockDimension = 'length' | 'unit';
export type StockSaleUnit = 'metre' | 'yard' | 'piece';
export type MovementKind = 'reception' | 'loss' | 'adjustment';
export type MovementType = MovementKind | 'sale' | 'sale_cancel' | 'inventory';

export interface StockItem {
  readonly id: string;
  readonly articleId: string;
  readonly article: string;
  readonly description: string | null;
  readonly categoryId: string;
  readonly category: string;
  readonly categoryCode: string;
  readonly color: string;
  readonly code: string;
  readonly dimension: StockDimension;
  readonly saleUnit: StockSaleUnit;
  readonly salePrice: number;
  readonly purchasePrice: number | null;
  readonly threshold: number;
  readonly quantity: number;
  readonly active: boolean;
}

export interface StockCategory {
  readonly id: string;
  readonly nom: string;
  readonly codeCourt: string;
  readonly actif: boolean;
}

export interface StockMovementView {
  readonly id: string;
  readonly variantId: string;
  readonly type: MovementType;
  readonly quantity: number;
  readonly reason: string | null;
  readonly occurredAt: string;
  readonly createdBy: string | null;
}

export interface PriceHistoryEntry {
  readonly id: number;
  readonly oldSalePrice: number | null;
  readonly newSalePrice: number | null;
  readonly oldPurchasePrice: number | null;
  readonly newPurchasePrice: number | null;
  readonly changedAt: string;
  readonly changedBy: string | null;
}

export interface ImportSummary {
  readonly importId: string | null;
  readonly total: number;
  readonly success: number;
  readonly errors: number;
  readonly statut: 'applied' | 'partial' | 'failed';
}

export interface NewCategoryInput {
  readonly nom: string;
  readonly codeCourt: string;
}

export interface NewArticleInput {
  readonly categorieId: string;
  readonly nom: string;
  readonly description: string;
  readonly dimension: StockDimension;
  readonly couleur: string;
  readonly codeCourt: string;
  readonly uniteVente: StockSaleUnit;
  readonly prixVenteXof: number;
  readonly prixAchatXof: number | null;
  readonly seuilAlerte: number;
  readonly quantiteInitiale: number;
}

export interface NewVariantInput {
  readonly articleId: string;
  readonly couleur: string;
  readonly codeCourt: string;
  readonly uniteVente: StockSaleUnit;
  readonly prixVenteXof: number;
  readonly prixAchatXof: number | null;
  readonly seuilAlerte: number;
  readonly quantiteInitiale: number;
}

export interface UpdateArticleInput {
  readonly id: string;
  readonly categorieId: string;
  readonly nom: string;
  readonly description: string;
  readonly actif: boolean;
}

export interface UpdateVariantInput {
  readonly id: string;
  readonly couleur: string;
  readonly codeCourt: string;
  readonly prixVenteXof: number;
  readonly prixAchatXof: number | null;
  readonly seuilAlerte: number;
  readonly actif: boolean;
}

export interface RecordMovementInput {
  readonly id?: string;
  readonly variantId: string;
  readonly type: MovementKind;
  readonly quantity: number;
  readonly reason: string;
}

export function isLowStock(item: StockItem): boolean {
  return item.threshold > 0 && item.quantity < item.threshold;
}

export function stockStatus(item: StockItem): 'rupture' | 'faible' | 'ok' {
  if (item.quantity <= 0) {
    return 'rupture';
  }
  return isLowStock(item) ? 'faible' : 'ok';
}

export function lowStockItems(items: readonly StockItem[]): StockItem[] {
  return items
    .filter((item) => item.active && isLowStock(item))
    .sort(
      (left, right) =>
        left.quantity / Math.max(left.threshold, 1) - right.quantity / Math.max(right.threshold, 1),
    );
}

export function quantityInSaleUnit(
  quantity: number,
  item: Pick<StockItem, 'dimension' | 'saleUnit'>,
): number {
  if (item.dimension === 'unit') {
    return quantity;
  }
  return quantity / (item.saleUnit === 'yard' ? 90 : 100);
}

export function formatQuantity(
  quantity: number,
  item: Pick<StockItem, 'dimension' | 'saleUnit'>,
): string {
  if (item.dimension === 'unit') {
    return `${quantity} u.`;
  }

  const value = quantityInSaleUnit(quantity, item);
  const formatter = new Intl.NumberFormat('fr-FR', { maximumFractionDigits: 2 });
  return `${formatter.format(value)} ${item.saleUnit === 'yard' ? 'yd' : 'm'}`;
}

export function formatStock(item: StockItem): string {
  return formatQuantity(item.quantity, item);
}

export function formatThreshold(item: StockItem): string {
  return formatQuantity(item.threshold, item);
}

export function unitLabel(unit: StockSaleUnit): string {
  return unit === 'yard' ? 'yard' : unit === 'metre' ? 'mètre' : 'pièce';
}

export function toCanonicalQuantity(
  input: string,
  unit: StockSaleUnit,
  options: { readonly allowZero: boolean },
): number {
  const raw = input.trim().replace(',', '.');
  if (raw === '') {
    if (options.allowZero) {
      return 0;
    }
    throw new DomainError('Saisis une quantité.');
  }
  if (options.allowZero && Number(raw) === 0) {
    return 0;
  }

  if (unit === 'piece') {
    const value = Number(raw);
    if (!Number.isSafeInteger(value) || value < 0) {
      throw new DomainError('Saisis un nombre entier de pièces.');
    }
    return value;
  }

  const value = Number(raw);
  if (!Number.isFinite(value) || value < 0) {
    throw new DomainError('Saisis une quantité valide.');
  }

  const centimetres = Math.round(value * (unit === 'yard' ? 90 : 100));
  if (centimetres <= 0 && !options.allowZero) {
    throw new DomainError('La quantité est trop petite pour être enregistrée.');
  }
  return centimetres;
}
