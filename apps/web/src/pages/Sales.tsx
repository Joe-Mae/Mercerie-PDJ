import { useState } from 'react';
import { ChevronLeft, ChevronRight, Coins, ReceiptText, RefreshCw, TrendingUp } from 'lucide-react';
import type { ProfileSnapshot } from '../types';
import {
  dayKey,
  journalDayLabel,
  paymentLabel,
  paymentTone,
  shiftDay,
  type SalesJournalTicket,
} from '../data/sales';
import { useSalesJournal } from '../data/useSalesJournal';
import { money } from '../lib/format';
import { PageHeader } from '../ui/PageHeader';
import { SaleTicketModal } from '../ui/SaleTicketModal';

interface SalesProps {
  readonly profile: ProfileSnapshot;
  readonly demo: boolean;
}

function profitHint(
  data: {
    readonly beneficeXof: number | null;
    readonly totalXof: number;
    readonly ticketsValides: number;
  } | null,
): string {
  if (!data) {
    return 'Chargement du journal…';
  }
  if (data.beneficeXof === null) {
    return data.ticketsValides > 0 ? 'Coûts d’achat incomplets' : 'Aucune vente à calculer';
  }
  if (data.totalXof > 0) {
    const margin = Math.round((data.beneficeXof / data.totalXof) * 100);
    return `Marge brute de ${margin} %`;
  }
  return 'Calculé sur les coûts d’achat';
}

function ticketsHint(data: { readonly ticketsAnnules: number } | null): string {
  if (!data) {
    return 'Chargement du journal…';
  }
  if (data.ticketsAnnules === 0) {
    return 'Aucun ticket annulé';
  }
  const plural = data.ticketsAnnules > 1;
  return `${data.ticketsAnnules} ticket${plural ? 's' : ''} annulé${plural ? 's' : ''}, exclu${plural ? 's' : ''} du total`;
}

export function Sales({ profile, demo }: SalesProps) {
  const [day, setDay] = useState<string | null>(null);
  const [openTicket, setOpenTicket] = useState<SalesJournalTicket | null>(null);
  const { data, loading, error, refresh } = useSalesJournal(profile, demo, day);

  const aujourdHui = dayKey(new Date());
  const jour = day ?? data?.jour ?? aujourdHui;
  const today = data?.aujourdHui ?? aujourdHui;
  const tickets = data?.tickets ?? [];
  const isToday = jour === today;
  const canGoNext = !demo && jour < today;
  const total = data?.totalXof ?? 0;
  const ticketsValides = data?.ticketsValides ?? 0;
  const basket = ticketsValides > 0 ? Math.round(total / ticketsValides) : 0;
  const dayTitle = demo ? 'Aujourd’hui' : journalDayLabel(jour, today);
  const lastSaleDay = data?.dernierJourVente ?? null;
  const otherDayWithSales = Boolean(lastSaleDay && lastSaleDay !== jour);

  const goToPrevious = () => {
    if (jour) {
      setDay(shiftDay(jour, -1));
    }
  };

  const goToNext = () => {
    if (!canGoNext) {
      return;
    }
    const next = shiftDay(jour, 1);
    setDay(next === today ? null : next);
  };

  const goToLastSale = () => {
    if (!lastSaleDay) {
      return;
    }
    setDay(lastSaleDay === today ? null : lastSaleDay);
  };

  return (
    <div className="page">
      <PageHeader
        eyebrow="Journal des ventes"
        title="Les tickets de la journée"
        description="Chaque vente est conservée avec son moyen de paiement. Une vente annulée reste visible mais ne compte pas dans le total."
        actions={
          !demo ? (
            <button
              type="button"
              className="button button-ghost"
              onClick={() => void refresh()}
              disabled={loading}
            >
              <RefreshCw size={17} aria-hidden="true" />
              Actualiser
            </button>
          ) : undefined
        }
      />

      {!demo && (
        <section className="journal-daybar" aria-label="Journée du journal">
          <button
            type="button"
            className="icon-button"
            onClick={goToPrevious}
            disabled={!jour || loading}
            aria-label="Journée précédente"
          >
            <ChevronLeft size={18} aria-hidden="true" />
          </button>
          <div className="journal-daybar-label">
            <strong>{dayTitle}</strong>
            <span>{jour}</span>
          </div>
          <button
            type="button"
            className="icon-button"
            onClick={goToNext}
            disabled={!canGoNext || loading}
            aria-label="Journée suivante"
          >
            <ChevronRight size={18} aria-hidden="true" />
          </button>
          {jour && !isToday && (
            <button type="button" className="text-button" onClick={() => setDay(null)}>
              Aujourd’hui
            </button>
          )}
        </section>
      )}

      <section className="inventory-summary">
        <div className="summary-chip">
          <ReceiptText size={18} aria-hidden="true" />
          <div>
            <strong>{data ? String(ticketsValides) : '—'}</strong>
            <span>{ticketsHint(data)}</span>
          </div>
        </div>
        <div className="summary-chip">
          <TrendingUp size={18} aria-hidden="true" />
          <div>
            <strong>{data ? money(total) : '—'}</strong>
            <span>
              {data
                ? `Espèces ${money(data.especesXof)} · Mobile ${money(data.mobileXof)}`
                : 'Chargement du journal…'}
            </span>
          </div>
        </div>
        {profile.role === 'admin' ? (
          <div className="summary-chip">
            <Coins size={18} aria-hidden="true" />
            <div>
              <strong>{data?.beneficeXof != null ? money(data.beneficeXof) : '—'}</strong>
              <span>{profitHint(data)}</span>
            </div>
          </div>
        ) : (
          <div className="summary-chip">
            <ReceiptText size={18} aria-hidden="true" />
            <div>
              <strong>{data ? money(basket) : '—'}</strong>
              <span>panier moyen</span>
            </div>
          </div>
        )}
      </section>

      <section className="panel">
        <header className="panel-header">
          <div>
            <h2>{dayTitle}</h2>
            <p>
              {loading && !data
                ? 'Chargement des tickets…'
                : tickets.length > 0
                  ? `${tickets.length} ticket${tickets.length > 1 ? 's' : ''} · les plus récents en premier`
                  : 'Les tickets validés et annulés de la journée.'}
            </p>
          </div>
          <span className="panel-badge">
            {demo ? 'Aperçu' : profile.role === 'admin' ? 'Direction' : 'Caisse'}
          </span>
        </header>

        {error && <p className="form-error">{error}</p>}

        {loading && !data ? (
          <div className="empty-state empty-state-wide">
            <span className="empty-icon">
              <ReceiptText size={24} strokeWidth={1.7} aria-hidden="true" />
            </span>
            <strong>Chargement du journal…</strong>
            <p>Les tickets de la journée s’affichent dès que le serveur répond.</p>
          </div>
        ) : tickets.length > 0 ? (
          <ul className="ticket-list">
            {tickets.map((ticket) => {
              const cancelled = ticket.statut === 'cancelled';
              return (
                <li key={ticket.id}>
                  <button
                    type="button"
                    className={`ticket-row ticket-row-button${cancelled ? ' is-cancelled' : ''}`}
                    onClick={() => setOpenTicket(ticket)}
                    aria-label={`Voir le ticket ${ticket.reference}`}
                  >
                    <span className="ticket-mark">
                      <ReceiptText size={18} aria-hidden="true" />
                    </span>
                    <span className="ticket-body">
                      <strong>
                        {ticket.reference}
                        {cancelled && <span className="ticket-void">Annulée</span>}
                      </strong>
                      <span>
                        {ticket.heure} · {ticket.lignes} ligne
                        {ticket.lignes > 1 ? 's' : ''} · Caissier {ticket.caissier}
                        {ticket.remiseXof > 0 ? ` · remise ${money(ticket.remiseXof)}` : ''}
                      </span>
                      {cancelled && ticket.annuleePar && (
                        <span>Annulée par {ticket.annuleePar}</span>
                      )}
                    </span>
                    <span className={`method-pill ${paymentTone(ticket.methodes)}`}>
                      {paymentLabel(ticket.methodes)}
                    </span>
                    <span className={`ticket-total${cancelled ? ' is-cancelled' : ''}`}>
                      {money(ticket.totalXof)}
                    </span>
                  </button>
                </li>
              );
            })}
          </ul>
        ) : (
          !error && (
            <div className="empty-state empty-state-wide">
              <span className="empty-icon">
                <ReceiptText size={24} strokeWidth={1.7} aria-hidden="true" />
              </span>
              <strong>Le journal est vide</strong>
              <p>
                {otherDayWithSales && lastSaleDay
                  ? `Aucune vente ce jour-là. La dernière vente enregistrée date du ${journalDayLabel(lastSaleDay, today).toLowerCase()}.`
                  : 'Chaque vente validée s’ajoutera ici, avec son ticket, son moyen de paiement et son caissier.'}
              </p>
              {otherDayWithSales && (
                <button
                  type="button"
                  className="text-button text-button-center"
                  onClick={goToLastSale}
                >
                  Afficher la dernière journée de vente
                </button>
              )}
            </div>
          )
        )}
      </section>

      {openTicket && (
        <SaleTicketModal
          saleId={openTicket.id}
          reference={openTicket.reference}
          demo={demo}
          onClose={() => setOpenTicket(null)}
        />
      )}
    </div>
  );
}
