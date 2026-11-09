import { describe, expect, it } from 'vitest';
import { DomainError } from './errors';
import { formatXof, roundHalfUp, sumXof, toXofFromInput, xof } from './money';

function normalizeSpaces(value: string): string {
  return value.replace(/[\u00A0\u202F]/g, ' ');
}

describe('argent XOF', () => {
  it('n’accepte que des entiers sûrs', () => {
    expect(() => xof(1.5)).toThrow(DomainError);
    expect(() => xof(Number.NaN)).toThrow(DomainError);
    expect(() => xof(Number.MAX_SAFE_INTEGER + 1)).toThrow(DomainError);
  });

  it('additionne des montants entiers', () => {
    expect(sumXof([xof(7500), xof(2500)])).toBe(10000);
    expect(sumXof([])).toBe(0);
  });

  it('arrondit au plus proche, les demis vers le haut', () => {
    expect(roundHalfUp(1n, 2n)).toBe(1n);
    expect(roundHalfUp(3n, 2n)).toBe(2n);
    expect(roundHalfUp(5n, 2n)).toBe(3n);
    expect(roundHalfUp(-5n, 2n)).toBe(-3n);
    expect(roundHalfUp(750000n, 90n)).toBe(8333n);
  });

  it('refuse un dénominateur nul ou négatif', () => {
    expect(() => roundHalfUp(1n, 0n)).toThrow(DomainError);
    expect(() => roundHalfUp(1n, -1n)).toThrow(DomainError);
  });

  it('lit un montant saisi avec des espaces', () => {
    expect(toXofFromInput('7 500')).toBe(7500);
    expect(toXofFromInput('5\u00A0000')).toBe(5000);
    expect(toXofFromInput('0')).toBe(0);
  });

  it('refuse les montants décimaux, négatifs ou invalides', () => {
    expect(() => toXofFromInput('7500,5')).toThrow(DomainError);
    expect(() => toXofFromInput('-1')).toThrow(DomainError);
    expect(() => toXofFromInput('12abc')).toThrow(DomainError);
    expect(() => toXofFromInput('')).toThrow(DomainError);
  });

  it('formate les montants en français', () => {
    expect(normalizeSpaces(formatXof(xof(7500)))).toBe('7 500 F CFA');
    expect(normalizeSpaces(formatXof(xof(-500)))).toBe('-500 F CFA');
  });
});
