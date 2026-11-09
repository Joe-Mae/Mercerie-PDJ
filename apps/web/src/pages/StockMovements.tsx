import { useEffect, useMemo, useState } from 'react';
import {
  ArrowDownLeft,
  ArrowUpRight,
  ClipboardList,
  RefreshCw,
  Scale,
  ShieldAlert,
} from 'lucide-react';
import { PageHeader } from '../ui/PageHeader';
import { useStock } from '../data/StockProvider';
import {
  formatQuantity,
  toCanonicalQuantity,
  unitLabel,
  type MovementKind,
  type MovementType,
  type StockItem,
  type StockSaleUnit,
} from '../data/stock';

const MOVEMENT_LABELS: Readonly<Record<MovementType, string>> = {
  reception: 'Entrée',
  loss: 'Perte',
  adjustment: 'Correction',
  sale: 'Vente',
  sale_cancel: 'Annulation',
  inventory: 'Inventaire',
};

const KIND_HELP: Readonly<Record<MovementKind, { readonly label: string; readonly hint: string }>> =
  {
    reception: {
      label: 'Entrée',
      hint: 'Livraison, retour ou stock initial. La quantité s’ajoute au stock.',
    },
    loss: {
      label: 'Perte',
      hint: 'Article abîmé, vol ou casse. La quantité est retirée et un motif est obligatoire.',
    },
    adjustment: {
      label: 'Correction',
      hint: 'Écart après comptage. Saisis + pour ajouter, - pour retirer. Motif obligatoire.',
    },
  };

function parseSignedQuantity(raw: string, unit: StockSaleUnit): number {
  const trimmed = raw.trim();
  if (!trimmed) {
    throw new Error('Saisis une quantité.');
  }

  const negative = trimmed.startsWith('-');
  const magnitude = trimmed.replace(/^[+-]/, '');
  const canonical = toCanonicalQuantity(magnitude, unit, { allowZero: false });
  return negative ? -canonical : canonical;
}

function formatDate(value: string): string {
  const date = new Date(value);
  return `${date.toLocaleDateString('fr-FR')} · ${date.toLocaleTimeString('fr-FR', {
    hour: '2-digit',
    minute: '2-digit',
  })}`;
}

function formatSignedQuantity(quantity: number, item: StockItem): string {
  const formatted = formatQuantity(quantity, item);
  if (quantity > 0) {
    return `+ ${formatted}`;
  }
  return formatted.startsWith('-') ? `− ${formatted.slice(1)}` : formatted;
}

export function StockMovements() {
  const { items, movements, movementError, refreshMovements, recordMovement } = useStock();
  const [variantId, setVariantId] = useState('');
  const [kind, setKind] = useState<MovementKind>('reception');
  const [quantity, setQuantity] = useState('');
  const [reason, setReason] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  useEffect(() => {
    void refreshMovements();
  }, [refreshMovements]);

  const sortedItems = useMemo(
    () =>
      [...items].sort(
        (left, right) =>
          left.article.localeCompare(right.article, 'fr') ||
          left.color.localeCompare(right.color, 'fr'),
      ),
    [items],
  );
  const itemById = useMemo(() => new Map(items.map((item) => [item.id, item])), [items]);
  const selected = variantId ? (itemById.get(variantId) ?? null) : null;

  let preview: number | null = null;
  if (selected && quantity.trim()) {
    try {
      const magnitude = parseSignedQuantity(quantity, selected.saleUnit);
      const signed =
        kind === 'reception'
          ? Math.abs(magnitude)
          : kind === 'loss'
            ? -Math.abs(magnitude)
            : magnitude;
      preview = selected.quantity + signed;
    } catch {
      preview = null;
    }
  }

  const submit = async () => {
    setBusy(true);
    setError(null);
    setNotice(null);
    try {
      if (!selected) {
        throw new Error('Choisis l’article et la couleur.');
      }
      const magnitude = parseSignedQuantity(quantity, selected.saleUnit);
      if ((kind === 'loss' || kind === 'adjustment') && reason.trim().length < 3) {
        throw new Error('Le motif est obligatoire pour une perte ou une correction.');
      }

      const signed =
        kind === 'reception'
          ? Math.abs(magnitude)
          : kind === 'loss'
            ? -Math.abs(magnitude)
            : magnitude;

      const nextQuantity = await recordMovement({
        variantId: selected.id,
        type: kind,
        quantity: signed,
        reason: reason.trim() || (kind === 'reception' ? 'Réception de stock' : ''),
      });

      setNotice(
        `${MOVEMENT_LABELS[kind]} enregistrée pour ${selected.article} — ${selected.color}. Stock après opération : ${formatQuantity(nextQuantity, selected)}.`,
      );
      setQuantity('');
      setReason('');
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Le mouvement n’a pas été enregistré.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="page">
      <PageHeader
        eyebrow="Stock"
        title="Mouvements de stock"
        description="Chaque quantité entre ou sort par un mouvement daté et signé. Le stock n’est jamais écrasé."
        actions={
          <button
            type="button"
            className="button button-ghost"
            onClick={() => void refreshMovements()}
          >
            <RefreshCw size={17} aria-hidden="true" />
            Actualiser
          </button>
        }
      />

      <div className="movement-grid">
        <section className="panel movement-form-panel">
          <header className="panel-header">
            <div>
              <h2>Enregistrer un mouvement</h2>
              <p>Choisis l’article, le type et la quantité.</p>
            </div>
          </header>

          <div className="form-grid">
            <label className="field field-full">
              <span>Article et couleur</span>
              <select value={variantId} onChange={(event) => setVariantId(event.target.value)}>
                <option value="">Sélectionner…</option>
                {sortedItems.map((item) => (
                  <option key={item.id} value={item.id}>
                    {item.article} — {item.color} ({item.code})
                  </option>
                ))}
              </select>
            </label>

            <div className="field field-full">
              <span>Type de mouvement</span>
              <div className="segmented segmented-wrap" role="group" aria-label="Type de mouvement">
                {(Object.keys(KIND_HELP) as MovementKind[]).map((value) => (
                  <button
                    key={value}
                    type="button"
                    className={kind === value ? 'is-active' : undefined}
                    onClick={() => setKind(value)}
                    aria-pressed={kind === value}
                  >
                    {KIND_HELP[value].label}
                  </button>
                ))}
              </div>
              <small>{KIND_HELP[kind].hint}</small>
            </div>

            <label className="field">
              <span>Quantité ({selected ? unitLabel(selected.saleUnit) : 'unité'})</span>
              <input
                value={quantity}
                onChange={(event) => setQuantity(event.target.value)}
                inputMode="decimal"
                placeholder={kind === 'adjustment' ? '-2,5 ou +3' : '5'}
              />
            </label>
            <label className="field">
              <span>Motif {kind === 'reception' ? '(facultatif)' : '(obligatoire)'}</span>
              <input
                value={reason}
                onChange={(event) => setReason(event.target.value)}
                placeholder={
                  kind === 'reception'
                    ? 'Ex. Livraison Grossiste Lomé'
                    : kind === 'loss'
                      ? 'Ex. Bobines abîmées'
                      : 'Ex. Écart après comptage'
                }
                maxLength={200}
              />
            </label>
          </div>

          {preview !== null && selected && (
            <p className="movement-preview">
              Stock actuel {formatQuantity(selected.quantity, selected)} → après opération{' '}
              <strong>{formatQuantity(preview, selected)}</strong>
            </p>
          )}

          {error && <p className="form-error">{error}</p>}
          {notice && <p className="form-notice">{notice}</p>}

          <div className="movement-form-footer">
            <button
              type="button"
              className="button button-gold"
              onClick={() => void submit()}
              disabled={busy || !selected}
            >
              <Scale size={18} aria-hidden="true" />
              {busy ? 'Enregistrement…' : 'Enregistrer le mouvement'}
            </button>
          </div>
        </section>

        <section className="panel movement-rules">
          <header className="panel-header">
            <div>
              <h2>Règles du journal</h2>
              <p>Pour éviter les erreurs et les pertes invisibles.</p>
            </div>
          </header>
          <ul className="rule-list">
            <li>
              <span className="rule-icon tone-green">
                <ArrowDownLeft size={18} aria-hidden="true" />
              </span>
              <div>
                <strong>Une entrée ajoute</strong>
                <p>Réception de marchandise, retour client ou stock initial.</p>
              </div>
            </li>
            <li>
              <span className="rule-icon tone-red">
                <ArrowUpRight size={18} aria-hidden="true" />
              </span>
              <div>
                <strong>Une perte retire</strong>
                <p>Chaque sortie hors vente exige un motif écrit.</p>
              </div>
            </li>
            <li>
              <span className="rule-icon tone-blue">
                <ClipboardList size={18} aria-hidden="true" />
              </span>
              <div>
                <strong>Une correction laisse une trace</strong>
                <p>Une erreur se corrige par un mouvement inverse, jamais par une suppression.</p>
              </div>
            </li>
          </ul>
          <p className="rule-warning">
            <ShieldAlert size={16} aria-hidden="true" />
            Seul un administrateur connecté peut enregistrer un mouvement.
          </p>
        </section>
      </div>

      <section className="panel">
        <header className="panel-header">
          <div>
            <h2>Journal récent</h2>
            <p>Les 80 derniers mouvements de la boutique.</p>
          </div>
        </header>

        {movementError && <p className="form-error">{movementError}</p>}

        {movements.length === 0 ? (
          <div className="empty-state">
            <span className="empty-icon">
              <ClipboardList size={22} aria-hidden="true" />
            </span>
            <strong>Aucun mouvement enregistré</strong>
            <p>La première réception ou correction apparaîtra ici.</p>
          </div>
        ) : (
          <ul className="movement-list">
            {movements.map((movement) => {
              const item = itemById.get(movement.variantId);
              const positive = movement.quantity > 0;
              return (
                <li key={movement.id} className="movement-row">
                  <span
                    className={`movement-icon ${positive ? 'tone-green' : 'tone-red'}`}
                    aria-hidden="true"
                  >
                    {positive ? <ArrowDownLeft size={17} /> : <ArrowUpRight size={17} />}
                  </span>
                  <div className="movement-body">
                    <strong>
                      {item ? `${item.article} — ${item.color}` : 'Variante inconnue'}
                      <span className="movement-type">{MOVEMENT_LABELS[movement.type]}</span>
                    </strong>
                    <span>
                      {formatDate(movement.occurredAt)}
                      {movement.reason ? ` · ${movement.reason}` : ''}
                    </span>
                  </div>
                  <span className={`movement-quantity ${positive ? 'is-in' : 'is-out'}`}>
                    {item ? formatSignedQuantity(movement.quantity, item) : movement.quantity}
                  </span>
                  <span className="movement-author">{movement.createdBy ?? 'Auteur inconnu'}</span>
                </li>
              );
            })}
          </ul>
        )}
      </section>
    </div>
  );
}
