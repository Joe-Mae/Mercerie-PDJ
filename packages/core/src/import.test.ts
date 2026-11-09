import { describe, expect, it } from 'vitest';
import {
  IMPORT_TEMPLATE_HEADERS,
  IMPORT_TEMPLATE_ROWS,
  parseImportMatrix,
  validImportPayloads,
} from './import';

const HEADERS = [
  IMPORT_TEMPLATE_HEADERS.categorie_code,
  IMPORT_TEMPLATE_HEADERS.categorie,
  IMPORT_TEMPLATE_HEADERS.article,
  IMPORT_TEMPLATE_HEADERS.description,
  IMPORT_TEMPLATE_HEADERS.dimension,
  IMPORT_TEMPLATE_HEADERS.couleur,
  IMPORT_TEMPLATE_HEADERS.code_court,
  IMPORT_TEMPLATE_HEADERS.unite_vente,
  IMPORT_TEMPLATE_HEADERS.prix_vente_xof,
  IMPORT_TEMPLATE_HEADERS.prix_achat_xof,
  IMPORT_TEMPLATE_HEADERS.seuil,
  IMPORT_TEMPLATE_HEADERS.stock_initial,
];

function row(overrides: Partial<Record<number, string | number>> = {}): (string | number)[] {
  const base: (string | number)[] = [
    'TIS',
    'Tissus',
    'Bazin riche',
    'Bazin de qualité',
    'longueur',
    'Blanc',
    'BAZ-BL',
    'metre',
    5000,
    3400,
    3,
    10,
  ];
  return base.map((value, index) => overrides[index] ?? value);
}

describe('analyse du fichier d’import', () => {
  it('convertit les quantités au mètre et au yard en centimètres', () => {
    const result = parseImportMatrix([
      HEADERS,
      row(),
      row({ 5: 'Jaune', 6: 'WAX-JA', 7: 'yard', 10: 2, 11: 6 }),
      row({ 4: 'unite', 5: 'Noir', 6: 'FIL-NO', 7: 'piece', 8: 500, 9: 280, 10: 12, 11: 24 }),
    ]);

    expect(result.headerErrors).toEqual([]);
    expect(result.okCount).toBe(3);
    expect(result.rows.map((entry) => entry.payload?.quantite_initiale)).toEqual([1000, 540, 24]);
    expect(result.rows.map((entry) => entry.payload?.seuil_alerte)).toEqual([300, 180, 12]);
    expect(result.rows[2]?.payload?.dimension).toBe('unit');
    expect(validImportPayloads(result)).toHaveLength(3);
  });

  it('accepte un seuil et un stock vides comme zéro', () => {
    const result = parseImportMatrix([HEADERS, row({ 10: '', 11: '' })]);

    expect(result.errorCount).toBe(0);
    expect(result.rows[0]?.payload?.seuil_alerte).toBe(0);
    expect(result.rows[0]?.payload?.quantite_initiale).toBe(0);
  });

  it('signale les colonnes manquantes', () => {
    const result = parseImportMatrix([
      ['Code catégorie', 'Catégorie', 'Article', 'Couleur'],
      ['TIS', 'Tissus', 'Bazin', 'Blanc'],
    ]);

    expect(result.rows).toEqual([]);
    expect(result.headerErrors.length).toBe(4);
    expect(result.headerErrors.join(' ')).toMatch(/Dimension/);
    expect(result.headerErrors.join(' ')).toMatch(/Prix de vente/);
  });

  it('refuse les prix décimaux ou négatifs', () => {
    const decimal = parseImportMatrix([HEADERS, row({ 8: '5 000,5' })]);
    const negative = parseImportMatrix([HEADERS, row({ 8: -1 })]);

    expect(decimal.rows[0]?.erreur).toMatch(/montant entier/);
    expect(negative.rows[0]?.erreur).toMatch(/montant entier/);
  });

  it('refuse une unité incompatible avec la dimension', () => {
    const result = parseImportMatrix([HEADERS, row({ 7: 'piece' })]);

    expect(result.errorCount).toBe(1);
    expect(result.rows[0]?.erreur).toMatch(/ne correspond pas/);
  });

  it('refuse une quantité décimale pour une pièce', () => {
    const result = parseImportMatrix([
      HEADERS,
      row({ 4: 'unite', 6: 'FIL-NO', 7: 'piece', 10: 2.5, 11: 5 }),
    ]);

    expect(result.rows[0]?.erreur).toMatch(/entier d’unités/);
  });

  it('signale un code court présent deux fois dans le fichier', () => {
    const result = parseImportMatrix([HEADERS, row(), row({ 5: 'Bleu' })]);

    expect(result.okCount).toBe(1);
    expect(result.errorCount).toBe(1);
    expect(result.rows[1]?.erreur).toMatch(/apparaît plusieurs fois/);
    expect(result.rows[1]?.payload).toBeNull();
  });

  it('ignore les lignes vides sans décaler les numéros de ligne', () => {
    const result = parseImportMatrix([HEADERS, [], row(), ['', '', '']]);

    expect(result.rows).toHaveLength(1);
    expect(result.rows[0]?.ligne).toBe(3);
  });

  it('fournit un modèle exemple entièrement valide', () => {
    const result = parseImportMatrix([HEADERS, ...IMPORT_TEMPLATE_ROWS]);

    expect(result.headerErrors).toEqual([]);
    expect(result.errorCount).toBe(0);
    expect(result.okCount).toBe(IMPORT_TEMPLATE_ROWS.length);
  });
});
