import { DomainError } from './errors';
import { roundHalfUp } from './money';
import { parseDecimal } from './units';

export type ImportDimension = 'length' | 'unit';
export type ImportSaleUnit = 'metre' | 'yard' | 'piece';

export const IMPORT_COLUMNS = [
  'categorie_code',
  'categorie',
  'article',
  'description',
  'dimension',
  'couleur',
  'code_court',
  'unite_vente',
  'prix_vente_xof',
  'prix_achat_xof',
  'seuil',
  'stock_initial',
] as const;

export type ImportColumn = (typeof IMPORT_COLUMNS)[number];

export const IMPORT_TEMPLATE_HEADERS: Readonly<Record<ImportColumn, string>> = {
  categorie_code: 'Code catégorie',
  categorie: 'Catégorie',
  article: 'Article',
  description: 'Description',
  dimension: 'Dimension',
  couleur: 'Couleur',
  code_court: 'Code court',
  unite_vente: 'Unité de vente',
  prix_vente_xof: 'Prix de vente',
  prix_achat_xof: 'Prix d’achat',
  seuil: 'Seuil d’alerte',
  stock_initial: 'Stock initial',
};

export const IMPORT_TEMPLATE_ROWS: readonly (readonly (string | number)[])[] = [
  [
    'TIS',
    'Tissus',
    'Bazin riche',
    'Bazin de qualité supérieure',
    'longueur',
    'Blanc',
    'BAZ-BL',
    'metre',
    5000,
    3400,
    3,
    10,
  ],
  ['TIS', 'Tissus', 'Wax Hollandais', '', 'longueur', 'Jaune', 'WAX-JA', 'yard', 4500, 3000, 2, 6],
  [
    'FIL',
    'Fils',
    'Fil polyester',
    'Bobine de 100 m',
    'unite',
    'Noir',
    'FIL-NO',
    'piece',
    500,
    280,
    12,
    24,
  ],
];

export interface ImportPayloadRow {
  readonly ligne: number;
  readonly categorie_code: string;
  readonly categorie: string;
  readonly article: string;
  readonly description: string | null;
  readonly dimension: ImportDimension;
  readonly couleur: string;
  readonly code_court: string;
  readonly unite_vente: ImportSaleUnit;
  readonly prix_vente_xof: number;
  readonly prix_achat_xof: number | null;
  readonly seuil_alerte: number;
  readonly quantite_initiale: number;
}

export interface ImportRowResult {
  readonly ligne: number;
  readonly statut: 'ok' | 'error';
  readonly erreur: string | null;
  readonly valeurs: Readonly<Record<ImportColumn, string>>;
  readonly payload: ImportPayloadRow | null;
}

export interface ImportParseResult {
  readonly headerErrors: readonly string[];
  readonly rows: readonly ImportRowResult[];
  readonly okCount: number;
  readonly errorCount: number;
}

const HEADER_ALIASES: Readonly<Record<ImportColumn, readonly string[]>> = {
  categorie_code: ['categorie_code', 'code_categorie', 'code_cat'],
  categorie: ['categorie', 'category'],
  article: ['article', 'nom_article', 'designation'],
  description: ['description', 'details'],
  dimension: ['dimension', 'type', 'mesure'],
  couleur: ['couleur', 'color'],
  code_court: ['code_court', 'code', 'reference'],
  unite_vente: ['unite_vente', 'unite', 'unite_de_vente', 'unit'],
  prix_vente_xof: ['prix_vente_xof', 'prix_vente', 'prix_de_vente', 'prix'],
  prix_achat_xof: ['prix_achat_xof', 'prix_achat', 'prix_d_achat', 'cout_achat', 'cout'],
  seuil: ['seuil', 'seuil_alerte', 'seuil_d_alerte', 'alerte'],
  stock_initial: ['stock_initial', 'stock', 'quantite_initiale'],
};

const REQUIRED_COLUMNS: readonly ImportColumn[] = [
  'categorie_code',
  'categorie',
  'article',
  'dimension',
  'couleur',
  'code_court',
  'unite_vente',
  'prix_vente_xof',
];

const EMPTY_VALUES: Readonly<Record<ImportColumn, string>> = Object.freeze(
  Object.fromEntries(IMPORT_COLUMNS.map((column) => [column, ''])) as Record<ImportColumn, string>,
);

export function normalizeHeader(input: unknown): string {
  return String(input ?? '')
    .replace(/^\uFEFF/, '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '');
}

function resolveHeader(input: unknown): ImportColumn | null {
  const normalized = normalizeHeader(input);
  if (!normalized) {
    return null;
  }

  for (const column of IMPORT_COLUMNS) {
    if (HEADER_ALIASES[column].includes(normalized)) {
      return column;
    }
  }

  return null;
}

function text(value: unknown): string {
  return value === null || value === undefined ? '' : String(value).trim();
}

function parsePrice(value: unknown, label: string, optional: boolean): number | null {
  const raw = text(value);
  if (raw === '') {
    if (optional) {
      return null;
    }
    throw new DomainError(`${label} est obligatoire.`);
  }

  const normalized = raw.replace(/[\s\u00A0\u202F]/g, '').replace(/(fcf a|fcfa|xof)/gi, '');
  if (!/^\d+$/.test(normalized)) {
    throw new DomainError(`${label} doit être un montant entier en francs CFA.`);
  }

  const parsed = Number(normalized);
  if (!Number.isSafeInteger(parsed)) {
    throw new DomainError(`${label} est trop grand.`);
  }

  return parsed;
}

function parseCanonicalQuantity(
  value: unknown,
  unit: ImportSaleUnit,
  label: string,
  allowZero: boolean,
): number {
  const raw = text(value);
  if (raw === '') {
    if (allowZero) {
      return 0;
    }
    throw new DomainError(`${label} est obligatoire.`);
  }

  const decimal = parseDecimal(raw);
  if (decimal.numerator < 0n) {
    throw new DomainError(`${label} ne peut pas être négatif.`);
  }

  let canonical: bigint;

  if (unit === 'piece') {
    if (decimal.numerator % decimal.denominator !== 0n) {
      throw new DomainError(`${label} doit être un nombre entier d’unités.`);
    }
    canonical = decimal.numerator / decimal.denominator;
  } else {
    const factor = unit === 'metre' ? 100n : 90n;
    canonical = roundHalfUp(decimal.numerator * factor, decimal.denominator);
  }

  if (canonical === 0n && !allowZero) {
    throw new DomainError(`${label} est trop petite pour être enregistrée.`);
  }
  if (canonical > BigInt(Number.MAX_SAFE_INTEGER)) {
    throw new DomainError(`${label} est trop grand.`);
  }

  return Number(canonical);
}

function parseDimension(value: unknown): ImportDimension {
  const normalized = normalizeHeader(value);
  if (['longueur', 'length', 'tissu', 'metre', 'm'].includes(normalized)) {
    return 'length';
  }
  if (['unite', 'unit', 'piece', 'pièce'].includes(normalized)) {
    return 'unit';
  }
  throw new DomainError('Dimension invalide : utilise « longueur » ou « unite ».');
}

function parseSaleUnit(value: unknown): ImportSaleUnit {
  const normalized = normalizeHeader(value);
  if (['metre', 'm'].includes(normalized)) {
    return 'metre';
  }
  if (['yard', 'yd'].includes(normalized)) {
    return 'yard';
  }
  if (['piece', 'unite', 'unit'].includes(normalized)) {
    return 'piece';
  }
  throw new DomainError('Unité de vente invalide : utilise « metre », « yard » ou « piece ».');
}

function parseRow(cells: Readonly<Record<ImportColumn, string>>, line: number): ImportPayloadRow {
  const categorieCode = text(cells.categorie_code).toUpperCase();
  const categorie = text(cells.categorie);
  const article = text(cells.article);
  const description = text(cells.description) || null;
  const couleur = text(cells.couleur);
  const codeCourt = text(cells.code_court).toUpperCase();

  if (!categorieCode) {
    throw new DomainError('Le code catégorie est obligatoire.');
  }
  if (!categorie) {
    throw new DomainError('Le nom de la catégorie est obligatoire.');
  }
  if (!article) {
    throw new DomainError('Le nom de l’article est obligatoire.');
  }
  if (!couleur) {
    throw new DomainError('La couleur est obligatoire.');
  }
  if (!codeCourt) {
    throw new DomainError('Le code court est obligatoire.');
  }

  const dimension = parseDimension(cells.dimension);
  const uniteVente = parseSaleUnit(cells.unite_vente);

  if (
    (dimension === 'length' && uniteVente === 'piece') ||
    (dimension === 'unit' && uniteVente !== 'piece')
  ) {
    throw new DomainError('L’unité de vente ne correspond pas à la dimension.');
  }

  const prixVente = parsePrice(cells.prix_vente_xof, 'Le prix de vente', false);
  const prixAchat = parsePrice(cells.prix_achat_xof, 'Le prix d’achat', true);

  return {
    ligne: line,
    categorie_code: categorieCode,
    categorie,
    article,
    description,
    dimension,
    couleur,
    code_court: codeCourt,
    unite_vente: uniteVente,
    prix_vente_xof: prixVente ?? 0,
    prix_achat_xof: prixAchat,
    seuil_alerte: parseCanonicalQuantity(cells.seuil, uniteVente, 'Le seuil d’alerte', true),
    quantite_initiale: parseCanonicalQuantity(
      cells.stock_initial,
      uniteVente,
      'Le stock initial',
      true,
    ),
  };
}

export function parseImportMatrix(matrix: readonly (readonly unknown[])[]): ImportParseResult {
  const filledRows = matrix
    .map((row, index) => ({ row, line: index + 1 }))
    .filter((entry) => entry.row.some((cell) => text(cell) !== ''));

  if (filledRows.length === 0) {
    return {
      headerErrors: ['Le fichier est vide.'],
      rows: [],
      okCount: 0,
      errorCount: 0,
    };
  }

  const headerRow = filledRows[0]?.row ?? [];
  const indexes = new Map<ImportColumn, number>();

  headerRow.forEach((cell, index) => {
    const column = resolveHeader(cell);
    if (column && !indexes.has(column)) {
      indexes.set(column, index);
    }
  });

  const headerErrors = REQUIRED_COLUMNS.filter((column) => !indexes.has(column)).map(
    (column) => `Colonne manquante : « ${IMPORT_TEMPLATE_HEADERS[column]} ».`,
  );

  if (headerErrors.length > 0) {
    return { headerErrors, rows: [], okCount: 0, errorCount: 0 };
  }

  const seenCodes = new Set<string>();
  const rows: ImportRowResult[] = [];
  let okCount = 0;
  let errorCount = 0;

  filledRows.slice(1).forEach(({ row: sourceRow, line }) => {
    const values = { ...EMPTY_VALUES } as Record<ImportColumn, string>;

    for (const column of IMPORT_COLUMNS) {
      const cellIndex = indexes.get(column);
      values[column] = cellIndex === undefined ? '' : text(sourceRow[cellIndex]);
    }

    let payload: ImportPayloadRow | null = null;
    let erreur: string | null = null;
    let valid = false;

    try {
      const parsed = parseRow(values, line);
      const codeKey = parsed.code_court.toLowerCase();
      if (seenCodes.has(codeKey)) {
        throw new DomainError(
          `Le code court « ${parsed.code_court} » apparaît plusieurs fois dans le fichier.`,
        );
      }
      seenCodes.add(codeKey);
      payload = parsed;
      valid = true;
      okCount += 1;
    } catch (error) {
      erreur =
        error instanceof DomainError ? error.message : 'Ligne illisible. Vérifie les valeurs.';
      errorCount += 1;
    }

    rows.push({
      ligne: line,
      statut: valid ? 'ok' : 'error',
      erreur,
      valeurs: values,
      payload: valid ? payload : null,
    });
  });

  return { headerErrors, rows, okCount, errorCount };
}

export function validImportPayloads(result: ImportParseResult): ImportPayloadRow[] {
  return result.rows.flatMap((row) => (row.payload ? [row.payload] : []));
}
