import { useEffect, useState } from 'react';
import { Printer } from 'lucide-react';
import { demoSaleDetail } from '../data/demo';
import {
  loadSaleDetail,
  paymentLabel,
  type SaleDetail,
  type SalePriceUnit,
  type SaleQuantityUnit,
} from '../data/sales';
import { money } from '../lib/format';
import { Modal } from './Modal';

const INPUT_UNITS: Readonly<Record<SaleQuantityUnit, string>> = {
  metre: 'm',
  yard: 'yd',
  centimetre: 'cm',
  piece: 'u.',
};

const PRICE_UNITS: Readonly<Record<SalePriceUnit, string>> = {
  metre: '/ m',
  yard: '/ yd',
  piece: '/ u.',
};

function formatDecimal(value: number): string {
  return new Intl.NumberFormat('fr-FR', { maximumFractionDigits: 3 }).format(value);
}

function formatSaleDate(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return value;
  }
  return new Intl.DateTimeFormat('fr-FR', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    timeZone: 'Africa/Lome',
  }).format(date);
}

interface SaleTicketModalProps {
  readonly saleId: string;
  readonly reference: string;
  readonly demo: boolean;
  readonly onClose: () => void;
}

export function SaleTicketModal({ saleId, reference, demo, onClose }: SaleTicketModalProps) {
  const [detail, setDetail] = useState<SaleDetail | null>(() =>
    demo ? demoSaleDetail(reference) : null,
  );
  const [loading, setLoading] = useState(!demo);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (demo) {
      setDetail(demoSaleDetail(reference));
      setError(null);
      setLoading(false);
      return;
    }

    let active = true;
    setDetail(null);
    setError(null);
    setLoading(true);

    loadSaleDetail(saleId)
      .then((next) => {
        if (active) {
          setDetail(next);
        }
      })
      .catch((reason: unknown) => {
        if (active) {
          setError(
            reason instanceof Error ? reason.message : 'Impossible de charger le détail de la vente.',
          );
        }
      })
      .finally(() => {
        if (active) {
          setLoading(false);
        }
      });

    return () => {
      active = false;
    };
  }, [demo, reference, saleId]);

  return (
    <Modal
      title="Ticket de vente"
      subtitle={detail ? `${detail.reference} · ${detail.heure}` : reference}
      onClose={onClose}
      footer={
        <>
          <button
            type="button"
            className="button button-ghost"
            onClick={() => window.print()}
            disabled={!detail}
          >
            <Printer size={17} aria-hidden="true" />
            Imprimer
          </button>
          <button type="button" className="button button-gold" onClick={onClose}>
            Fermer
          </button>
        </>
      }
    >
      {loading && <p className="form-hint">Chargement du ticket…</p>}
      {error && <p className="form-error">{error}</p>}
      {detail && <SaleReceipt detail={detail} />}
    </Modal>
  );
}

function SaleReceipt({ detail }: { readonly detail: SaleDetail }) {
  const paid = detail.paiements.reduce((sum, payment) => sum + payment.montantXof, 0);
  const cancelled = detail.statut === 'cancelled';

  return (
    <article className="receipt">
      <header className="receipt-brand">
        <strong>MERCERIE PDJ</strong>
        <span>Puits de Jacob — Lomé</span>
        <span>Ticket de vente</span>
      </header>

      {cancelled && (
        <p className="receipt-cancelled">
          Vente annulée{detail.annuleePar ? ` par ${detail.annuleePar}` : ''}
          {detail.annuleeAt ? ` le ${formatSaleDate(detail.annuleeAt)}` : ''}.
        </p>
      )}

      <div className="receipt-meta">
        <span>
          Référence <strong>{detail.reference}</strong>
        </span>
        <span>
          Date{' '}
          <strong>
            {formatSaleDate(detail.dateVente)} · {detail.heure}
          </strong>
        </span>
        <span>
          Caissier <strong>{detail.caissier}</strong>
        </span>
      </div>

      <ul className="receipt-lines">
        {detail.lignes.map((line) => (
          <li key={line.id}>
            <div>
              <strong>{line.designation}</strong>
              <span>
                {formatDecimal(line.quantiteSaisie)} {INPUT_UNITS[line.uniteSaisie]} ×{' '}
                {money(line.prixUnitaireXof)} {PRICE_UNITS[line.prixPar]}
              </span>
            </div>
            <strong>{money(line.totalXof)}</strong>
          </li>
        ))}
      </ul>

      <div className="receipt-totals">
        <div>
          <span>Sous-total</span>
          <strong>{money(detail.sousTotalXof)}</strong>
        </div>
        {detail.remiseXof > 0 && (
          <div>
            <span>Remise{detail.remiseMotif ? ` (${detail.remiseMotif})` : ''}</span>
            <strong>− {money(detail.remiseXof)}</strong>
          </div>
        )}
        <div className="receipt-due">
          <span>Total</span>
          <strong>{money(detail.totalXof)}</strong>
        </div>
      </div>

      <div className="receipt-payments">
        {detail.paiements.map((payment) => (
          <div key={payment.id}>
            <span>
              {paymentLabel([payment.method])}
              {payment.referenceMobile ? ` · ${payment.referenceMobile}` : ''}
            </span>
            <strong>{money(payment.montantXof)}</strong>
          </div>
        ))}
        <div>
          <span>Total payé</span>
          <strong>{money(paid)}</strong>
        </div>
        {detail.paiements
          .filter((payment) => (payment.renduXof ?? 0) > 0)
          .map((payment) => (
            <div key={`change-${payment.id}`}>
              <span>Monnaie rendue</span>
              <strong>{money(payment.renduXof ?? 0)}</strong>
            </div>
          ))}
      </div>

      <footer className="receipt-footer">
        <span>Merci de votre visite.</span>
        <span>
          {cancelled
            ? 'Vente annulée — conservée dans le journal.'
            : 'Ticket conservé dans le journal des ventes.'}
        </span>
      </footer>
    </article>
  );
}
