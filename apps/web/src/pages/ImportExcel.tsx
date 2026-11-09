import { useRef, useState, type DragEvent } from 'react';
import { CheckCircle2, Download, FileSpreadsheet, RefreshCw, Upload, XCircle } from 'lucide-react';
import {
  IMPORT_COLUMNS,
  IMPORT_TEMPLATE_HEADERS,
  IMPORT_TEMPLATE_ROWS,
  parseImportMatrix,
  validImportPayloads,
  type ImportParseResult,
  type ImportRowResult,
} from '@mercerie/core';
import type { SheetData } from 'write-excel-file/browser';
import { PageHeader } from '../ui/PageHeader';
import { useStock } from '../data/StockProvider';
import type { ImportSummary } from '../data/stock';

const TEMPLATE_FILE = 'modele-import-catalogue-mercerie-pdj.xlsx';

function displayUnit(row: ImportRowResult): string {
  switch (row.payload?.unite_vente) {
    case 'piece':
      return 'u.';
    case 'yard':
      return 'yd';
    case 'metre':
      return 'm';
    default:
      return '';
  }
}

async function readMatrix(file: File): Promise<readonly (readonly unknown[])[]> {
  const { readSheet } = await import('read-excel-file/browser');
  return readSheet(file);
}

async function downloadTemplate(): Promise<void> {
  const { default: writeXlsxFile } = await import('write-excel-file/browser');
  const header: SheetData[number] = IMPORT_COLUMNS.map((column) => ({
    value: IMPORT_TEMPLATE_HEADERS[column],
    fontWeight: 'bold' as const,
    textColor: '#FFFFFF',
    backgroundColor: '#16243C',
  }));
  const data: SheetData = [header, ...IMPORT_TEMPLATE_ROWS.map((row) => [...row])];

  await writeXlsxFile(data, {
    sheet: 'Catalogue',
    columns: IMPORT_COLUMNS.map(() => ({ width: 17 })),
  }).toFile(TEMPLATE_FILE);
}

export function ImportExcel() {
  const { importRows } = useStock();
  const inputRef = useRef<HTMLInputElement>(null);
  const [fileName, setFileName] = useState<string | null>(null);
  const [result, setResult] = useState<ImportParseResult | null>(null);
  const [summary, setSummary] = useState<ImportSummary | null>(null);
  const [busy, setBusy] = useState(false);
  const [dragging, setDragging] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const processFile = async (file: File) => {
    setBusy(true);
    setError(null);
    setNotice(null);
    setSummary(null);
    setResult(null);
    setFileName(file.name);

    try {
      if (!file.name.toLowerCase().endsWith('.xlsx')) {
        throw new Error('Choisis un fichier Excel au format .xlsx.');
      }
      const matrix = await readMatrix(file);
      setResult(parseImportMatrix(matrix));
    } catch (caught) {
      setError(
        caught instanceof Error
          ? caught.message
          : 'Le fichier n’a pas pu être lu. Vérifie le format.',
      );
    } finally {
      setBusy(false);
    }
  };

  const handleDrop = (event: DragEvent<HTMLElement>) => {
    event.preventDefault();
    setDragging(false);
    if (busy) {
      return;
    }
    const file = event.dataTransfer.files[0];
    if (file) {
      void processFile(file);
    }
  };

  const apply = async () => {
    if (!result) {
      return;
    }
    const payloads = validImportPayloads(result);
    if (payloads.length === 0) {
      return;
    }

    setBusy(true);
    setError(null);
    setNotice(null);
    try {
      const next = await importRows(fileName ?? 'catalogue.xlsx', payloads);
      setSummary(next);
      setNotice(
        next.statut === 'applied'
          ? `${next.success} ligne${next.success > 1 ? 's' : ''} importée${next.success > 1 ? 's' : ''}. Le catalogue est à jour.`
          : `${next.success} ligne${next.success > 1 ? 's' : ''} importée${next.success > 1 ? 's' : ''}, ${next.errors} rejetée${next.errors > 1 ? 's' : ''} par le serveur.`,
      );
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'L’import n’a pas abouti.');
    } finally {
      setBusy(false);
    }
  };

  const reset = () => {
    setResult(null);
    setSummary(null);
    setFileName(null);
    setError(null);
    setNotice(null);
    if (inputRef.current) {
      inputRef.current.value = '';
    }
  };

  return (
    <div className="page">
      <PageHeader
        eyebrow="Stock"
        title="Importer le catalogue Excel"
        description="Le fichier crée les catégories et les articles manquants, met à jour les prix et ajoute le stock initial. Les variantes existantes ne reçoivent jamais de stock en double."
        actions={
          <button
            type="button"
            className="button button-ghost"
            onClick={() => void downloadTemplate()}
          >
            <Download size={17} aria-hidden="true" />
            Télécharger le modèle
          </button>
        }
      />

      <section
        className={`panel import-drop${dragging ? ' is-dragging' : ''}`}
        onDragOver={(event) => {
          event.preventDefault();
          setDragging(true);
        }}
        onDragLeave={() => setDragging(false)}
        onDrop={handleDrop}
      >
        <span className="import-drop-icon" aria-hidden="true">
          <FileSpreadsheet size={30} strokeWidth={1.6} />
        </span>
        <h2>Dépose ton fichier .xlsx ici</h2>
        <p>
          Une ligne par couleur. Les colonnes obligatoires sont le code catégorie, la catégorie,
          l’article, la dimension, la couleur, le code court, l’unité de vente et le prix de vente.
        </p>
        <div className="import-drop-actions">
          <button
            type="button"
            className="button button-gold"
            onClick={() => inputRef.current?.click()}
            disabled={busy}
          >
            <Upload size={18} aria-hidden="true" />
            {busy ? 'Lecture du fichier…' : 'Choisir un fichier'}
          </button>
          <button
            type="button"
            className="button button-ghost"
            onClick={() => void downloadTemplate()}
          >
            <Download size={17} aria-hidden="true" />
            Modèle Excel
          </button>
        </div>
        <input
          ref={inputRef}
          className="visually-hidden"
          type="file"
          accept=".xlsx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
          onChange={(event) => {
            const file = event.target.files?.[0];
            if (file) {
              void processFile(file);
            }
            event.target.value = '';
          }}
        />
        {fileName && <p className="import-filename">Fichier choisi : {fileName}</p>}
      </section>

      {error && <p className="form-error">{error}</p>}
      {notice && <p className="form-notice">{notice}</p>}

      {result && (
        <>
          {result.headerErrors.length > 0 && (
            <section className="panel import-errors">
              <h2>Le fichier n’est pas au bon format</h2>
              <ul>
                {result.headerErrors.map((message) => (
                  <li key={message}>
                    <XCircle size={16} aria-hidden="true" />
                    {message}
                  </li>
                ))}
              </ul>
              <p>Télécharge le modèle puis conserve la première ligne de titres.</p>
            </section>
          )}

          {result.rows.length > 0 && (
            <section className="panel">
              <header className="panel-header">
                <div>
                  <h2>Aperçu avant import</h2>
                  <p>
                    {result.okCount} ligne{result.okCount > 1 ? 's' : ''} prête
                    {result.okCount > 1 ? 's' : ''}, {result.errorCount} à corriger.
                  </p>
                </div>
                <button type="button" className="text-button" onClick={reset} disabled={busy}>
                  <RefreshCw size={15} aria-hidden="true" />
                  Changer de fichier
                </button>
              </header>

              <ul className="import-list">
                <li className="import-row import-row-head" aria-hidden="true">
                  <span>Ligne</span>
                  <span>Article · couleur</span>
                  <span>Code</span>
                  <span>Prix de vente</span>
                  <span>Stock initial</span>
                  <span>État</span>
                </li>
                {result.rows.map((row) => (
                  <li
                    key={row.ligne}
                    className={`import-row${row.statut === 'error' ? ' is-error' : ''}`}
                  >
                    <span className="import-line">{row.ligne}</span>
                    <span className="import-identity">
                      <strong>{row.valeurs.article || '—'}</strong>
                      <small>{row.valeurs.couleur || '—'}</small>
                      {row.erreur && <span className="import-row-error">{row.erreur}</span>}
                    </span>
                    <span className="import-code">{row.valeurs.code_court || '—'}</span>
                    <span>
                      {row.valeurs.prix_vente_xof ? `${row.valeurs.prix_vente_xof} F` : '—'}
                    </span>
                    <span>
                      {row.valeurs.stock_initial
                        ? `${row.valeurs.stock_initial} ${displayUnit(row)}`.trim()
                        : '0'}
                    </span>
                    <span>
                      {row.statut === 'ok' ? (
                        <span className="status-pill status-ok">
                          <CheckCircle2 size={12} aria-hidden="true" /> Prête
                        </span>
                      ) : (
                        <span className="status-pill status-rupture">
                          <XCircle size={12} aria-hidden="true" /> Erreur
                        </span>
                      )}
                    </span>
                  </li>
                ))}
              </ul>

              <div className="import-footer">
                <button
                  type="button"
                  className="button button-gold"
                  onClick={() => void apply()}
                  disabled={busy || result.okCount === 0 || summary !== null}
                >
                  <Upload size={18} aria-hidden="true" />
                  {busy
                    ? 'Import en cours…'
                    : `Importer ${result.okCount} ligne${result.okCount > 1 ? 's' : ''}`}
                </button>
                {result.errorCount > 0 && (
                  <p className="form-hint">
                    Les lignes en erreur restent dans le fichier : corrige-les puis relance
                    l’import. Les lignes valides peuvent déjà être importées.
                  </p>
                )}
              </div>
            </section>
          )}
        </>
      )}

      <section className="panel import-help">
        <header className="panel-header">
          <div>
            <h2>Comment remplir le fichier</h2>
            <p>Une ligne = un article dans une couleur.</p>
          </div>
        </header>
        <ul className="import-help-list">
          <li>
            <strong>Dimension</strong> : <code>longueur</code> pour un tissu, <code>unite</code>{' '}
            pour un article vendu à la pièce.
          </li>
          <li>
            <strong>Unité de vente</strong> : <code>metre</code>, <code>yard</code> (1 yard = 90 cm)
            ou <code>piece</code>.
          </li>
          <li>
            <strong>Seuil et stock initial</strong> : exprimés dans l’unité de vente, convertis au
            centimètre pour les tissus.
          </li>
          <li>
            <strong>Variante déjà connue</strong> : les prix, le seuil et la couleur sont mis à
            jour, mais le stock initial n’est pas rajouté.
          </li>
          <li>
            <strong>Prix d’achat</strong> : facultatif, réservé à l’usage interne des
            administrateurs.
          </li>
        </ul>
      </section>
    </div>
  );
}
