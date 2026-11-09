import {
  AlertTriangle,
  ArrowRight,
  Banknote,
  Boxes,
  CheckCircle2,
  Coins,
  Package,
  ReceiptText,
  ShoppingCart,
  Smartphone,
  TrendingUp,
  type LucideIcon,
} from 'lucide-react';
import { formatXof, xof } from '@mercerie/core';
import type { ProfileSnapshot } from '../types';
import { useStock } from '../data/StockProvider';
import { useSalesDashboard } from '../data/useSalesDashboard';
import { emptySalesSeries, paymentLabel, shortDayLabel, soldQuantityLabel } from '../data/sales';
import type { SalesDashboard } from '../data/sales';
import { formatStock, formatThreshold, lowStockItems, stockStatus } from '../data/stock';
import type { PageId } from '../ui/pages';

interface DashboardProps {
  readonly profile: ProfileSnapshot;
  readonly demo: boolean;
  readonly onNavigate: (page: PageId) => void;
}

interface Metric {
  readonly label: string;
  readonly value: string;
  readonly hint: string;
  readonly icon: LucideIcon;
  readonly tone?: 'gold' | 'green' | 'red' | 'blue';
}

function money(value: number): string {
  return formatXof(xof(value));
}

function firstName(name: string): string {
  return name.trim().split(/\s+/)[0] ?? name;
}

function dateLabel(): string {
  const formatted = new Intl.DateTimeFormat('fr-FR', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  }).format(new Date());

  return formatted.charAt(0).toUpperCase() + formatted.slice(1);
}

function variationHint(sales: SalesDashboard | null): string {
  if (!sales) {
    return 'Chargement des ventes…';
  }

  if (sales.variationPct !== null) {
    const value = sales.variationPct.toLocaleString('fr-FR', { maximumFractionDigits: 1 });
    const sign = sales.variationPct > 0 ? '+' : '';
    return `${sign}${value} % par rapport à hier`;
  }

  return sales.ventesJourXof > 0 ? 'Pas de vente comparable hier' : 'Aucune vente enregistrée';
}

function profitHint(sales: SalesDashboard | null): string {
  if (!sales) {
    return 'Chargement des ventes…';
  }

  if (sales.beneficeJourXof === null) {
    return sales.lignesJour > 0 ? 'Coûts d’achat incomplets' : 'Aucune vente à calculer';
  }

  if (sales.ventesJourXof <= 0) {
    return 'Visible par les administrateurs';
  }

  const margin = Math.round((sales.beneficeJourXof / sales.ventesJourXof) * 100);
  return `Marge brute de ${margin} %`;
}

function saleMoment(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) {
    return '—';
  }

  const now = new Date();
  const time = new Intl.DateTimeFormat('fr-FR', {
    hour: '2-digit',
    minute: '2-digit',
  }).format(date);
  const sameDay =
    date.getFullYear() === now.getFullYear() &&
    date.getMonth() === now.getMonth() &&
    date.getDate() === now.getDate();

  if (sameDay) {
    return time;
  }

  const day = new Intl.DateTimeFormat('fr-FR', {
    day: '2-digit',
    month: '2-digit',
  }).format(date);
  return `${day} · ${time}`;
}

export function Dashboard({ profile, demo, onNavigate }: DashboardProps) {
  const { items } = useStock();
  const { data: sales, loading, cached, error, refresh } = useSalesDashboard(profile, demo);
  const alerts = lowStockItems(items);
  const activeVariants = items.filter((item) => item.active).length;
  const ruptures = alerts.filter((item) => stockStatus(item) === 'rupture').length;
  const week = sales && sales.serie.length > 0 ? sales.serie : emptySalesSeries();
  const weekMax = Math.max(...week.map((point) => point.montantXof), 1);
  const weekTotal = week.reduce((total, point) => total + point.montantXof, 0);
  const hasWeekSales = weekTotal > 0;
  const bestSellers = sales?.meilleuresVentes ?? [];
  const bestMax = Math.max(...bestSellers.map((seller) => seller.montantXof), 1);
  const recentSales = sales?.dernieresVentes ?? [];
  const todayRevenue = sales?.ventesJourXof ?? 0;
  const tickets = sales?.ticketsJour ?? 0;
  const basket = sales?.panierMoyenXof ?? 0;
  const cash = sales?.especesJourXof ?? 0;
  const mobile = sales?.mobileJourXof ?? 0;
  const profit = sales?.beneficeJourXof ?? null;

  const metrics: readonly Metric[] =
    profile.role === 'admin'
      ? [
          {
            label: 'Ventes du jour',
            value: money(todayRevenue),
            hint: variationHint(sales),
            icon: TrendingUp,
            tone: 'gold',
          },
          {
            label: 'Bénéfice estimé',
            value: profit !== null ? money(profit) : '—',
            hint: profitHint(sales),
            icon: Coins,
            tone: 'green',
          },
          {
            label: 'Tickets encaissés',
            value: String(tickets),
            hint:
              tickets > 0 ? `Panier moyen ${money(basket)}` : 'Le compteur se remplit à la caisse',
            icon: ReceiptText,
            tone: 'blue',
          },
          {
            label: 'Alertes de stock',
            value: String(alerts.length),
            hint:
              ruptures > 0
                ? `Dont ${ruptures} rupture${ruptures > 1 ? 's' : ''}`
                : 'Aucune rupture constatée',
            icon: AlertTriangle,
            tone: alerts.length > 0 ? 'red' : 'green',
          },
        ]
      : profile.role === 'cashier'
        ? [
            {
              label: 'Ventes du jour',
              value: money(todayRevenue),
              hint:
                tickets > 0
                  ? `${tickets} ticket${tickets > 1 ? 's' : ''} encaissé${tickets > 1 ? 's' : ''}`
                  : 'Aucune vente enregistrée',
              icon: TrendingUp,
              tone: 'gold',
            },
            {
              label: 'Encaissé en espèces',
              value: money(cash),
              hint: sales?.caisse
                ? `Fond de caisse ${money(sales.caisse.fondOuvertureXof)}`
                : sales
                  ? 'Caisse fermée'
                  : 'Chargement de la caisse…',
              icon: Banknote,
              tone: 'green',
            },
            {
              label: 'Mobile money',
              value: money(mobile),
              hint: 'T-Money et Flooz',
              icon: Smartphone,
              tone: 'blue',
            },
            {
              label: 'Stock faible',
              value: String(alerts.length),
              hint:
                alerts.length > 0 ? 'Articles à signaler à la direction' : 'Aucune alerte ouverte',
              icon: AlertTriangle,
              tone: alerts.length > 0 ? 'red' : 'green',
            },
          ]
        : [
            {
              label: 'Articles suivis',
              value: String(activeVariants),
              hint: 'Tissus et mercerie',
              icon: Boxes,
              tone: 'blue',
            },
            {
              label: 'Stock faible',
              value: String(alerts.length),
              hint: alerts.length > 0 ? 'À signaler avant la vente' : 'Aucune alerte ouverte',
              icon: AlertTriangle,
              tone: alerts.length > 0 ? 'red' : 'green',
            },
            {
              label: 'Ruptures',
              value: String(ruptures),
              hint: ruptures > 0 ? 'Articles à commander' : 'Aucune rupture',
              icon: Package,
              tone: 'gold',
            },
            {
              label: 'Ventes à transmettre',
              value: '0',
              hint: 'Le caissier encaisse et valide',
              icon: ShoppingCart,
              tone: 'green',
            },
          ];

  const heroAction: { readonly label: string; readonly page: PageId } =
    profile.role === 'admin'
      ? { label: 'Voir le centre d’alertes', page: 'alertes' }
      : profile.role === 'cashier'
        ? { label: 'Aller à la caisse', page: 'caisse' }
        : { label: 'Consulter l’inventaire', page: 'inventaire' };

  const goToHeroAction = () => onNavigate(heroAction.page);

  const showSalesData = profile.role !== 'seller';

  return (
    <div className="dashboard">
      <section className="hero">
        <div className="hero-copy">
          <p className="eyebrow">
            {demo ? 'Aperçu de démonstration' : 'Mercerie PDJ · Puits de Jacob'}
          </p>
          <h1>Bonjour, {firstName(profile.nom)}.</h1>
          <p className="hero-subtitle">
            {profile.role === 'admin'
              ? 'Voici l’activité de la boutique aujourd’hui.'
              : profile.role === 'cashier'
                ? 'Ta caisse et les ventes du jour en un coup d’œil.'
                : 'Le stock prêt pour servir les clients.'}
          </p>
          <div className="hero-meta">
            <span>{dateLabel()}</span>
            <span className="dot" aria-hidden="true" />
            <span>{demo ? 'Données fictives' : 'Boutique Mercerie PDJ'}</span>
          </div>
          <button type="button" className="button button-gold" onClick={goToHeroAction}>
            {heroAction.label}
            <ArrowRight size={18} aria-hidden="true" />
          </button>
        </div>
        <div className="hero-mark" aria-hidden="true">
          <span className="hero-monogram">PDJ</span>
          <span className="hero-mark-line" />
          <span className="hero-mark-caption">Puits de Jacob</span>
        </div>
      </section>

      {!demo && profile.role !== 'seller' && (loading || error || cached) && (
        <div
          className={`dashboard-status${error ? ' is-error' : cached ? ' is-cached' : ''}`}
          role="status"
          aria-live="polite"
        >
          <span>
            {loading
              ? 'Chargement des ventes du jour…'
              : (error ??
                'Ventes enregistrées localement : dernière mise à jour disponible hors ligne.')}
          </span>
          {error && (
            <button type="button" className="text-button" onClick={() => void refresh()}>
              Réessayer
            </button>
          )}
        </div>
      )}

      <section className="metrics" aria-label="Indicateurs du jour">
        {metrics.map((metric) => {
          const Icon = metric.icon;
          return (
            <article key={metric.label} className="metric-card">
              <span className={`metric-icon tone-${metric.tone ?? 'blue'}`}>
                <Icon size={20} strokeWidth={1.8} aria-hidden="true" />
              </span>
              <div className="metric-body">
                <span className="metric-label">{metric.label}</span>
                <strong className="metric-value">{metric.value}</strong>
                <span className="metric-hint">{metric.hint}</span>
              </div>
            </article>
          );
        })}
      </section>

      {showSalesData && (
        <div className="dashboard-grid dashboard-grid-chart">
          <section className="panel">
            <header className="panel-header">
              <div>
                <h2>Ventes des 7 derniers jours</h2>
                <p>
                  {hasWeekSales
                    ? `Total ${money(weekTotal)}`
                    : 'Aucune vente enregistrée pour l’instant'}
                </p>
              </div>
              <span className="panel-badge">
                {demo ? 'Cette semaine' : hasWeekSales ? '7 jours' : 'En attente'}
              </span>
            </header>

            <div
              className="chart"
              role="img"
              aria-label="Histogramme des ventes des sept derniers jours"
            >
              {week.map((point) => {
                const height =
                  point.montantXof > 0
                    ? Math.max(8, Math.round((point.montantXof / weekMax) * 100))
                    : 4;
                const isPeak = hasWeekSales && point.montantXof === weekMax;
                const day = shortDayLabel(point.jour);
                return (
                  <div key={point.jour} className="chart-column">
                    <span className="chart-value">
                      {point.montantXof > 0 ? `${Math.round(point.montantXof / 1000)} k` : '—'}
                    </span>
                    <div className="chart-track">
                      <div
                        className={`chart-bar${isPeak ? ' is-peak' : ''}`}
                        style={{ height: `${height}%` }}
                        title={`${day} : ${
                          point.montantXof > 0 ? money(point.montantXof) : 'aucune vente'
                        }`}
                      />
                    </div>
                    <span className="chart-label">{day}</span>
                  </div>
                );
              })}
            </div>
          </section>

          <section className="panel">
            <header className="panel-header">
              <div>
                <h2>Meilleures ventes</h2>
                <p>
                  {demo
                    ? 'Depuis lundi'
                    : bestSellers.length > 0
                      ? `Sur les ${sales?.periodeJours ?? 7} derniers jours`
                      : 'Les articles vendus apparaîtront ici'}
                </p>
              </div>
            </header>

            {bestSellers.length > 0 ? (
              <ul className="ranked-list">
                {bestSellers.map((seller, index) => (
                  <li key={seller.articleId}>
                    <span className="rank">{String(index + 1).padStart(2, '0')}</span>
                    <div className="ranked-body">
                      <div className="ranked-top">
                        <strong>{seller.nom}</strong>
                        <span>{money(seller.montantXof)}</span>
                      </div>
                      <div className="progress">
                        <span
                          style={{
                            width: `${Math.round((seller.montantXof / bestMax) * 100)}%`,
                          }}
                        />
                      </div>
                      <span className="ranked-detail">{soldQuantityLabel(seller)}</span>
                    </div>
                  </li>
                ))}
              </ul>
            ) : (
              <EmptyState
                icon={Package}
                title="Pas encore de ventes"
                text="Les meilleures ventes s’afficheront après les premiers tickets."
              />
            )}
          </section>
        </div>
      )}

      <div className="dashboard-grid">
        <section className="panel" id="alertes-stock">
          <header className="panel-header">
            <div>
              <h2>Alertes de stock</h2>
              <p>
                {alerts.length > 0
                  ? 'À vérifier avant la prochaine vente'
                  : 'Aucune alerte ouverte'}
              </p>
            </div>
            <button type="button" className="text-button" onClick={() => onNavigate('inventaire')}>
              Tout l’inventaire
              <ArrowRight size={15} aria-hidden="true" />
            </button>
          </header>

          {alerts.length > 0 ? (
            <ul className="alert-list">
              {alerts.slice(0, 5).map((item) => {
                const status = stockStatus(item);
                return (
                  <li key={item.id} className={`alert-row alert-${status}`}>
                    <span
                      className={`stock-swatch swatch-${item.dimension === 'length' ? 'fabric' : 'haberdashery'}`}
                      aria-hidden="true"
                    />
                    <div className="alert-body">
                      <strong>
                        {item.article} · {item.color}
                      </strong>
                      <span>
                        {status === 'rupture' ? 'Rupture de stock' : 'Sous le seuil d’alerte'} ·
                        seuil {formatThreshold(item)}
                      </span>
                    </div>
                    <span className="alert-quantity">{formatStock(item)}</span>
                  </li>
                );
              })}
            </ul>
          ) : (
            <EmptyState
              icon={CheckCircle2}
              title="Tout est au-dessus du seuil"
              text="Les alertes apparaîtront automatiquement dès qu’un article passera sous son seuil."
            />
          )}
        </section>

        {profile.role === 'seller' ? (
          <section className="panel">
            <header className="panel-header">
              <div>
                <h2>Préparer une vente</h2>
                <p>Le caissier valide et encaisse</p>
              </div>
            </header>
            <ol className="steps">
              <li>
                <span>1</span>
                <div>
                  <strong>Écoute le client</strong>
                  <p>Article, couleur et longueur demandée.</p>
                </div>
              </li>
              <li>
                <span>2</span>
                <div>
                  <strong>Vérifie le stock</strong>
                  <p>Le seuil et la quantité sont visibles dans l’inventaire.</p>
                </div>
              </li>
              <li>
                <span>3</span>
                <div>
                  <strong>Transmets au caissier</strong>
                  <p>Le caissier crée le ticket et encaisse.</p>
                </div>
              </li>
            </ol>
            <button
              type="button"
              className="button button-ghost button-block"
              onClick={() => onNavigate('preparer')}
            >
              Ouvrir la préparation
              <ArrowRight size={17} aria-hidden="true" />
            </button>
          </section>
        ) : (
          <section className="panel">
            <header className="panel-header">
              <div>
                <h2>Dernières ventes</h2>
                <p>
                  {demo
                    ? 'Aujourd’hui'
                    : recentSales.length > 0
                      ? 'Les derniers tickets validés'
                      : 'Aucun ticket pour l’instant'}
                </p>
              </div>
              <button type="button" className="text-button" onClick={() => onNavigate('ventes')}>
                Journal
                <ArrowRight size={15} aria-hidden="true" />
              </button>
            </header>

            {recentSales.length > 0 ? (
              <ul className="sale-list">
                {recentSales.map((sale) => (
                  <li key={sale.reference}>
                    <div className="sale-icon">
                      <ReceiptText size={17} aria-hidden="true" />
                    </div>
                    <div className="sale-body">
                      <strong>{sale.reference}</strong>
                      <span>
                        {saleMoment(sale.dateVente)} · {sale.lignes} ligne
                        {sale.lignes > 1 ? 's' : ''} · {paymentLabel(sale.methodes)}
                      </span>
                    </div>
                    <span className="sale-total">{money(sale.totalXof)}</span>
                  </li>
                ))}
              </ul>
            ) : (
              <EmptyState
                icon={ReceiptText}
                title="Le journal est vide"
                text="Chaque vente validée à la caisse apparaîtra ici avec son moyen de paiement."
              />
            )}
          </section>
        )}
      </div>
    </div>
  );
}

function EmptyState({
  icon: Icon,
  title,
  text,
}: {
  readonly icon: LucideIcon;
  readonly title: string;
  readonly text: string;
}) {
  return (
    <div className="empty-state">
      <span className="empty-icon">
        <Icon size={22} strokeWidth={1.7} aria-hidden="true" />
      </span>
      <strong>{title}</strong>
      <p>{text}</p>
    </div>
  );
}
