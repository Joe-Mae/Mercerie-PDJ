import { describe, expect, it } from 'vitest';
import { DomainError } from './errors';
import {
  centimetresPerUnit,
  cm,
  formatLength,
  lengthInUnit,
  parseUnits,
  toCentimeters,
  toStockQuantity,
  units,
} from './units';

function normalizeSpaces(value: string): string {
  return value.replace(/[\u00A0\u202F]/g, ' ');
}

describe('unités de longueur', () => {
  it('applique la règle PDJ de 1 yard = 90 cm', () => {
    expect(centimetresPerUnit('yard')).toBe(90);
    expect(toCentimeters('1', 'yard')).toBe(90);
    expect(toCentimeters('0,5', 'yard')).toBe(45);
    expect(toCentimeters('2.5', 'yard')).toBe(225);
  });

  it('convertit les mètres et les centimètres', () => {
    expect(toCentimeters('1,5', 'm')).toBe(150);
    expect(toCentimeters('45,5', 'cm')).toBe(46);
  });

  it('arrondit les longueurs au centimètre le plus proche', () => {
    expect(toCentimeters('1,25', 'yard')).toBe(113);
    expect(toCentimeters('1,249', 'yard')).toBe(112);
  });

  it('refuse les longueurs nulles, négatives ou trop petites', () => {
    expect(() => toCentimeters('0', 'm')).toThrow(DomainError);
    expect(() => toCentimeters('-1', 'm')).toThrow(DomainError);
    expect(() => toCentimeters('0,001', 'cm')).toThrow(DomainError);
  });

  it('refuse les saisies non numériques', () => {
    expect(() => toCentimeters('abc', 'm')).toThrow(DomainError);
    expect(() => toCentimeters('1e3', 'm')).toThrow(DomainError);
  });

  it('accepte uniquement des unités entières pour les articles à l’unité', () => {
    expect(parseUnits('3')).toBe(3);
    expect(parseUnits('3,0')).toBe(3);
    expect(() => parseUnits('3,5')).toThrow(DomainError);
    expect(() => parseUnits('0')).toThrow(DomainError);
    expect(() => parseUnits('-2')).toThrow(DomainError);
  });

  it('produit la quantité canonique attendue', () => {
    expect(toStockQuantity('1,5', 'm')).toEqual({ dimension: 'length', value: 150 });
    expect(toStockQuantity('3', 'piece')).toEqual({ dimension: 'unit', value: 3 });
  });

  it('refuse les quantités canoniques non entières', () => {
    expect(() => cm(1.2)).toThrow(DomainError);
    expect(() => units(2.5)).toThrow(DomainError);
  });
});

describe('affichage des longueurs', () => {
  it('affiche en mètres, centimètres et yards', () => {
    expect(normalizeSpaces(formatLength(cm(150), 'm'))).toBe('1,50 m');
    expect(normalizeSpaces(formatLength(cm(150), 'cm'))).toBe('150 cm');
    expect(normalizeSpaces(formatLength(cm(150), 'yard'))).toBe('1,67 yd');
  });

  it('affiche les yards avec deux décimales', () => {
    expect(normalizeSpaces(formatLength(cm(90), 'yard'))).toBe('1,00 yd');
    expect(normalizeSpaces(formatLength(cm(45), 'yard'))).toBe('0,50 yd');
    expect(normalizeSpaces(formatLength(cm(135), 'yard'))).toBe('1,50 yd');
  });

  it('convertit une longueur pour l’affichage', () => {
    expect(lengthInUnit(cm(135), 'm')).toBe(1.35);
    expect(lengthInUnit(cm(135), 'yard')).toBe(1.5);
  });
});
