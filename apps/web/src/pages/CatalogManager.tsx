import { useEffect, useMemo, useState } from 'react';
import {
  AlertTriangle,
  Boxes,
  History,
  Layers,
  Pencil,
  Plus,
  Search,
  Tag,
  Upload,
} from 'lucide-react';
import { money } from '../lib/format';
import { useStock } from '../data/StockProvider';
import {
  formatStock,
  formatThreshold,
  isLowStock,
  quantityInSaleUnit,
  stockStatus,
  toCanonicalQuantity,
  unitLabel,
  type NewArticleInput,
  type NewVariantInput,
  type PriceHistoryEntry,
  type StockDimension,
  type StockItem,
  type StockSaleUnit,
  type UpdateVariantInput,
} from '../data/stock';
import { PageHeader } from '../ui/PageHeader';
import { Modal } from '../ui/Modal';

interface CatalogManagerProps {
  readonly onOpenImport: () => void;
}

type Dialog =
  | { readonly kind: 'new-article' }
  | { readonly kind: 'edit-article'; readonly item: StockItem }
  | { readonly kind: 'new-variant'; readonly item: StockItem }
  | { readonly kind: 'edit-variant'; readonly item: StockItem }
  | { readonly kind: 'history'; readonly item: StockItem };

function parseMoney(raw: string, label: string, optional: boolean): number | null {
  const normalized = raw.replace(/[\s\u00A0\u202F]/g, '');
  if (normalized === '') {
    if (optional) {
      return null;
    }
    throw new Error(`${label} est obligatoire.`);
  }
  if (!/^\d+$/.test(normalized)) {
    throw new Error(`${label} doit être un montant entier en francs CFA.`);
  }
  const value = Number(normalized);
  if (!Number.isSafeInteger(value)) {
    throw new Error(`${label} est trop grand.`);
  }
  return value;
}

function quantityInput(value: number, item: Pick<StockItem, 'dimension' | 'saleUnit'>): string {
  const converted = quantityInSaleUnit(value, item);
  return String(Math.round(converted * 100) / 100).replace('.', ',');
}

export function CatalogManager({ onOpenImport }: CatalogManagerProps) {
  const { items, categories, loading, error, createCategory } = useStock();
  const [query, setQuery] = useState('');
  const [categoryFilter, setCategoryFilter] = useState('Toutes');
  const [dialog, setDialog] = useState<Dialog | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const groups = useMemo(() => {
    const normalized = query.trim().toLowerCase();
    const filtered = items.filter((item) => {
      const matchesCategory = categoryFilter === 'Toutes' || item.category === categoryFilter;
      const matchesQuery =
        normalized.length === 0 ||
        [item.article, item.color, item.code, item.category].some((value) =>
          value.toLowerCase().includes(normalized),
        );
      return matchesCategory && matchesQuery;
    });

    const map = new Map<
      string,
      {
        articleId: string;
        article: string;
        description: string | null;
        category: string;
        active: boolean;
        variants: StockItem[];
      }
    >();

    for (const item of filtered) {
      const group = map.get(item.articleId) ?? {
        articleId: item.articleId,
        article: item.article,
        description: item.description,
        category: item.category,
        active: item.active,
        variants: [],
      };
      group.variants.push(item);
      map.set(item.articleId, group);
    }

    return [...map.values()].sort((left, right) => left.article.localeCompare(right.article, 'fr'));
  }, [categoryFilter, items, query]);

  const activeCount = items.filter((item) => item.active).length;
  const lowCount = items.filter((item) => item.active && isLowStock(item)).length;
  const categoryNames = ['Toutes', ...new Set(items.map((item) => item.category))];

  const handleCreated = (message: string) => {
    setDialog(null);
    setNotice(message);
  };

  return (
    <div className="page">
      <PageHeader
        eyebrow="Catalogue"
        title="Articles, couleurs et prix"
        description="Chaque couleur est une variante avec son propre stock, son seuil et son prix. Les changements de prix sont conservés dans l’historique."
        actions={
          <>
            <button type="button" className="button button-ghost" onClick={onOpenImport}>
              <Upload size={18} aria-hidden="true" />
              Importer Excel
            </button>
            <button
              type="button"
              className="button button-gold"
              onClick={() => setDialog({ kind: 'new-article' })}
            >
              <Plus size={18} aria-hidden="true" />
              Nouvel article
            </button>
          </>
        }
      />

      {notice && <p className="form-notice">{notice}</p>}
      {error && <p className="form-error">{error}</p>}

      <section className="inventory-summary">
        <div className="summary-chip">
          <Layers size={18} aria-hidden="true" />
          <div>
            <strong>{groups.length}</strong>
            <span>articles affichés</span>
          </div>
        </div>
        <div className="summary-chip">
          <Boxes size={18} aria-hidden="true" />
          <div>
            <strong>{activeCount}</strong>
            <span>variantes actives</span>
          </div>
        </div>
        <div className="summary-chip">
          <AlertTriangle size={18} aria-hidden="true" />
          <div>
            <strong>{lowCount}</strong>
            <span>sous le seuil</span>
          </div>
        </div>
        <div className="summary-chip">
          <Tag size={18} aria-hidden="true" />
          <div>
            <strong>{categories.length}</strong>
            <span>catégories</span>
          </div>
        </div>
      </section>

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
                className={categoryFilter === value ? 'is-active' : undefined}
                onClick={() => setCategoryFilter(value)}
                aria-pressed={categoryFilter === value}
              >
                {value}
              </button>
            ))}
          </div>
        </header>

        {loading ? (
          <p className="catalog-loading">Chargement du catalogue…</p>
        ) : groups.length === 0 ? (
          <div className="empty-state empty-state-wide">
            <span className="empty-icon">
              <Boxes size={24} strokeWidth={1.7} aria-hidden="true" />
            </span>
            <strong>
              {items.length === 0 ? 'Le catalogue est vide' : 'Aucun article ne correspond'}
            </strong>
            <p>
              {items.length === 0
                ? 'Crée un premier article ou importe ton fichier Excel pour commencer.'
                : 'Essaie une autre recherche ou change de catégorie.'}
            </p>
          </div>
        ) : (
          <div className="catalog-list">
            {groups.map((group) => (
              <article key={group.articleId} className="catalog-group">
                <header className="catalog-group-header">
                  <div>
                    <div className="catalog-title-line">
                      <strong>{group.article}</strong>
                      <span className="catalog-category">{group.category}</span>
                      {!group.active && <span className="status-pill status-rupture">Inactif</span>}
                    </div>
                    {group.description && <p>{group.description}</p>}
                  </div>
                  <div className="catalog-group-actions">
                    <button
                      type="button"
                      className="text-button"
                      onClick={() => setDialog({ kind: 'edit-article', item: group.variants[0]! })}
                    >
                      <Pencil size={15} aria-hidden="true" />
                      Article
                    </button>
                    <button
                      type="button"
                      className="text-button"
                      onClick={() => setDialog({ kind: 'new-variant', item: group.variants[0]! })}
                    >
                      <Plus size={15} aria-hidden="true" />
                      Couleur
                    </button>
                  </div>
                </header>

                <ul className="catalog-variants">
                  {group.variants.map((item) => (
                    <VariantRow
                      key={item.id}
                      item={item}
                      onEdit={() => setDialog({ kind: 'edit-variant', item })}
                      onHistory={() => setDialog({ kind: 'history', item })}
                    />
                  ))}
                </ul>
              </article>
            ))}
          </div>
        )}
      </section>

      <p className="footnote">
        Les prix d’achat et l’historique sont réservés aux administrateurs. Une erreur de stock se
        corrige par un mouvement motivé, jamais par une suppression.
      </p>

      {dialog?.kind === 'new-article' && (
        <ArticleDialog
          onClose={() => setDialog(null)}
          onCreateCategory={createCategory}
          onCreated={() => handleCreated('Article créé. Tu peux maintenant ajuster son stock.')}
        />
      )}
      {dialog?.kind === 'edit-article' && (
        <EditArticleDialog
          item={dialog.item}
          onClose={() => setDialog(null)}
          onSaved={() => handleCreated('Article mis à jour.')}
        />
      )}
      {dialog?.kind === 'new-variant' && (
        <NewVariantDialog
          article={dialog.item}
          onClose={() => setDialog(null)}
          onCreated={() => handleCreated('Nouvelle couleur ajoutée.')}
        />
      )}
      {dialog?.kind === 'edit-variant' && (
        <EditVariantDialog
          item={dialog.item}
          onClose={() => setDialog(null)}
          onSaved={() => handleCreated('Variante mise à jour.')}
        />
      )}
      {dialog?.kind === 'history' && (
        <HistoryDialog item={dialog.item} onClose={() => setDialog(null)} />
      )}
    </div>
  );
}

function VariantRow({
  item,
  onEdit,
  onHistory,
}: {
  readonly item: StockItem;
  readonly onEdit: () => void;
  readonly onHistory: () => void;
}) {
  const status = stockStatus(item);

  return (
    <li className={`catalog-variant${item.active ? '' : ' is-inactive'}`}>
      <div className="catalog-variant-main">
        <span className="stock-swatch swatch-fabric" aria-hidden="true" />
        <div>
          <strong>
            {item.color}
            {!item.active && <span className="catalog-inactive-tag">Inactif</span>}
          </strong>
          <span>
            {item.code} · {unitLabel(item.saleUnit)}
          </span>
        </div>
      </div>
      <div className="catalog-price">
        <strong>{money(item.salePrice)}</strong>
        <span>
          achat {item.purchasePrice === null ? 'non renseigné' : money(item.purchasePrice)}
        </span>
      </div>
      <div className="catalog-stock">
        <strong>{formatStock(item)}</strong>
        <span>seuil {formatThreshold(item)}</span>
      </div>
      <span className={`status-pill status-${status}`}>
        {status === 'rupture' ? 'Rupture' : status === 'faible' ? 'Faible' : 'OK'}
      </span>
      <div className="catalog-row-actions">
        <button type="button" className="icon-button" onClick={onEdit} aria-label="Modifier">
          <Pencil size={16} aria-hidden="true" />
        </button>
        <button
          type="button"
          className="icon-button"
          onClick={onHistory}
          aria-label="Historique des prix"
        >
          <History size={16} aria-hidden="true" />
        </button>
      </div>
    </li>
  );
}

function ArticleDialog({
  onClose,
  onCreateCategory,
  onCreated,
}: {
  readonly onClose: () => void;
  readonly onCreateCategory: (input: { nom: string; codeCourt: string }) => Promise<string>;
  readonly onCreated: () => void;
}) {
  const { categories, createArticle } = useStock();
  const [categoryId, setCategoryId] = useState(categories[0]?.id ?? '');
  const [nom, setNom] = useState('');
  const [description, setDescription] = useState('');
  const [dimension, setDimension] = useState<StockDimension>('length');
  const [color, setColor] = useState('');
  const [code, setCode] = useState('');
  const [saleUnit, setSaleUnit] = useState<StockSaleUnit>('metre');
  const [salePrice, setSalePrice] = useState('');
  const [purchasePrice, setPurchasePrice] = useState('');
  const [threshold, setThreshold] = useState('');
  const [initial, setInitial] = useState('');
  const [showCategoryForm, setShowCategoryForm] = useState(categories.length === 0);
  const [newCategoryName, setNewCategoryName] = useState('');
  const [newCategoryCode, setNewCategoryCode] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const changeDimension = (next: StockDimension) => {
    setDimension(next);
    setSaleUnit(next === 'length' ? 'metre' : 'piece');
  };

  const handleCategory = async () => {
    setBusy(true);
    setError(null);
    try {
      const id = await onCreateCategory({ nom: newCategoryName, codeCourt: newCategoryCode });
      setCategoryId(id);
      setNewCategoryName('');
      setNewCategoryCode('');
      setShowCategoryForm(false);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'La catégorie n’a pas été créée.');
    } finally {
      setBusy(false);
    }
  };

  const submit = async () => {
    setBusy(true);
    setError(null);
    try {
      if (!categoryId) {
        throw new Error('Choisis une catégorie.');
      }
      const input: NewArticleInput = {
        categorieId: categoryId,
        nom,
        description,
        dimension,
        couleur: color,
        codeCourt: code,
        uniteVente: saleUnit,
        prixVenteXof: parseMoney(salePrice, 'Le prix de vente', false) ?? 0,
        prixAchatXof: parseMoney(purchasePrice, 'Le prix d’achat', true),
        seuilAlerte: toCanonicalQuantity(threshold, saleUnit, { allowZero: true }),
        quantiteInitiale: toCanonicalQuantity(initial, saleUnit, { allowZero: true }),
      };
      await createArticle(input);
      onCreated();
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'L’article n’a pas été créé.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal
      title="Nouvel article"
      subtitle="L’article regroupe plusieurs couleurs, chacune avec son stock."
      onClose={onClose}
      wide
      footer={
        <>
          <button type="button" className="button button-ghost" onClick={onClose} disabled={busy}>
            Annuler
          </button>
          <button type="button" className="button button-gold" onClick={submit} disabled={busy}>
            {busy ? 'Enregistrement…' : 'Créer l’article'}
          </button>
        </>
      }
    >
      <div className="form-grid">
        <label className="field">
          <span>Catégorie</span>
          <select value={categoryId} onChange={(event) => setCategoryId(event.target.value)}>
            {categories.length === 0 && <option value="">Aucune catégorie</option>}
            {categories.map((category) => (
              <option key={category.id} value={category.id}>
                {category.nom} ({category.codeCourt})
              </option>
            ))}
          </select>
        </label>
        <div className="field field-inline-action">
          <span>Catégorie absente ?</span>
          <button
            type="button"
            className="text-button"
            onClick={() => setShowCategoryForm((value) => !value)}
          >
            <Plus size={15} aria-hidden="true" />
            Créer une catégorie
          </button>
        </div>

        {showCategoryForm && (
          <div className="inline-form">
            <label className="field">
              <span>Nom de la catégorie</span>
              <input
                value={newCategoryName}
                onChange={(event) => setNewCategoryName(event.target.value)}
                placeholder="Ex. Mercerie"
              />
            </label>
            <label className="field">
              <span>Code court</span>
              <input
                value={newCategoryCode}
                onChange={(event) => setNewCategoryCode(event.target.value.toUpperCase())}
                placeholder="MER"
                maxLength={20}
              />
            </label>
            <button
              type="button"
              className="button button-ghost"
              onClick={handleCategory}
              disabled={busy || !newCategoryName.trim() || !newCategoryCode.trim()}
            >
              Créer la catégorie
            </button>
          </div>
        )}

        <label className="field">
          <span>Nom de l’article</span>
          <input
            value={nom}
            onChange={(event) => setNom(event.target.value)}
            placeholder="Ex. Bazin riche"
            maxLength={120}
          />
        </label>
        <label className="field">
          <span>Description (facultatif)</span>
          <input
            value={description}
            onChange={(event) => setDescription(event.target.value)}
            placeholder="Précision utile pour l’équipe"
          />
        </label>

        <label className="field">
          <span>Type de stock</span>
          <select
            value={dimension}
            onChange={(event) => changeDimension(event.target.value as StockDimension)}
          >
            <option value="length">Tissu vendu au mètre ou au yard</option>
            <option value="unit">Article vendu à l’unité</option>
          </select>
        </label>
        <label className="field">
          <span>Unité de vente</span>
          <select
            value={saleUnit}
            onChange={(event) => setSaleUnit(event.target.value as StockSaleUnit)}
          >
            {dimension === 'length' ? (
              <>
                <option value="metre">Mètre</option>
                <option value="yard">Yard (90 cm)</option>
              </>
            ) : (
              <option value="piece">Pièce</option>
            )}
          </select>
        </label>

        <label className="field">
          <span>Couleur</span>
          <input
            value={color}
            onChange={(event) => setColor(event.target.value)}
            placeholder="Ex. Blanc"
            maxLength={60}
          />
        </label>
        <label className="field">
          <span>Code court</span>
          <input
            value={code}
            onChange={(event) => setCode(event.target.value.toUpperCase())}
            placeholder="BAZ-BL"
            maxLength={30}
          />
        </label>

        <label className="field">
          <span>Prix de vente (F CFA)</span>
          <input
            value={salePrice}
            onChange={(event) => setSalePrice(event.target.value)}
            inputMode="numeric"
            placeholder="5000"
          />
        </label>
        <label className="field">
          <span>Prix d’achat (F CFA, facultatif)</span>
          <input
            value={purchasePrice}
            onChange={(event) => setPurchasePrice(event.target.value)}
            inputMode="numeric"
            placeholder="3400"
          />
        </label>

        <label className="field">
          <span>Seuil d’alerte ({unitLabel(saleUnit)})</span>
          <input
            value={threshold}
            onChange={(event) => setThreshold(event.target.value)}
            inputMode="decimal"
            placeholder="3"
          />
          <small>Une alerte apparaît sous ce niveau.</small>
        </label>
        <label className="field">
          <span>Stock initial ({unitLabel(saleUnit)})</span>
          <input
            value={initial}
            onChange={(event) => setInitial(event.target.value)}
            inputMode="decimal"
            placeholder="10"
          />
          <small>Crée un mouvement de réception « Stock initial ».</small>
        </label>
      </div>

      {error && <p className="form-error">{error}</p>}
    </Modal>
  );
}

function EditArticleDialog({
  item,
  onClose,
  onSaved,
}: {
  readonly item: StockItem;
  readonly onClose: () => void;
  readonly onSaved: () => void;
}) {
  const { categories, updateArticle } = useStock();
  const [categoryId, setCategoryId] = useState(item.categoryId);
  const [nom, setNom] = useState(item.article);
  const [description, setDescription] = useState(item.description ?? '');
  const [active, setActive] = useState(item.active);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const submit = async () => {
    setBusy(true);
    setError(null);
    try {
      await updateArticle({
        id: item.articleId,
        categorieId: categoryId,
        nom,
        description,
        actif: active,
      });
      onSaved();
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'L’article n’a pas été mis à jour.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal
      title={`Modifier « ${item.article} »`}
      onClose={onClose}
      footer={
        <>
          <button type="button" className="button button-ghost" onClick={onClose} disabled={busy}>
            Annuler
          </button>
          <button type="button" className="button button-gold" onClick={submit} disabled={busy}>
            {busy ? 'Enregistrement…' : 'Enregistrer'}
          </button>
        </>
      }
    >
      <div className="form-grid">
        <label className="field">
          <span>Catégorie</span>
          <select value={categoryId} onChange={(event) => setCategoryId(event.target.value)}>
            {categories.map((category) => (
              <option key={category.id} value={category.id}>
                {category.nom} ({category.codeCourt})
              </option>
            ))}
          </select>
        </label>
        <label className="field">
          <span>Nom de l’article</span>
          <input value={nom} onChange={(event) => setNom(event.target.value)} maxLength={120} />
        </label>
        <label className="field field-full">
          <span>Description</span>
          <input value={description} onChange={(event) => setDescription(event.target.value)} />
        </label>
        <label className="checkbox-field field-full">
          <input
            type="checkbox"
            checked={active}
            onChange={(event) => setActive(event.target.checked)}
          />
          <span>Article actif et visible dans l’inventaire</span>
        </label>
      </div>
      {error && <p className="form-error">{error}</p>}
    </Modal>
  );
}

function NewVariantDialog({
  article,
  onClose,
  onCreated,
}: {
  readonly article: StockItem;
  readonly onClose: () => void;
  readonly onCreated: () => void;
}) {
  const { createVariant } = useStock();
  const [color, setColor] = useState('');
  const [code, setCode] = useState('');
  const [saleUnit, setSaleUnit] = useState<StockSaleUnit>(article.saleUnit);
  const [salePrice, setSalePrice] = useState(String(article.salePrice));
  const [purchasePrice, setPurchasePrice] = useState(
    article.purchasePrice === null ? '' : String(article.purchasePrice),
  );
  const [threshold, setThreshold] = useState(quantityInput(article.threshold, article));
  const [initial, setInitial] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const changeUnit = (next: StockSaleUnit) => {
    try {
      const canonical = toCanonicalQuantity(threshold, saleUnit, { allowZero: true });
      setSaleUnit(next);
      setThreshold(quantityInput(canonical, { dimension: 'length', saleUnit: next }));
    } catch {
      setSaleUnit(next);
    }
  };

  const submit = async () => {
    setBusy(true);
    setError(null);
    try {
      const input: NewVariantInput = {
        articleId: article.articleId,
        couleur: color,
        codeCourt: code,
        uniteVente: saleUnit,
        prixVenteXof: parseMoney(salePrice, 'Le prix de vente', false) ?? 0,
        prixAchatXof: parseMoney(purchasePrice, 'Le prix d’achat', true),
        seuilAlerte: toCanonicalQuantity(threshold, saleUnit, { allowZero: true }),
        quantiteInitiale: toCanonicalQuantity(initial, saleUnit, { allowZero: true }),
      };
      await createVariant(input);
      onCreated();
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'La variante n’a pas été créée.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal
      title={`Nouvelle couleur — ${article.article}`}
      onClose={onClose}
      footer={
        <>
          <button type="button" className="button button-ghost" onClick={onClose} disabled={busy}>
            Annuler
          </button>
          <button type="button" className="button button-gold" onClick={submit} disabled={busy}>
            {busy ? 'Enregistrement…' : 'Ajouter la couleur'}
          </button>
        </>
      }
    >
      <div className="form-grid">
        <label className="field">
          <span>Couleur</span>
          <input
            value={color}
            onChange={(event) => setColor(event.target.value)}
            placeholder="Ex. Bleu roi"
            maxLength={60}
          />
        </label>
        <label className="field">
          <span>Code court</span>
          <input
            value={code}
            onChange={(event) => setCode(event.target.value.toUpperCase())}
            placeholder="BAZ-BR"
            maxLength={30}
          />
        </label>
        {article.dimension === 'length' && (
          <label className="field">
            <span>Unité de vente</span>
            <select
              value={saleUnit}
              onChange={(event) => changeUnit(event.target.value as StockSaleUnit)}
            >
              <option value="metre">Mètre</option>
              <option value="yard">Yard (90 cm)</option>
            </select>
          </label>
        )}
        <label className="field">
          <span>Prix de vente (F CFA)</span>
          <input
            value={salePrice}
            onChange={(event) => setSalePrice(event.target.value)}
            inputMode="numeric"
          />
        </label>
        <label className="field">
          <span>Prix d’achat (F CFA, facultatif)</span>
          <input
            value={purchasePrice}
            onChange={(event) => setPurchasePrice(event.target.value)}
            inputMode="numeric"
          />
        </label>
        <label className="field">
          <span>Seuil d’alerte ({unitLabel(saleUnit)})</span>
          <input
            value={threshold}
            onChange={(event) => setThreshold(event.target.value)}
            inputMode="decimal"
          />
        </label>
        <label className="field">
          <span>Stock initial ({unitLabel(saleUnit)})</span>
          <input
            value={initial}
            onChange={(event) => setInitial(event.target.value)}
            inputMode="decimal"
          />
        </label>
      </div>
      {error && <p className="form-error">{error}</p>}
    </Modal>
  );
}

function EditVariantDialog({
  item,
  onClose,
  onSaved,
}: {
  readonly item: StockItem;
  readonly onClose: () => void;
  readonly onSaved: () => void;
}) {
  const { updateVariant } = useStock();
  const [color, setColor] = useState(item.color);
  const [code, setCode] = useState(item.code);
  const [salePrice, setSalePrice] = useState(String(item.salePrice));
  const [purchasePrice, setPurchasePrice] = useState(
    item.purchasePrice === null ? '' : String(item.purchasePrice),
  );
  const [threshold, setThreshold] = useState(quantityInput(item.threshold, item));
  const [active, setActive] = useState(item.active);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const submit = async () => {
    setBusy(true);
    setError(null);
    try {
      const input: UpdateVariantInput = {
        id: item.id,
        couleur: color,
        codeCourt: code,
        prixVenteXof: parseMoney(salePrice, 'Le prix de vente', false) ?? 0,
        prixAchatXof: parseMoney(purchasePrice, 'Le prix d’achat', true),
        seuilAlerte: toCanonicalQuantity(threshold, item.saleUnit, { allowZero: true }),
        actif: active,
      };
      await updateVariant(input);
      onSaved();
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'La variante n’a pas été mise à jour.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal
      title={`Modifier ${item.article} — ${item.color}`}
      subtitle="Le stock ne se modifie pas ici : utilise un mouvement d’entrée ou de correction."
      onClose={onClose}
      footer={
        <>
          <button type="button" className="button button-ghost" onClick={onClose} disabled={busy}>
            Annuler
          </button>
          <button type="button" className="button button-gold" onClick={submit} disabled={busy}>
            {busy ? 'Enregistrement…' : 'Enregistrer'}
          </button>
        </>
      }
    >
      <div className="form-grid">
        <label className="field">
          <span>Couleur</span>
          <input value={color} onChange={(event) => setColor(event.target.value)} maxLength={60} />
        </label>
        <label className="field">
          <span>Code court</span>
          <input
            value={code}
            onChange={(event) => setCode(event.target.value.toUpperCase())}
            maxLength={30}
          />
        </label>
        <label className="field">
          <span>Prix de vente (F CFA)</span>
          <input
            value={salePrice}
            onChange={(event) => setSalePrice(event.target.value)}
            inputMode="numeric"
          />
          <small>Chaque changement est daté dans l’historique.</small>
        </label>
        <label className="field">
          <span>Prix d’achat (F CFA, facultatif)</span>
          <input
            value={purchasePrice}
            onChange={(event) => setPurchasePrice(event.target.value)}
            inputMode="numeric"
          />
        </label>
        <label className="field">
          <span>Seuil d’alerte ({unitLabel(item.saleUnit)})</span>
          <input
            value={threshold}
            onChange={(event) => setThreshold(event.target.value)}
            inputMode="decimal"
          />
        </label>
        <label className="checkbox-field">
          <input
            type="checkbox"
            checked={active}
            onChange={(event) => setActive(event.target.checked)}
          />
          <span>Variante active</span>
        </label>
      </div>
      {error && <p className="form-error">{error}</p>}
    </Modal>
  );
}

function HistoryDialog({
  item,
  onClose,
}: {
  readonly item: StockItem;
  readonly onClose: () => void;
}) {
  const { priceHistory } = useStock();
  const [entries, setEntries] = useState<readonly PriceHistoryEntry[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    void priceHistory(item.id)
      .then((history) => {
        if (!cancelled) {
          setEntries(history);
        }
      })
      .catch((reason: unknown) => {
        if (!cancelled) {
          setError(
            reason instanceof Error ? reason.message : 'Impossible de charger l’historique.',
          );
        }
      });
    return () => {
      cancelled = true;
    };
  }, [item.id, priceHistory]);

  return (
    <Modal
      title={`Historique des prix — ${item.article} ${item.color}`}
      onClose={onClose}
      wide
      footer={
        <button type="button" className="button button-ghost" onClick={onClose}>
          Fermer
        </button>
      }
    >
      {error && <p className="form-error">{error}</p>}
      {!entries && !error && <p className="catalog-loading">Chargement de l’historique…</p>}
      {entries?.length === 0 && (
        <div className="empty-state">
          <span className="empty-icon">
            <History size={22} aria-hidden="true" />
          </span>
          <strong>Aucun changement enregistré</strong>
          <p>Les prochaines modifications de prix apparaîtront ici avec leur auteur.</p>
        </div>
      )}
      {entries && entries.length > 0 && (
        <ul className="history-list">
          {entries.map((entry) => (
            <li key={entry.id} className="history-entry">
              <div className="history-date">
                <strong>{new Date(entry.changedAt).toLocaleDateString('fr-FR')}</strong>
                <span>
                  {new Date(entry.changedAt).toLocaleTimeString('fr-FR', {
                    hour: '2-digit',
                    minute: '2-digit',
                  })}
                </span>
              </div>
              <div className="history-changes">
                {entry.oldSalePrice !== null || entry.newSalePrice !== null ? (
                  <span>
                    Prix de vente :{' '}
                    <strong>
                      {entry.oldSalePrice === null ? '—' : money(entry.oldSalePrice)} →{' '}
                      {entry.newSalePrice === null ? '—' : money(entry.newSalePrice)}
                    </strong>
                  </span>
                ) : null}
                {entry.oldPurchasePrice !== null || entry.newPurchasePrice !== null ? (
                  <span>
                    Prix d’achat :{' '}
                    <strong>
                      {entry.oldPurchasePrice === null ? '—' : money(entry.oldPurchasePrice)} →{' '}
                      {entry.newPurchasePrice === null ? '—' : money(entry.newPurchasePrice)}
                    </strong>
                  </span>
                ) : null}
              </div>
              <span className="history-author">{entry.changedBy ?? 'Compte supprimé'}</span>
            </li>
          ))}
        </ul>
      )}
    </Modal>
  );
}
