import { useState } from 'react';
import { ArrowLeftRight, Boxes, FileSpreadsheet, Layers, type LucideIcon } from 'lucide-react';
import type { ProfileSnapshot } from '../types';
import { Inventory } from './Inventory';
import { CatalogManager } from './CatalogManager';
import { StockMovements } from './StockMovements';
import { ImportExcel } from './ImportExcel';

type StockTab = 'niveaux' | 'catalogue' | 'mouvements' | 'import';

interface StockProps {
  readonly profile: ProfileSnapshot;
  readonly demo: boolean;
}

const TABS: readonly {
  readonly id: StockTab;
  readonly label: string;
  readonly icon: LucideIcon;
}[] = [
  { id: 'niveaux', label: 'Niveaux', icon: Boxes },
  { id: 'catalogue', label: 'Catalogue', icon: Layers },
  { id: 'mouvements', label: 'Mouvements', icon: ArrowLeftRight },
  { id: 'import', label: 'Import Excel', icon: FileSpreadsheet },
];

function initialTab(role: ProfileSnapshot['role']): StockTab {
  if (role !== 'admin') {
    return 'niveaux';
  }

  const requested = new URLSearchParams(window.location.search).get('onglet');
  const found = TABS.find((tab) => tab.id === requested);
  return found?.id ?? 'niveaux';
}

export function Stock({ profile, demo }: StockProps) {
  const [tab, setTab] = useState<StockTab>(() => initialTab(profile.role));

  const selectTab = (next: StockTab) => {
    setTab(next);
    const url = new URL(window.location.href);
    if (next === 'niveaux') {
      url.searchParams.delete('onglet');
    } else {
      url.searchParams.set('onglet', next);
    }
    window.history.replaceState({}, '', url);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  if (profile.role !== 'admin') {
    return <Inventory profile={profile} demo={demo} />;
  }

  return (
    <div className="stock-page">
      <nav className="stock-tabs" role="tablist" aria-label="Sections du stock">
        {TABS.map((entry) => {
          const Icon = entry.icon;
          const active = entry.id === tab;
          return (
            <button
              key={entry.id}
              type="button"
              role="tab"
              aria-selected={active}
              className={`stock-tab${active ? ' is-active' : ''}`}
              onClick={() => selectTab(entry.id)}
            >
              <Icon size={18} strokeWidth={1.9} aria-hidden="true" />
              {entry.label}
            </button>
          );
        })}
      </nav>

      {tab === 'niveaux' && <Inventory profile={profile} demo={demo} />}
      {tab === 'catalogue' && <CatalogManager onOpenImport={() => selectTab('import')} />}
      {tab === 'mouvements' && <StockMovements />}
      {tab === 'import' && <ImportExcel />}
    </div>
  );
}
