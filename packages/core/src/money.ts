import { DomainError } from './errors';

export type Xof = number & { readonly __brand: 'Xof' };

const XOF_FORMATTER = new Intl.NumberFormat('fr-FR', { maximumFractionDigits: 0 });

export function assertSafeInteger(value: number, label: string): void {
  if (!Number.isSafeInteger(value)) {
    throw new DomainError(`${label} doit être un nombre entier.`);
  }
}

export function xof(value: number): Xof {
  assertSafeInteger(value, 'Le montant');
  return value as Xof;
}

export function addXof(left: Xof, right: Xof): Xof {
  return xof(left + right);
}

export function subtractXof(left: Xof, right: Xof): Xof {
  return xof(left - right);
}

export function sumXof(values: readonly Xof[]): Xof {
  let total = 0;
  for (const value of values) {
    assertSafeInteger(value, 'Le montant');
    total += value;
  }
  return xof(total);
}

export function roundHalfUp(numerator: bigint, denominator: bigint): bigint {
  if (denominator <= 0n) {
    throw new DomainError('Le dénominateur doit être strictement positif.');
  }

  const negative = numerator < 0n;
  const absolute = negative ? -numerator : numerator;
  const rounded = (absolute * 2n + denominator) / (denominator * 2n);

  return negative ? -rounded : rounded;
}

export function toXofFromInput(input: string): Xof {
  const normalized = input.replace(/[\s\u00A0\u202F]/g, '');

  if (!/^\d+$/.test(normalized)) {
    throw new DomainError('Saisis un montant entier en francs CFA, sans virgule.');
  }

  const value = Number(normalized);

  if (!Number.isSafeInteger(value)) {
    throw new DomainError('Le montant est trop grand.');
  }

  return xof(value);
}

export function assertNonNegativeXof(value: Xof, label: string): void {
  if (value < 0) {
    throw new DomainError(`${label} ne peut pas être négatif.`);
  }
}

export function formatXof(value: Xof): string {
  return `${XOF_FORMATTER.format(value)}\u00A0F\u00A0CFA`;
}
