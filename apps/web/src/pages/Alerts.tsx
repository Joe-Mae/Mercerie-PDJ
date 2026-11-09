import { useState } from 'react';
import {
  AlertTriangle,
  Ban,
  Banknote,
  Bell,
  BellOff,
  BellRing,
  CheckCircle2,
  Clock3,
  History,
  LogIn,
  Package,
  Percent,
  RefreshCw,
  SlidersHorizontal,
  Smartphone,
  type LucideIcon,
} from 'lucide-react';
import type { ProfileSnapshot } from '../types';
import { useAlerts } from '../data/AlertsProvider';
import { usePushNotifications } from '../data/usePushNotifications';
import type { PushState } from '../lib/push';
import {
  ALERT_SEVERITY_LABELS,
  ALERT_TYPE_LABELS,
  splitAlerts,
  type AlertEntry,
  type AlertType,
} from '../data/alerts';
import { PageHeader } from '../ui/PageHeader';

const ALERT_ICONS: Readonly<Record<AlertType, LucideIcon>> = {
  low_stock: Package,
  negative_stock: AlertTriangle,
  cash_gap: Banknote,
  sale_cancelled: Ban,
  discount: Percent,
  stock_adjustment: SlidersHorizontal,
  login: LogIn,
};

const DATE_FORMAT = new Intl.DateTimeFormat('fr-FR', {
  day: '2-digit',
  month: 'short',
  hour: '2-digit',
  minute: '2-digit',
});

function dateLabel(value: string): string {
  return DATE_FORMAT.format(new Date(value));
}

function traceLines(alert: AlertEntry): string[] {
  const traces: string[] = [];
  if (alert.acknowledgedAt) {
    const by = alert.acknowledgedByName ? ` par ${alert.acknowledgedByName}` : '';
    traces.push(`Prise en charge${by} le ${dateLabel(alert.acknowledgedAt)}`);
  }
  if (alert.resolvedAt) {
    traces.push(`Résolue le ${dateLabel(alert.resolvedAt)}`);
  }
  return traces;
}

interface AlertsProps {
  readonly profile: ProfileSnapshot;
  readonly demo: boolean;
}

export function Alerts({ profile, demo }: AlertsProps) {
  const { alerts, loading, cached, error, lastUpdated, refresh, acknowledge } = useAlerts();
  const [busyId, setBusyId] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const sections = splitAlerts(alerts);
  const isAdmin = profile.role === 'admin';
  const canReceivePush = profile.role === 'admin' || profile.role === 'cashier';

  const handleAcknowledge = async (alert: AlertEntry) => {
    setBusyId(alert.id);
    setActionError(null);
    try {
      await acknowledge(alert.id);
    } catch (cause) {
      setActionError(
        cause instanceof Error ? cause.message : 'La prise en charge de l’alerte a échoué.',
      );
    } finally {
      setBusyId(null);
    }
  };

  return (
    <div className="page">
      <PageHeader
        eyebrow="Centre d’alertes"
        title="Ce qui demande ton attention"
        description="Aucune alerte n’est supprimée. Le retour du stock clôt automatiquement une alerte ; la prise en charge est réservée aux administrateurs."
        actions={
          <button
            type="button"
            className="button button-ghost"
            onClick={() => void refresh()}
            disabled={loading || demo}
          >
            <RefreshCw size={16} aria-hidden="true" />
            Actualiser
          </button>
        }
      />

      <section className="inventory-summary" aria-label="Résumé des alertes">
        <div className="summary-chip">
          <Bell size={18} aria-hidden="true" />
          <div>
            <strong>{sections.toTreat.length}</strong>
            <span>à traiter</span>
          </div>
        </div>
        <div className="summary-chip">
          <Clock3 size={18} aria-hidden="true" />
          <div>
            <strong>{sections.inProgress.length}</strong>
            <span>prises en charge</span>
          </div>
        </div>
        <div className="summary-chip">
          <History size={18} aria-hidden="true" />
          <div>
            <strong>{sections.resolved.length}</strong>
            <span>résolues</span>
          </div>
        </div>
      </section>

      {!demo && lastUpdated && (
        <p className="alert-updated">
          {cached
            ? `Dernières alertes enregistrées sur cet appareil le ${dateLabel(lastUpdated)}.`
            : `Dernière mise à jour le ${dateLabel(lastUpdated)}.`}
        </p>
      )}

      {cached && (
        <div className="alert-notice" role="status">
          Affichage des dernières alertes enregistrées sur cet appareil. La prise en charge
          nécessite une connexion.
        </div>
      )}
      {error && (
        <div className="alert-notice is-error" role="alert">
          {error}
        </div>
      )}
      {actionError && (
        <div className="alert-notice is-error" role="alert">
          {actionError}
        </div>
      )}

      {canReceivePush && <NotificationsPanel demo={demo} />}

      <section className="panel">
        <header className="panel-header">
          <div>
            <h2>À traiter</h2>
            <p>
              {sections.toTreat.length > 0
                ? 'Les plus graves d’abord. Une alerte reste visible tant qu’elle n’est ni prise en charge ni résolue.'
                : 'Rien en attente pour le moment.'}
            </p>
          </div>
          <span className="panel-badge">{sections.toTreat.length}</span>
        </header>

        {sections.toTreat.length > 0 ? (
          <ul className="alert-entry-list">
            {sections.toTreat.map((alert) => (
              <AlertRow
                key={alert.id}
                alert={alert}
                admin={isAdmin}
                busy={busyId === alert.id}
                onAcknowledge={() => void handleAcknowledge(alert)}
              />
            ))}
          </ul>
        ) : (
          <div className="empty-state">
            <span className="empty-icon">
              <CheckCircle2 size={22} strokeWidth={1.7} aria-hidden="true" />
            </span>
            <strong>Aucune alerte à traiter</strong>
            <p>
              Une alerte apparaît dès qu’un seuil de stock est franchi ou qu’un écart est constaté à
              la caisse.
            </p>
          </div>
        )}
      </section>

      {sections.inProgress.length > 0 && (
        <section className="panel">
          <header className="panel-header">
            <div>
              <h2>Prises en charge</h2>
              <p>
                Quelqu’un s’en occupe. L’alerte se clôt lorsque la situation revient à la normale.
              </p>
            </div>
            <span className="panel-badge">{sections.inProgress.length}</span>
          </header>
          <ul className="alert-entry-list">
            {sections.inProgress.map((alert) => (
              <AlertRow key={alert.id} alert={alert} admin={isAdmin} busy={false} />
            ))}
          </ul>
        </section>
      )}

      {sections.resolved.length > 0 && (
        <section className="panel">
          <header className="panel-header">
            <div>
              <h2>Résolues</h2>
              <p>Conservées pour la traçabilité, même après le retour à la normale.</p>
            </div>
            <span className="panel-badge">{sections.resolved.length}</span>
          </header>
          <ul className="alert-entry-list">
            {sections.resolved.slice(0, 12).map((alert) => (
              <AlertRow key={alert.id} alert={alert} admin={isAdmin} busy={false} />
            ))}
          </ul>
          {sections.resolved.length > 12 && (
            <p className="alert-more">
              Seules les 12 résolutions les plus récentes sont affichées.
            </p>
          )}
        </section>
      )}

      {!loading && alerts.length === 0 && !error && (
        <p className="alert-more">Aucune alerte visible pour ce compte.</p>
      )}
    </div>
  );
}

type PushMode = 'unsupported' | 'ios' | 'unconfigured' | 'denied' | 'enabled' | 'disabled';

function pushMode(state: PushState): PushMode {
  if (state.support === 'unsupported') {
    return 'unsupported';
  }
  if (state.support === 'ios-install-required') {
    return 'ios';
  }
  if (state.support === 'unconfigured') {
    return 'unconfigured';
  }
  if (state.permission === 'denied') {
    return 'denied';
  }
  return state.subscribed ? 'enabled' : 'disabled';
}

const PUSH_TEXT: Readonly<
  Record<PushMode, { readonly title: string; readonly description: string }>
> = {
  enabled: {
    title: 'Notifications activées sur cet appareil',
    description:
      'Les alertes de stock arrivent chez les administrateurs et la caisse. Les autres alertes sont réservées aux administrateurs.',
  },
  disabled: {
    title: 'Notifications désactivées sur cet appareil',
    description:
      'Active-les pour être prévenu même quand l’application est fermée. Chaque appareil s’active séparément.',
  },
  denied: {
    title: 'Notifications bloquées par le navigateur',
    description:
      'Autorise les notifications pour ce site dans les réglages du navigateur, puis recharge la page.',
  },
  unsupported: {
    title: 'Notifications non disponibles',
    description:
      'Ce navigateur ne prend pas en charge les notifications. Utilise Chrome, Edge, Firefox ou Safari 16.4 ou plus récent.',
  },
  ios: {
    title: 'Installe l’application d’abord',
    description:
      'Sur iPhone ou iPad, touche Partager puis « Sur l’écran d’accueil », ouvre l’application installée et reviens ici.',
  },
  unconfigured: {
    title: 'Notifications non configurées',
    description:
      'La clé publique des notifications manque sur ce serveur. Demande à l’administrateur de terminer l’installation.',
  },
};

function NotificationsPanel({ demo }: { readonly demo: boolean }) {
  const { state, loading, busy, error, enable, disable, refresh } = usePushNotifications(!demo);

  if (demo) {
    return (
      <section className="panel push-panel">
        <header className="panel-header">
          <div>
            <h2>Notifications</h2>
            <p>Prévenir les administrateurs et la caisse des alertes, même application fermée.</p>
          </div>
          <span className="panel-badge">
            <BellOff size={16} aria-hidden="true" />
          </span>
        </header>
        <p className="push-note">
          Disponibles seulement sur l’application connectée au serveur. Sur iPhone et iPad, il faut
          d’abord ajouter l’application à l’écran d’accueil.
        </p>
      </section>
    );
  }

  if (loading && !state) {
    return (
      <section className="panel push-panel" aria-busy="true">
        <header className="panel-header">
          <div>
            <h2>Notifications</h2>
            <p>Prévenir les administrateurs et la caisse des alertes, même application fermée.</p>
          </div>
        </header>
        <p className="push-note">Vérification de cet appareil…</p>
      </section>
    );
  }

  if (!state) {
    return (
      <section className="panel push-panel">
        <header className="panel-header">
          <div>
            <h2>Notifications</h2>
            <p>Prévenir les administrateurs et la caisse des alertes, même application fermée.</p>
          </div>
        </header>
        <div className="push-panel-body">
          <span className="push-icon" aria-hidden="true">
            <BellOff size={20} strokeWidth={1.8} />
          </span>
          <div className="push-copy">
            <strong>Notifications indisponibles</strong>
            <p>Impossible de vérifier les notifications sur cet appareil.</p>
          </div>
          <button type="button" className="button button-ghost" onClick={() => void refresh()}>
            Réessayer
          </button>
        </div>
        {error && (
          <div className="alert-notice is-error" role="alert">
            {error}
          </div>
        )}
      </section>
    );
  }

  const mode = pushMode(state);
  const text = PUSH_TEXT[mode];
  const Icon =
    mode === 'enabled' ? BellRing : mode === 'disabled' || mode === 'denied' ? BellOff : Smartphone;

  return (
    <section className="panel push-panel">
      <header className="panel-header">
        <div>
          <h2>Notifications</h2>
          <p>Prévenir les administrateurs et la caisse des alertes, même application fermée.</p>
        </div>
      </header>

      <div className="push-panel-body">
        <span className={`push-icon${mode === 'enabled' ? ' is-on' : ''}`} aria-hidden="true">
          <Icon size={20} strokeWidth={1.8} />
        </span>
        <div className="push-copy">
          <strong>{text.title}</strong>
          <p>{text.description}</p>
        </div>
        {mode === 'enabled' && (
          <button
            type="button"
            className="button button-ghost"
            onClick={() => void disable()}
            disabled={busy}
          >
            {busy ? 'Désactivation…' : 'Désactiver'}
          </button>
        )}
        {mode === 'disabled' && (
          <button
            type="button"
            className="button button-primary"
            onClick={() => void enable()}
            disabled={busy}
          >
            {busy ? 'Activation…' : 'Activer les notifications'}
          </button>
        )}
        {mode === 'denied' && (
          <button type="button" className="button button-ghost" onClick={() => void refresh()}>
            Vérifier à nouveau
          </button>
        )}
      </div>

      {error && (
        <div className="alert-notice is-error" role="alert">
          {error}
        </div>
      )}
    </section>
  );
}

interface AlertRowProps {
  readonly alert: AlertEntry;
  readonly admin: boolean;
  readonly busy: boolean;
  readonly onAcknowledge?: () => void;
}

function AlertRow({ alert, admin, busy, onAcknowledge }: AlertRowProps) {
  const Icon = ALERT_ICONS[alert.type];
  const traces = traceLines(alert);
  const canAcknowledge = admin && !alert.resolvedAt && !alert.acknowledgedAt && onAcknowledge;

  return (
    <li className={`alert-entry alert-${alert.severity}${alert.resolvedAt ? ' is-resolved' : ''}`}>
      <span className="alert-entry-icon" aria-hidden="true">
        <Icon size={18} strokeWidth={1.8} />
      </span>
      <div className="alert-entry-body">
        <div className="alert-entry-meta">
          <span className={`severity-pill severity-${alert.severity}`}>
            {ALERT_SEVERITY_LABELS[alert.severity]}
          </span>
          <span className="alert-entry-type">{ALERT_TYPE_LABELS[alert.type]}</span>
          <span className="alert-entry-time">{dateLabel(alert.createdAt)}</span>
        </div>
        <p className="alert-entry-message">{alert.message}</p>
        {traces.length > 0 && <span className="alert-entry-trace">{traces.join(' · ')}</span>}
      </div>
      {canAcknowledge && (
        <button
          type="button"
          className="button button-ghost alert-ack-button"
          onClick={onAcknowledge}
          disabled={busy}
        >
          <CheckCircle2 size={16} aria-hidden="true" />
          {busy ? 'Prise en charge…' : 'Prendre en charge'}
        </button>
      )}
    </li>
  );
}
