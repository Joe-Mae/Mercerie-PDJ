import type { ReactNode } from 'react';
import {
  AlertTriangle,
  Bell,
  Boxes,
  CloudUpload,
  Download,
  LayoutDashboard,
  Lock,
  LogOut,
  Moon,
  ReceiptText,
  RefreshCw,
  ScanLine,
  ShoppingCart,
  Sun,
  Users,
  Wifi,
  WifiOff,
  X,
  type LucideIcon,
} from 'lucide-react';
import type { ProfileSnapshot } from '../types';
import { ROLE_LABELS } from '../types';
import { useAlerts } from '../data/AlertsProvider';
import { useInstall } from '../data/useInstall';
import { useTheme } from '../data/useTheme';
import { useOffline } from '../offline/OfflineProvider';
import type { PageId } from './pages';

interface NavigationItem {
  readonly id: PageId;
  readonly label: string;
  readonly icon: LucideIcon;
  readonly roles: readonly ProfileSnapshot['role'][];
  readonly requiresSuperadmin?: boolean;
}

const NAVIGATION: readonly NavigationItem[] = [
  {
    id: 'dashboard',
    label: 'Tableau de bord',
    icon: LayoutDashboard,
    roles: ['admin', 'cashier', 'seller'],
  },
  {
    id: 'alertes',
    label: 'Alertes',
    icon: Bell,
    roles: ['admin', 'cashier', 'seller'],
  },
  {
    id: 'caisse',
    label: 'Caisse',
    icon: ShoppingCart,
    roles: ['admin', 'cashier'],
  },
  {
    id: 'preparer',
    label: 'Préparer une vente',
    icon: ScanLine,
    roles: ['seller'],
  },
  {
    id: 'inventaire',
    label: 'Stock',
    icon: Boxes,
    roles: ['admin', 'cashier', 'seller'],
  },
  {
    id: 'ventes',
    label: 'Journal des ventes',
    icon: ReceiptText,
    roles: ['admin', 'cashier'],
  },
  {
    id: 'equipe',
    label: 'Équipe et droits',
    icon: Users,
    roles: ['admin'],
    requiresSuperadmin: true,
  },
];

function initials(name: string): string {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase() ?? '')
    .join('');
}

function operationLabel(count: number): string {
  return count === 1 ? '1 opération en attente' : `${count} opérations en attente`;
}

function SyncBanner({ isOnline, demo }: { readonly isOnline: boolean; readonly demo: boolean }) {
  const { syncing, syncError, pendingCount, otherAccountPending, retrySync } = useOffline();

  if (demo || (!syncError && pendingCount === 0 && otherAccountPending === 0 && !syncing)) {
    return null;
  }

  const tone = syncError ? 'is-error' : !isOnline ? 'is-offline' : 'is-pending';

  return (
    <div className={`sync-banner ${tone}`} role="status" aria-live="polite">
      <span className="sync-banner-icon" aria-hidden="true">
        {syncError ? (
          <AlertTriangle size={18} />
        ) : isOnline ? (
          <CloudUpload size={18} />
        ) : (
          <WifiOff size={18} />
        )}
      </span>
      <div className="sync-banner-text">
        {syncError ? (
          <>
            <strong>Synchronisation bloquée</strong>
            <span>{syncError}</span>
          </>
        ) : !isOnline ? (
          <>
            <strong>Hors ligne — {operationLabel(pendingCount)}</strong>
            <span>Les ventes restent possibles et partiront au retour du réseau.</span>
          </>
        ) : (
          <>
            <strong>{syncing ? 'Synchronisation en cours…' : operationLabel(pendingCount)}</strong>
            <span>Les opérations partent dans l’ordre, une seule fois chacune.</span>
          </>
        )}
        {otherAccountPending > 0 && (
          <span className="sync-banner-other">
            {operationLabel(otherAccountPending)} d’un autre compte sur cet appareil.
          </span>
        )}
      </div>
      {syncError && isOnline && (
        <button
          type="button"
          className="button button-ghost sync-banner-action"
          onClick={() => void retrySync()}
          disabled={syncing}
        >
          <RefreshCw size={16} aria-hidden="true" />
          Réessayer
        </button>
      )}
    </div>
  );
}

function InstallBanner() {
  const { state, install, dismiss } = useInstall();

  if (
    !import.meta.env.PROD ||
    state.dismissed ||
    state.mode === 'installed' ||
    state.mode === 'unavailable'
  ) {
    return null;
  }

  const ios = state.mode === 'ios';

  return (
    <div className="install-banner">
      <span className="install-banner-icon" aria-hidden="true">
        <Download size={18} />
      </span>
      <div className="install-banner-text">
        <strong>{ios ? 'Installer sur l’écran d’accueil' : 'Installer l’application'}</strong>
        <span>
          {ios
            ? 'Touche Partager, puis « Sur l’écran d’accueil » pour l’ouvrir en plein écran.'
            : 'Ouvre-la en plein écran sur cet appareil et garde l’accès hors ligne.'}
        </span>
        {state.error && <span className="install-banner-error">{state.error}</span>}
      </div>
      {ios ? (
        <button
          type="button"
          className="button button-ghost install-banner-action"
          onClick={dismiss}
        >
          J’ai compris
        </button>
      ) : (
        <button
          type="button"
          className="button button-ghost install-banner-action"
          onClick={() => void install()}
          disabled={state.installing}
        >
          {state.installing ? 'Installation…' : 'Installer'}
        </button>
      )}
      <button
        type="button"
        className="icon-button"
        onClick={dismiss}
        aria-label="Masquer l’invitation à installer"
      >
        <X size={16} aria-hidden="true" />
      </button>
    </div>
  );
}

interface AppShellProps {
  readonly profile: ProfileSnapshot;
  readonly page: PageId;
  readonly isOnline: boolean;
  readonly demo: boolean;
  readonly onNavigate: (page: PageId) => void;
  readonly onLock: () => void;
  readonly onSignOut: () => void;
  readonly children: ReactNode;
}

export function AppShell({
  profile,
  page,
  isOnline,
  demo,
  onNavigate,
  onLock,
  onSignOut,
  children,
}: AppShellProps) {
  const { toTreatTotal } = useAlerts();
  const { theme, toggle } = useTheme();
  const items = NAVIGATION.filter(
    (item) =>
      item.roles.includes(profile.role) && (!item.requiresSuperadmin || profile.est_superadmin),
  );
  const roleLabel = profile.est_superadmin ? 'Superadmin' : ROLE_LABELS[profile.role];
  const themeLabel = theme === 'dark' ? 'Passer en mode clair' : 'Passer en mode sombre';

  const handleSignOut = () => {
    if (demo) {
      onSignOut();
      return;
    }

    const confirmed = window.confirm(
      'Te déconnecter ? Le code à 4 chiffres sera effacé de cet appareil.',
    );

    if (confirmed) {
      onSignOut();
    }
  };

  return (
    <div className="workspace">
      <aside className="sidebar">
        <div className="brand">
          <img className="brand-logo" src="/brand/logo-pdj.jpeg" alt="Logo Mercerie PDJ" />
          <div className="brand-text">
            <strong>Mercerie PDJ</strong>
            <span>Puits de Jacob</span>
          </div>
          <button
            type="button"
            className="icon-button brand-theme"
            onClick={toggle}
            aria-label={themeLabel}
            title={themeLabel}
          >
            {theme === 'dark' ? (
              <Sun size={17} aria-hidden="true" />
            ) : (
              <Moon size={17} aria-hidden="true" />
            )}
          </button>
        </div>

        <nav className="nav" aria-label="Navigation principale">
          {items.map((item) => {
            const Icon = item.icon;
            const active = item.id === page;
            return (
              <button
                key={item.id}
                type="button"
                className={`nav-item${active ? ' is-active' : ''}`}
                onClick={() => onNavigate(item.id)}
                aria-current={active ? 'page' : undefined}
              >
                <Icon size={19} strokeWidth={1.9} aria-hidden="true" />
                <span>{item.label}</span>
                {item.id === 'alertes' && toTreatTotal > 0 ? (
                  <span className="nav-badge" aria-label={`${toTreatTotal} alertes à traiter`}>
                    {toTreatTotal > 99 ? '99+' : toTreatTotal}
                  </span>
                ) : null}
              </button>
            );
          })}
        </nav>

        <div className="sidebar-footer">
          <div className={`status-line${demo ? ' is-demo' : ''}`}>
            {demo ? (
              <>
                <ScanLine size={15} aria-hidden="true" />
                <span>Aperçu — données de démonstration</span>
              </>
            ) : isOnline ? (
              <>
                <Wifi size={15} aria-hidden="true" />
                <span>Connecté au serveur</span>
              </>
            ) : (
              <>
                <WifiOff size={15} aria-hidden="true" />
                <span>Hors ligne</span>
              </>
            )}
          </div>

          <div className="user-card">
            <span className="avatar" aria-hidden="true">
              {initials(profile.nom)}
            </span>
            <div className="user-card-text">
              <strong>{profile.nom}</strong>
              <span>{roleLabel}</span>
            </div>
            <div className="user-actions">
              <button
                type="button"
                className="icon-button"
                onClick={onLock}
                aria-label={demo ? 'Quitter l’aperçu' : 'Verrouiller l’application'}
                title={demo ? 'Quitter l’aperçu' : 'Verrouiller'}
              >
                <Lock size={17} aria-hidden="true" />
              </button>
              <button
                type="button"
                className="icon-button"
                onClick={handleSignOut}
                aria-label={demo ? 'Quitter l’aperçu' : 'Se déconnecter'}
                title={demo ? 'Quitter l’aperçu' : 'Se déconnecter'}
              >
                <LogOut size={17} aria-hidden="true" />
              </button>
            </div>
          </div>
        </div>
      </aside>

      <div className="workspace-main">
        <header className="mobile-header">
          <div className="brand brand-compact">
            <img className="brand-logo" src="/brand/logo-pdj.jpeg" alt="Logo Mercerie PDJ" />
            <div className="brand-text">
              <strong>Mercerie PDJ</strong>
              <span>{demo ? 'Aperçu' : roleLabel}</span>
            </div>
          </div>
          <div className="mobile-actions">
            <button
              type="button"
              className="icon-button"
              onClick={toggle}
              aria-label={themeLabel}
              title={themeLabel}
            >
              {theme === 'dark' ? (
                <Sun size={18} aria-hidden="true" />
              ) : (
                <Moon size={18} aria-hidden="true" />
              )}
            </button>
            <button
              type="button"
              className="icon-button"
              onClick={onLock}
              aria-label={demo ? 'Quitter l’aperçu' : 'Verrouiller l’application'}
            >
              <Lock size={18} aria-hidden="true" />
            </button>
            <button
              type="button"
              className="icon-button"
              onClick={handleSignOut}
              aria-label={demo ? 'Quitter l’aperçu' : 'Se déconnecter'}
            >
              <LogOut size={18} aria-hidden="true" />
            </button>
          </div>
        </header>

        <main className="workspace-content">
          {!demo && <InstallBanner />}
          <SyncBanner isOnline={isOnline} demo={demo} />
          {children}
        </main>

        <nav className="bottom-nav" aria-label="Navigation principale">
          {items.map((item) => {
              const Icon = item.icon;
              const active = item.id === page;
              return (
                <button
                  key={item.id}
                  type="button"
                  className={`bottom-nav-item${active ? ' is-active' : ''}`}
                  onClick={() => onNavigate(item.id)}
                  aria-current={active ? 'page' : undefined}
                  aria-label={
                    item.id === 'alertes' && toTreatTotal > 0
                      ? `Alertes, ${toTreatTotal} à traiter`
                      : undefined
                  }
                >
                  <Icon size={21} strokeWidth={1.9} aria-hidden="true" />
                  <span>{item.id === 'ventes' ? 'Ventes' : item.label.split(' ')[0]}</span>
                  {item.id === 'alertes' && toTreatTotal > 0 && (
                    <span className="bottom-nav-badge" aria-hidden="true">
                      {toTreatTotal > 99 ? '99+' : toTreatTotal}
                    </span>
                  )}
                </button>
              );
            })}
        </nav>
      </div>
    </div>
  );
}
