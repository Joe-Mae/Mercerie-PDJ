import { DomainError } from './errors';
import { assertSafeInteger, roundHalfUp } from './money';

export type Cm = number & { readonly __brand: 'Cm' };
export type Units = number & { readonly __brand: 'Units' };
export type LengthUnit = 'm' | 'cm' | 'yard';
export type InputUnit = LengthUnit | 'piece';

export type StockQuantity =
  | { readonly dimension: 'length'; readonly value: Cm }
  | { readonly dimension: 'unit'; readonly value: Units };

export const CM_PER_METRE = 100;
export const CM_PER_YARD = 90;

export interface DecimalValue {
  readonly numerator: bigint;
  readonly denominator: bigint;
}

export function cm(value: number): Cm {
  assertSafeInteger(value, 'La longueur');
  return value as Cm;
}

export function units(value: number): Units {
  assertSafeInteger(value, 'La quantité');
  return value as Units;
}

export function parseDecimal(input: string | number): DecimalValue {
  const raw = (typeof input === 'number' ? String(input) : input).trim();

  if (!/^[+-]?\d+(?:[.,]\d+)?$/.test(raw)) {
    throw new DomainError('Saisis un nombre valide, par exemple 1,5.');
  }

  const normalized = raw.replace(',', '.');
  const negative = normalized.startsWith('-');
  const unsigned = normalized.replace(/^[+-]/, '');
  const [wholePart = '0', fractionPart = ''] = unsigned.split('.');
  const denominator = 10n ** BigInt(fractionPart.length);
  const numerator = BigInt(wholePart) * denominator + BigInt(fractionPart || '0');

  return {
    numerator: negative ? -numerator : numerator,
    denominator,
  };
}

export function centimetresPerUnit(unit: LengthUnit): number {
  switch (unit) {
    case 'm':
      return CM_PER_METRE;
    case 'cm':
      return 1;
    case 'yard':
      return CM_PER_YARD;
  }
}

export function toCentimeters(input: string | number, unit: LengthUnit): Cm {
  const decimal = parseDecimal(input);

  if (decimal.numerator <= 0n) {
    throw new DomainError('La longueur doit être supérieure à zéro.');
  }

  const factor = BigInt(centimetresPerUnit(unit));
  const rounded = roundHalfUp(decimal.numerator * factor, decimal.denominator);

  if (rounded <= 0n) {
    throw new DomainError('La longueur est trop petite pour être enregistrée.');
  }

  return cm(Number(rounded));
}

export function parseUnits(input: string | number): Units {
  const decimal = parseDecimal(input);

  if (decimal.numerator <= 0n) {
    throw new DomainError('La quantité doit être supérieure à zéro.');
  }

  if (decimal.numerator % decimal.denominator !== 0n) {
    throw new DomainError('La quantité doit être un nombre entier d’unités.');
  }

  return units(Number(decimal.numerator / decimal.denominator));
}

export function toStockQuantity(input: string | number, inputUnit: InputUnit): StockQuantity {
  if (inputUnit === 'piece') {
    return { dimension: 'unit', value: parseUnits(input) };
  }

  return { dimension: 'length', value: toCentimeters(input, inputUnit) };
}

export function lengthInUnit(value: Cm, unit: LengthUnit): number {
  return value / centimetresPerUnit(unit);
}

export function formatLength(value: Cm, unit: LengthUnit): string {
  const fractionDigits = unit === 'cm' ? 0 : 2;
  const formatter = new Intl.NumberFormat('fr-FR', {
    minimumFractionDigits: fractionDigits,
    maximumFractionDigits: fractionDigits,
  });
  const suffix = unit === 'yard' ? 'yd' : unit;

  return `${formatter.format(lengthInUnit(value, unit))}\u00A0${suffix}`;
}
