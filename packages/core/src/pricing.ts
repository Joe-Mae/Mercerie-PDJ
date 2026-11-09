import { DomainError } from './errors';
import {
  assertNonNegativeXof,
  formatXof,
  roundHalfUp,
  subtractXof,
  sumXof,
  xof,
  type Xof,
} from './money';
import {
  cm,
  CM_PER_METRE,
  CM_PER_YARD,
  parseDecimal,
  parseUnits,
  units,
  type InputUnit,
  type LengthUnit,
  type StockQuantity,
} from './units';

export type LineKind = 'article' | 'service';
export type PricingUnit = 'metre' | 'yard' | 'piece';
export type PaymentMethod = 'cash' | 'tmoney' | 'flooz';

export interface Rational {
  readonly numerator: bigint;
  readonly denominator: bigint;
}

export interface LineInput {
  readonly kind: LineKind;
  readonly quantity: string;
  readonly inputUnit: InputUnit;
  readonly pricingUnit: PricingUnit;
  readonly unitPriceXof: Xof;
}

export interface LineComputation {
  readonly totalXof: Xof;
  readonly stock: StockQuantity | null;
  readonly quantityInPricingUnit: Rational;
}

export interface PaymentInput {
  readonly method: PaymentMethod;
  readonly amountXof: Xof;
  readonly reference?: string;
}

export interface SaleTotals {
  readonly subtotalXof: Xof;
  readonly discountXof: Xof;
  readonly totalXof: Xof;
}

function assertLengthInput(unit: InputUnit): asserts unit is LengthUnit {
  if (unit === 'piece') {
    throw new DomainError('Un tissu se vend au mètre, au centimètre ou au yard.');
  }
}

function assertPieceInput(unit: InputUnit): void {
  if (unit !== 'piece') {
    throw new DomainError('La quantité doit être saisie à l’unité.');
  }
}

function computeLengthLine(input: LineInput, pricingUnit: 'metre' | 'yard'): LineComputation {
  assertLengthInput(input.inputUnit);

  const decimal = parseDecimal(input.quantity);

  if (decimal.numerator <= 0n) {
    throw new DomainError('La quantité doit être supérieure à zéro.');
  }

  const centimetresPerInputUnit = BigInt(
    input.inputUnit === 'm' ? CM_PER_METRE : input.inputUnit === 'cm' ? 1 : CM_PER_YARD,
  );
  const centimetresPerPricingUnit = BigInt(pricingUnit === 'metre' ? CM_PER_METRE : CM_PER_YARD);
  const centimetresNumerator = decimal.numerator * centimetresPerInputUnit;
  const stockCentimetres = roundHalfUp(centimetresNumerator, decimal.denominator);

  if (stockCentimetres <= 0n) {
    throw new DomainError('La quantité est trop petite pour être enregistrée.');
  }

  const totalNumerator = centimetresNumerator * BigInt(input.unitPriceXof);
  const totalDenominator = decimal.denominator * centimetresPerPricingUnit;
  const total = xof(Number(roundHalfUp(totalNumerator, totalDenominator)));

  return {
    totalXof: total,
    stock: { dimension: 'length', value: cm(Number(stockCentimetres)) },
    quantityInPricingUnit: {
      numerator: centimetresNumerator,
      denominator: totalDenominator,
    },
  };
}

function computePieceLine(input: LineInput): LineComputation {
  assertPieceInput(input.inputUnit);

  const quantity = parseUnits(input.quantity);
  const total = xof(quantity * input.unitPriceXof);

  return {
    totalXof: total,
    stock: input.kind === 'service' ? null : { dimension: 'unit', value: units(quantity) },
    quantityInPricingUnit: { numerator: BigInt(quantity), denominator: 1n },
  };
}

export function computeLine(input: LineInput): LineComputation {
  assertNonNegativeXof(input.unitPriceXof, 'Le prix unitaire');

  if (input.kind === 'service' && input.pricingUnit !== 'piece') {
    throw new DomainError('Une prestation se facture au forfait, à l’unité.');
  }

  if (input.pricingUnit === 'piece') {
    return computePieceLine(input);
  }

  return computeLengthLine(input, input.pricingUnit);
}

export function computeSaleTotals(
  lineTotals: readonly Xof[],
  discountXof: Xof = xof(0),
): SaleTotals {
  assertNonNegativeXof(discountXof, 'La remise');

  const subtotalXof = sumXof(lineTotals);

  if (discountXof > subtotalXof) {
    throw new DomainError('La remise ne peut pas dépasser le sous-total.');
  }

  return {
    subtotalXof,
    discountXof,
    totalXof: subtractXof(subtotalXof, discountXof),
  };
}

export function validatePayments(totalXof: Xof, payments: readonly PaymentInput[]): Xof {
  assertNonNegativeXof(totalXof, 'Le total de la vente');

  if (payments.length === 0) {
    throw new DomainError('Une vente doit avoir au moins un paiement.');
  }

  for (const payment of payments) {
    if (payment.amountXof <= 0) {
      throw new DomainError('Chaque paiement doit être supérieur à zéro.');
    }

    if (payment.method !== 'cash' && !payment.reference?.trim()) {
      throw new DomainError(
        'Le numéro de référence Mobile Money est obligatoire pour T-Money et Flooz.',
      );
    }
  }

  const paidXof = sumXof(payments.map((payment) => payment.amountXof));

  if (paidXof !== totalXof) {
    throw new DomainError(
      `La somme des paiements (${formatXof(paidXof)}) doit être égale au total (${formatXof(totalXof)}).`,
    );
  }

  return paidXof;
}

export function computeCashChange(tenderedXof: Xof, dueXof: Xof): Xof {
  assertNonNegativeXof(tenderedXof, 'Le montant reçu');
  assertNonNegativeXof(dueXof, 'Le montant à payer');

  if (tenderedXof < dueXof) {
    throw new DomainError('Le montant reçu est inférieur au montant à payer.');
  }

  return subtractXof(tenderedXof, dueXof);
}
