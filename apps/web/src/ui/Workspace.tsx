import { useState } from 'react';
import type { AppRole, ProfileSnapshot } from '../types';
import { AlertsProvider } from '../data/AlertsProvider';
import { StockProvider } from '../data/StockProvider';
import { OfflineProvider } from '../offline/OfflineProvider';
import { AppShell } from './AppShell';
import type { PageId } from './pages';
import { Alerts } from '../pages/Alerts';
import { Dashboard } from '../pages/Dashboard';
import { CashRegister } from '../pages/CashRegister';
import { Stock } from '../pages/Stock';
import { Sales } from '../pages/Sales';
import { PrepareSale } from '../pages/PrepareSale';
import { Team } from '../pages/Team';

const ALLOWED_PAGES: Readonly<Record<AppRole, readonly PageId[]>> = {
  admin: ['dashboard', 'alertes', 'caisse', 'inventaire', 'ventes', 'equipe'],
  cashier: ['dashboard', 'alertes', 'caisse', 'inventaire', 'ventes'],
  seller: ['dashboard', 'alertes', 'preparer', 'inventaire'],
};

function allowedPages(profile: ProfileSnapshot): readonly PageId[] {
  const pages = ALLOWED_PAGES[profile.role];
  return profile.est_superadmin ? pages : pages.filter((page) => page !== 'equipe');
}

function initialPage(profile: ProfileSnapshot, demo: boolean): PageId {
  if (!demo) {
    return 'dashboard';
  }

  const requested = new URLSearchParams(window.location.search).get('page') as PageId | null;
  return requested && allowedPages(profile).includes(requested) ? requested : 'dashboard';
}

interface WorkspaceProps {
  readonly profile: ProfileSnapshot;
  readonly isOnline: boolean;
  readonly demo: boolean;
  readonly onLock: () => void;
  readonly onSignOut: () => void;
}

export function Workspace({ profile, isOnline, demo, onLock, onSignOut }: WorkspaceProps) {
  const [page, setPage] = useState<PageId>(() => initialPage(profile, demo));

  const navigate = (next: PageId) => {
    setPage(next);
    if (demo) {
      const url = new URL(window.location.href);
      url.searchParams.set('page', next);
      window.history.replaceState({}, '', url);
    }
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  return (
    <StockProvider role={profile.role} demo={demo}>
      <OfflineProvider userId={profile.id} isOnline={isOnline} demo={demo}>
        <AlertsProvider userId={profile.id} userName={profile.nom} role={profile.role} demo={demo}>
          <AppShell
            profile={profile}
            page={page}
            isOnline={isOnline}
            demo={demo}
            onNavigate={navigate}
            onLock={onLock}
            onSignOut={onSignOut}
          >
            {page === 'dashboard' && (
              <Dashboard profile={profile} demo={demo} onNavigate={navigate} />
            )}
            {page === 'alertes' && <Alerts profile={profile} demo={demo} />}
            {page === 'caisse' && (
              <CashRegister profile={profile} isOnline={isOnline} demo={demo} />
            )}
            {page === 'inventaire' && <Stock profile={profile} demo={demo} />}
            {page === 'ventes' && <Sales profile={profile} demo={demo} />}
            {page === 'preparer' && <PrepareSale profile={profile} demo={demo} />}
            {page === 'equipe' && profile.est_superadmin && (
              <Team profile={profile} demo={demo} />
            )}
          </AppShell>
        </AlertsProvider>
      </OfflineProvider>
    </StockProvider>
  );
}
