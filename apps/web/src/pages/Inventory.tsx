import { useMemo, useState } from 'react';
import { AlertTriangle, Boxes, Search, ShieldAlert } from 'lucide-react';
import type { ProfileSnapshot } from '../types';
import { useStock } from '../data/StockProvider';
import {
  formatStock,
  formatThreshold,
  isLowStock,
  stockStatus,
  type StockItem,
} from '../data/stock';
import { money } from '../lib/format';
import { PageHeader } from '../ui/PageHeader';

interface InventoryProps {
  readonly profile: ProfileSnapshot;
  readonly demo: boolean;
}

export function Inventory({ profile, demo }: InventoryProps) {
  const { items, loading, error } = useStock();
  const [query, setQuery] = useState('');
  const [category, setCategory] = useState('Toutes');

  const activeItems = useMemo(() => items.filter((item) => item.active), [items]);
  const categoryNames = useMemo(
    () => ['Toutes', ...new Set(activeItems.map((item) => item.category))],
    [activeItems],
  );

  const filtered = useMemo(() => {
    const normalized = query.trim().toLowerCase();

    return activeItems.filter((item) => {
      const matchesCategory = category === 'Toutes' || item.category === category;
      const matchesQuery =
        normalized.length === 0 ||
        [item.article, item.color, item.code, item.category].some((value) =>
          value.toLowerCase().includes(normalized),
        );

      return matchesCategory && matchesQuery;
    });
  }, [activeItems, category, query]);

  const alerts = activeItems.filter(isLowStock).length;
  const ruptures = activeItems.filter((item) => item.quantity <= 0).length;

  return (
    <div className="page">
      <PageHeader
        eyebrow="Inventaire"
        title="Le stock de la boutique"
        description={
          demo
            ? 'Chaque couleur est suivie séparément, au centimètre pour les tissus et à l’unité pour la mercerie.'
            : 'Quantités, seuils et prix sont chargés depuis la boutique. Les prix d’achat restent réservés aux administrateurs.'
        }
      />

      <section className="inventory-summary">
        <div className="summary-chip">
          <Boxes size={18} aria-hidden="true" />
          <div>
            <strong>{activeItems.length}</strong>
            <span>variantes suivies</span>
          </div>
        </div>
        <div className="summary-chip">
          <AlertTriangle size={18} aria-hidden="true" />
          <div>
            <strong>{alerts}</strong>
            <span>sous le seuil</span>
          </div>
        </div>
        <div className="summary-chip">
          <ShieldAlert size={18} aria-hidden="true" />
          <div>
            <strong>{ruptures}</strong>
            <span>en rupture</span>
          </div>
        </div>
      </section>

      {error && <p className="form-error">{error}</p>}

      <section className="panel inventory-panel">
        <header className="inventory-toolbar">
          <label className="search-field">
            <Search size={18} aria-hidden="true" />
            <input
              type="search"
              placeholder="Rechercher un article, une couleur, un code…"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              autoComplete="off"
            />
          </label>
          <div className="segmented segmented-wrap" role="group" aria-label="Filtrer par catégorie">
            {categoryNames.map((value) => (
              <button
                key={value}
                type="button"
                className={category === value ? 'is-active' : undefined}
                onClick={() => setCategory(value)}
                aria-pressed={category === value}
              >
                {value}
              </button>
            ))}
          </div>
        </header>

        {loading ? (
          <p className="catalog-loading">Chargement du stock…</p>
        ) : filtered.length > 0 ? (
          <>
            <div className="stock-table stock-table-head" aria-hidden="true">
              <span>Article</span>
              <span>Code</span>
              <span>Stock</span>
              <span>Seuil</span>
              <span>Prix</span>
              <span>État</span>
            </div>
            <ul className="stock-table">
              {filtered.map((item) => (
                <StockRow key={item.id} item={item} profile={profile} />
              ))}
            </ul>
          </>
        ) : (
          <div className="empty-state empty-state-wide">
            <span className="empty-icon">
              <Boxes size={24} strokeWidth={1.7} aria-hidden="true" />
            </span>
            <strong>
              {activeItems.length === 0 ? 'Aucun article chargé' : 'Aucun article ne correspond'}
            </strong>
            <p>
              {activeItems.length === 0
                ? profile.role === 'admin'
                  ? 'Crée un article ou importe ton fichier Excel depuis la section Catalogue.'
                  : 'Les articles apparaîtront ici dès que la direction les aura créés.'
                : 'Essaie une autre recherche ou change de catégorie.'}
            </p>
          </div>
        )}
      </section>

      <p className="footnote">
        Le stock est un registre de mouvements : aucune quantité n’est écrasée. Toute sortie hors
        vente exige un motif.
      </p>
    </div>
  );
}

function StockRow({
  item,
  profile,
}: {
  readonly item: StockItem;
  readonly profile: ProfileSnapshot;
}) {
  const status = stockStatus(item);
  const statusLabel = status === 'rupture' ? 'Rupture' : status === 'faible' ? 'Faible' : 'OK';

  return (
    <li className={`stock-row stock-${status}`}>
      <div className="stock-identity">
        <span
          className={`stock-swatch swatch-${item.dimension === 'length' ? 'fabric' : 'haberdashery'}`}
          aria-hidden="true"
        />
        <div>
          <strong>{item.article}</strong>
          <span>
            {item.color} · {item.category}
          </span>
        </div>
      </div>
      <span className="stock-code">{item.code}</span>
      <span className="stock-quantity">{formatStock(item)}</span>
      <span className="stock-threshold">{formatThreshold(item)}</span>
      <span className="stock-price">
        {money(item.salePrice)}
        {profile.role === 'admin' && item.purchasePrice !== null && (
          <small>achat {money(item.purchasePrice)}</small>
        )}
      </span>
      <span className={`status-pill status-${status}`}>{statusLabel}</span>
    </li>
  );
}
