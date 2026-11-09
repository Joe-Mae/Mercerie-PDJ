import { ArrowRight, ClipboardList, Package, Users } from 'lucide-react';
import type { ProfileSnapshot } from '../types';
import { PageHeader } from '../ui/PageHeader';

interface PrepareSaleProps {
  readonly profile: ProfileSnapshot;
  readonly demo: boolean;
}

export function PrepareSale({ demo }: PrepareSaleProps) {
  return (
    <div className="page">
      <PageHeader
        eyebrow="Préparation"
        title="Préparer une vente pour le caissier"
        description="Le vendeur conseille et prépare, le caissier crée le ticket et encaisse."
      />

      <div className="cash-grid">
        <section className="panel">
          <header className="panel-header">
            <div>
              <h2>La fiche de préparation</h2>
              <p>
                {demo
                  ? 'Aperçu du parcours vendeur.'
                  : 'Le parcours sera activé à l’étape suivante.'}
              </p>
            </div>
            <span className="panel-badge">Étape suivante</span>
          </header>

          <div className="prep-summary">
            <div>
              <span>Client</span>
              <strong>—</strong>
            </div>
            <div>
              <span>Lignes préparées</span>
              <strong>0</strong>
            </div>
            <div>
              <span>Total indicatif</span>
              <strong>0 F CFA</strong>
            </div>
          </div>

          <button type="button" className="button button-gold button-block" disabled>
            Commencer une préparation
            <ArrowRight size={18} aria-hidden="true" />
          </button>
          <p className="form-hint">
            Aucun encaissement, aucune remise et aucune annulation ne sont possibles depuis le
            compte vendeur.
          </p>
        </section>

        <section className="panel">
          <header className="panel-header">
            <div>
              <h2>Ton rôle, simplement</h2>
              <p>Trois repères pour servir vite et sans erreur.</p>
            </div>
          </header>

          <ul className="role-checklist">
            <li>
              <span className="role-check-icon">
                <Users size={18} aria-hidden="true" />
              </span>
              <div>
                <strong>Conseille le client</strong>
                <p>Cherche l’article et la couleur avec lui, sans le faire attendre.</p>
              </div>
            </li>
            <li>
              <span className="role-check-icon">
                <Package size={18} aria-hidden="true" />
              </span>
              <div>
                <strong>Vérifie la disponibilité</strong>
                <p>Les seuils sont visibles, mais seule la vente retire du stock.</p>
              </div>
            </li>
            <li>
              <span className="role-check-icon">
                <ClipboardList size={18} aria-hidden="true" />
              </span>
              <div>
                <strong>Transmets au caissier</strong>
                <p>Le caissier valide le ticket et choisit le moyen de paiement.</p>
              </div>
            </li>
          </ul>
        </section>
      </div>
    </div>
  );
}
