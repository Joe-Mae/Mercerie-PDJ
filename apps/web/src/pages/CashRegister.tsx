import { useMemo, useState } from 'react';
import {
  AlertTriangle,
  Banknote,
  CheckCircle2,
  Minus,
  Plus,
  Printer,
  ReceiptText,
  RefreshCw,
  Search,
  ShoppingCart,
  Smartphone,
  Trash2,
  Wallet,
} from 'lucide-react';
import {
  computeCashChange,
  computeLine,
  computeSaleTotals,
  validatePayments,
  xof,
  type InputUnit,
  type PaymentMethod,
} from '@mercerie/core';
import type { ProfileSnapshot } from '../types';
import { useStock } from '../data/StockProvider';
import { formatQuantity, unitLabel, type StockItem } from '../data/stock';
import { useOffline } from '../offline/OfflineProvider';
import type { LocalPayment, LocalSale, LocalSaleLine, SaleInputUnit } from '../offline/types';
import { money } from '../lib/format';
import { Modal } from '../ui/Modal';
import { PageHeader } from '../ui/PageHeader';

interface CashRegisterProps {
  readonly profile: ProfileSnapshot;
  readonly isOnline: boolean;
  readonly demo: boolean;
}

type PaymentMode = 'cash' | 'tmoney' | 'flooz' | 'mixte';

const PAYMENT_LABELS: Readonly<Record<PaymentMethod, string>> = {
  cash: 'Espèces',
  tmoney: 'T-Money',
  flooz: 'Flooz',
};

const PAYMENT_MODES: readonly { readonly id: PaymentMode; readonly label: string }[] = [
  { id: 'cash', label: 'Espèces' },
  { id: 'tmoney', label: 'T-Money' },
  { id: 'flooz', label: 'Flooz' },
  { id: 'mixte', label: 'Mixte' },
];

const INPUT_UNITS: Readonly<Record<SaleInputUnit, string>> = {
  metre: 'm',
  yard: 'yd',
  centimetre: 'cm',
  piece: 'u.',
};

const INPUT_UNIT_LABELS: Readonly<Record<SaleInputUnit, string>> = {
  metre: 'mètre',
  yard: 'yard',
  centimetre: 'centimètre',
  piece: 'pièce',
};

const QUANTITY_PATTERN = /^\d+(?:[.,]\d{1,3})?$/;

interface CartLine {
  readonly key: string;
  readonly variantId: string;
  quantity: string;
  unit: SaleInputUnit;
}

interface PricedLine {
  readonly cartKey: string;
  readonly item: StockItem;
  readonly line: LocalSaleLine;
  readonly totalXof: number;
}

function formatDateTime(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return value;
  }
  return `${date.toLocaleDateString('fr-FR')} à ${date.toLocaleTimeString('fr-FR', {
    hour: '2-digit',
    minute: '2-digit',
  })}`;
}

function formatDecimal(value: number): string {
  return new Intl.NumberFormat('fr-FR', { maximumFractionDigits: 3 }).format(value);
}

function wholeAmount(raw: string): number | null {
  const normalized = raw.replace(/[\s\u00A0]/g, '').replace(',', '.');
  if (normalized === '') {
    return 0;
  }
  if (!/^\d+$/.test(normalized)) {
    return null;
  }
  const value = Number(normalized);
  return Number.isSafeInteger(value) ? value : null;
}

function parseAmount(raw: string, label: string): number {
  const value = wholeAmount(raw);
  if (value === null) {
    throw new Error(`${label} doit être un montant entier en francs.`);
  }
  return value;
}

function inputUnit(unit: SaleInputUnit): InputUnit {
  if (unit === 'metre') {
    return 'm';
  }
  return unit === 'centimetre' ? 'cm' : unit;
}

function pricingQuantity(line: LocalSaleLine): number {
  if (line.prixPar === 'metre') {
    return line.quantiteStock / 100;
  }
  if (line.prixPar === 'yard') {
    return line.quantiteStock / 90;
  }
  return line.quantiteStock;
}

function priceCartLine(entry: CartLine, item: StockItem): PricedLine {
  const raw = entry.quantity.trim();
  if (!QUANTITY_PATTERN.test(raw)) {
    throw new Error('Saisis une quantité avec 3 décimales au maximum.');
  }
  if (item.dimension === 'unit' && entry.unit !== 'piece') {
    throw new Error('Cet article se vend à l’unité.');
  }

  const computation = computeLine({
    kind: 'article',
    quantity: raw,
    inputUnit: inputUnit(entry.unit),
    pricingUnit: item.saleUnit,
    unitPriceXof: xof(item.salePrice),
  });

  if (!computation.stock) {
    throw new Error('Cet article ne retire pas de stock.');
  }

  return {
    cartKey: entry.key,
    item,
    line: {
      id: entry.key,
      variantId: item.id,
      designation: `${item.article} — ${item.color}`,
      quantiteSaisie: Number(raw.replace(',', '.')),
      uniteSaisie: entry.unit,
      quantiteStock: computation.stock.value,
      prixUnitaireXof: item.salePrice,
      prixPar: item.saleUnit,
      totalXof: Number(computation.totalXof),
    },
    totalXof: Number(computation.totalXof),
  };
}

function bumpQuantity(raw: string): string {
  const value = Number(raw.replace(',', '.'));
  if (!Number.isFinite(value) || value <= 0) {
    return '1';
  }
  return String(value + 1).replace('.', ',');
}

function bumpQuantityDown(raw: string): string {
  const value = Number(raw.replace(',', '.'));
  if (!Number.isFinite(value) || value <= 1) {
    return '1';
  }
  return String(value - 1).replace('.', ',');
}

function changePreview(raw: string, totalXof: number): number | null {
  if (raw.trim() === '') {
    return 0;
  }
  const received = wholeAmount(raw);
  if (received === null || received < totalXof) {
    return null;
  }
  try {
    return Number(computeCashChange(xof(received), xof(totalXof)));
  } catch {
    return null;
  }
}

export function CashRegister({ profile, isOnline, demo }: CashRegisterProps) {
  const { session } = useOffline();

  if (!session) {
    return (
      <div className="page">
        <PageHeader
          eyebrow="Caisse"
          title="Ouvrir la caisse"
          description="Une session par appareil, des paiements tracés, aucun ticket supprimé."
        />
        <div className="cash-grid">
          <OpenSessionPanel demo={demo} />
          <SessionRules />
        </div>
      </div>
    );
  }

  if (session.statut === 'closed') {
    return (
      <div className="page">
        <PageHeader
          eyebrow="Caisse"
          title="Caisse clôturée"
          description="Le comptage et l’écart restent enregistrés. Ouvre une nouvelle session pour vendre."
        />
        <div className="cash-grid">
          <ClosedSessionPanel />
          <OpenSessionPanel demo={demo} />
        </div>
      </div>
    );
  }

  return <SaleDesk profile={profile} isOnline={isOnline} demo={demo} />;
}

function OpenSessionPanel({ demo }: { readonly demo: boolean }) {
  const { openSession } = useOffline();
  const [fond, setFond] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const submit = async () => {
    setBusy(true);
    setError(null);
    try {
      const amount = parseAmount(fond, 'Le fond de caisse');
      await openSession(amount);
      setFond('');
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'La caisse n’a pas pu être ouverte.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <section className="panel">
      <header className="panel-header">
        <div>
          <h2>Ouvrir une caisse</h2>
          <p>Compte le fond remis au caissier avant la première vente.</p>
        </div>
        <span className="panel-badge">Fermée</span>
      </header>

      <div className="cash-open-form">
        <label className="field">
          <span>Fond de caisse (F CFA)</span>
          <input
            value={fond}
            onChange={(event) => setFond(event.target.value)}
            inputMode="numeric"
            placeholder="10 000"
            autoComplete="off"
          />
          <small>Laisser vide si aucun fond n’est remis.</small>
        </label>

        {error && <p className="form-error">{error}</p>}

        <button
          type="button"
          className="button button-gold button-block"
          onClick={() => void submit()}
          disabled={busy}
        >
          <Wallet size={18} aria-hidden="true" />
          {busy ? 'Ouverture…' : 'Ouvrir la caisse'}
        </button>

        {demo && (
          <p className="form-hint">
            Aperçu : ouvre la caisse pour dérouler une vente complète avec les données fictives.
          </p>
        )}
      </div>
    </section>
  );
}

function SessionRules() {
  return (
    <section className="panel">
      <header className="panel-header">
        <div>
          <h2>La caisse en trois gestes</h2>
          <p>Pensée pour une tablette et un usage rapide.</p>
        </div>
      </header>

      <ol className="steps steps-large">
        <li>
          <span>1</span>
          <div>
            <strong>Choisir l’article</strong>
            <p>Recherche par nom, couleur ou code court, puis appui pour l’ajouter.</p>
          </div>
          <ShoppingCart size={19} aria-hidden="true" />
        </li>
        <li>
          <span>2</span>
          <div>
            <strong>Ajuster la mesure</strong>
            <p>Mètre, centimètre ou yard. Règle PDJ : 1 yard = 90 cm.</p>
          </div>
          <ReceiptText size={19} aria-hidden="true" />
        </li>
        <li>
          <span>3</span>
          <div>
            <strong>Encaisser</strong>
            <p>Espèces, T-Money, Flooz ou paiement mixte, puis ticket imprimable.</p>
          </div>
          <Banknote size={19} aria-hidden="true" />
        </li>
      </ol>

      <p className="rule-warning">
        <AlertTriangle size={16} aria-hidden="true" />
        Hors ligne, les ventes et paiements restent possibles. Les remises sont bloquées.
      </p>
    </section>
  );
}

function ClosedSessionPanel() {
  const { session, sales } = useOffline();

  const sessionSales = useMemo(
    () => (session ? sales.filter((sale) => sale.sessionId === session.id) : []),
    [sales, session],
  );
  const mobileXof = useMemo(
    () =>
      sessionSales.reduce(
        (sum, sale) =>
          sum +
          sale.payments
            .filter((payment) => payment.method !== 'cash')
            .reduce((lineSum, payment) => lineSum + payment.montantXof, 0),
        0,
      ),
    [sessionSales],
  );

  if (!session) {
    return null;
  }

  const gap = session.ecartXof ?? 0;
  const gapTone = gap === 0 ? 'is-ok' : gap < 0 ? 'is-short' : 'is-over';
  const gapLabel = gap === 0 ? 'Caisse juste' : gap < 0 ? 'Manque en caisse' : 'Excédent en caisse';

  return (
    <section className="panel">
      <header className="panel-header">
        <div>
          <h2>Caisse clôturée</h2>
          <p>
            {session.fermeeAt ? formatDateTime(session.fermeeAt) : 'Clôture enregistrée'} ·{' '}
            {sessionSales.length} ticket{sessionSales.length === 1 ? '' : 's'}
          </p>
        </div>
        <span className="panel-badge">Clôturée</span>
      </header>

      <div className={`cash-balance cash-gap ${gapTone}`}>
        <span className="balance-icon">
          {gap === 0 ? (
            <CheckCircle2 size={22} aria-hidden="true" />
          ) : (
            <AlertTriangle size={22} aria-hidden="true" />
          )}
        </span>
        <div>
          <span>{gapLabel}</span>
          <strong>{money(Math.abs(gap))}</strong>
          <small>
            Attendu {money(session.montantAttenduXof ?? 0)} · compté{' '}
            {money(session.montantCompteXof ?? 0)}
          </small>
        </div>
      </div>

      <dl className="cash-breakdown">
        <div>
          <dt>
            <Wallet size={16} aria-hidden="true" /> Fond
          </dt>
          <dd>{money(session.fondOuvertureXof)}</dd>
        </div>
        <div>
          <dt>
            <Smartphone size={16} aria-hidden="true" /> Mobile money
          </dt>
          <dd>{money(mobileXof)}</dd>
        </div>
        <div>
          <dt>
            <ReceiptText size={16} aria-hidden="true" /> Tickets
          </dt>
          <dd>{sessionSales.length}</dd>
        </div>
      </dl>

      {sessionSales.length > 0 && (
        <ul className="closed-sales">
          {sessionSales.slice(0, 8).map((sale) => (
            <li key={sale.id}>
              <span>
                <strong>{sale.reference}</strong>
                <small>{formatDateTime(sale.dateVente)}</small>
              </span>
              <span>
                {sale.syncStatus === 'synced' ? 'Synchro' : 'En attente'} ·{' '}
                <strong>{money(sale.totalXof)}</strong>
              </span>
            </li>
          ))}
        </ul>
      )}

      {session.syncStatus !== 'synced' && (
        <p className="form-hint">
          {session.syncStatus === 'error'
            ? `Clôture bloquée : ${session.syncError ?? 'synchronisation à reprendre.'}`
            : 'Clôture enregistrée sur l’appareil, en attente de synchronisation.'}
        </p>
      )}
    </section>
  );
}

function SaleDesk({
  profile,
  isOnline,
  demo,
}: {
  readonly profile: ProfileSnapshot;
  readonly isOnline: boolean;
  readonly demo: boolean;
}) {
  const {
    session,
    sales,
    totals,
    pendingCount,
    syncError,
    completeSale,
    closeSession,
    pendingDeltaFor,
  } = useOffline();
  const { items, loading: stockLoading, cached, error: stockError } = useStock();

  const [search, setSearch] = useState('');
  const [cart, setCart] = useState<readonly CartLine[]>([]);
  const [paymentMode, setPaymentMode] = useState<PaymentMode>('cash');
  const [cashReceived, setCashReceived] = useState('');
  const [mobileMethod, setMobileMethod] = useState<'tmoney' | 'flooz'>('tmoney');
  const [mobileReference, setMobileReference] = useState('');
  const [mixedCash, setMixedCash] = useState('');
  const [discountEnabled, setDiscountEnabled] = useState(false);
  const [discountAmount, setDiscountAmount] = useState('');
  const [discountReason, setDiscountReason] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [saleError, setSaleError] = useState<string | null>(null);
  const [ticket, setTicket] = useState<LocalSale | null>(null);
  const [closeOpen, setCloseOpen] = useState(false);
  const [counted, setCounted] = useState('');
  const [closeError, setCloseError] = useState<string | null>(null);
  const [closeBusy, setCloseBusy] = useState(false);

  const itemById = useMemo(() => new Map(items.map((item) => [item.id, item])), [items]);

  const filteredItems = useMemo(() => {
    const needle = search.trim().toLowerCase();
    return items
      .filter((item) => item.active)
      .filter((item) => {
        if (!needle) {
          return true;
        }
        return `${item.article} ${item.color} ${item.code} ${item.category}`
          .toLowerCase()
          .includes(needle);
      })
      .sort(
        (left, right) =>
          left.article.localeCompare(right.article, 'fr') ||
          left.color.localeCompare(right.color, 'fr'),
      );
  }, [items, search]);

  const pricedResult = useMemo(() => {
    const priced: PricedLine[] = [];
    const errors = new Map<string, string>();

    for (const entry of cart) {
      const item = itemById.get(entry.variantId);
      if (!item) {
        errors.set(entry.key, 'Article introuvable dans le stock local.');
        continue;
      }
      try {
        priced.push(priceCartLine(entry, item));
      } catch (cause) {
        errors.set(
          entry.key,
          cause instanceof Error ? cause.message : 'Quantité ou unité invalide.',
        );
      }
    }

    return {
      priced,
      errors,
      byKey: new Map(priced.map((entry) => [entry.cartKey, entry])),
    };
  }, [cart, itemById]);

  const subtotalXof = useMemo(
    () => pricedResult.priced.reduce((sum, entry) => sum + entry.totalXof, 0),
    [pricedResult.priced],
  );

  const canDiscount = profile.role === 'admin' && (demo || isOnline);
  const discountParsed = wholeAmount(discountAmount);
  const discountXof = canDiscount && discountEnabled ? (discountParsed ?? 0) : 0;
  const totalXof = Math.max(0, subtotalXof - discountXof);

  const sessionSales = useMemo(
    () => sales.filter((sale) => sale.sessionId === session?.id),
    [sales, session?.id],
  );
  const mobileXof = useMemo(
    () =>
      sessionSales.reduce(
        (sum, sale) =>
          sum +
          sale.payments
            .filter((payment) => payment.method !== 'cash')
            .reduce((lineSum, payment) => lineSum + payment.montantXof, 0),
        0,
      ),
    [sessionSales],
  );

  const cashChange = paymentMode === 'cash' ? changePreview(cashReceived, totalXof) : null;
  const mixedCashValue = wholeAmount(mixedCash);
  const mixedMobilePart =
    mixedCashValue !== null && mixedCashValue > 0 && mixedCashValue < totalXof
      ? totalXof - mixedCashValue
      : null;

  const liveTicket = useMemo(
    () => (ticket ? (sales.find((sale) => sale.id === ticket.id) ?? ticket) : null),
    [sales, ticket],
  );

  const addItem = (item: StockItem) => {
    const unit: SaleInputUnit = item.dimension === 'unit' ? 'piece' : 'metre';
    setSaleError(null);
    setCart((current) => {
      const index = current.findIndex(
        (entry) => entry.variantId === item.id && entry.unit === unit,
      );
      if (index === -1) {
        return [...current, { key: crypto.randomUUID(), variantId: item.id, quantity: '1', unit }];
      }
      return current.map((entry, entryIndex) =>
        entryIndex === index ? { ...entry, quantity: bumpQuantity(entry.quantity) } : entry,
      );
    });
  };

  const updateLine = (key: string, changes: Partial<Pick<CartLine, 'quantity' | 'unit'>>) => {
    setSaleError(null);
    setCart((current) =>
      current.map((entry) => (entry.key === key ? { ...entry, ...changes } : entry)),
    );
  };

  const removeLine = (key: string) => {
    setSaleError(null);
    setCart((current) => current.filter((entry) => entry.key !== key));
  };

  const resetSale = () => {
    setCart([]);
    setPaymentMode('cash');
    setCashReceived('');
    setMobileMethod('tmoney');
    setMobileReference('');
    setMixedCash('');
    setDiscountEnabled(false);
    setDiscountAmount('');
    setDiscountReason('');
    setSaleError(null);
  };

  const buildPayments = (dueXof: number): LocalPayment[] => {
    if (dueXof <= 0) {
      throw new Error('Le total doit être supérieur à zéro pour encaisser.');
    }

    if (paymentMode === 'cash') {
      const received = cashReceived.trim() ? parseAmount(cashReceived, 'Le montant reçu') : dueXof;
      if (received < dueXof) {
        throw new Error('Le montant reçu est inférieur au total à payer.');
      }
      return [
        {
          id: crypto.randomUUID(),
          method: 'cash',
          montantXof: dueXof,
          referenceMobile: null,
          montantRecuXof: received,
          renduXof: received - dueXof,
        },
      ];
    }

    if (paymentMode === 'tmoney' || paymentMode === 'flooz') {
      const reference = mobileReference.trim();
      if (reference.length < 3) {
        throw new Error('Saisis la référence Mobile Money (au moins 3 caractères).');
      }
      return [
        {
          id: crypto.randomUUID(),
          method: paymentMode,
          montantXof: dueXof,
          referenceMobile: reference,
          montantRecuXof: null,
          renduXof: null,
        },
      ];
    }

    const cashPart = parseAmount(mixedCash, 'La part en espèces');
    if (cashPart <= 0) {
      throw new Error('Saisis la part payée en espèces.');
    }
    if (cashPart >= dueXof) {
      throw new Error(
        'La part en espèces doit être inférieure au total pour laisser une part Mobile Money.',
      );
    }
    const reference = mobileReference.trim();
    if (reference.length < 3) {
      throw new Error('Saisis la référence Mobile Money (au moins 3 caractères).');
    }

    return [
      {
        id: crypto.randomUUID(),
        method: 'cash',
        montantXof: cashPart,
        referenceMobile: null,
        montantRecuXof: cashPart,
        renduXof: 0,
      },
      {
        id: crypto.randomUUID(),
        method: mobileMethod,
        montantXof: dueXof - cashPart,
        referenceMobile: reference,
        montantRecuXof: null,
        renduXof: null,
      },
    ];
  };

  const validate = async () => {
    if (!session || session.statut !== 'open') {
      setSaleError('La caisse n’est plus ouverte. Rouvre une session avant de vendre.');
      return;
    }

    setSubmitting(true);
    setSaleError(null);
    try {
      if (cart.length === 0) {
        throw new Error('Ajoute au moins un article avant d’encaisser.');
      }
      if (pricedResult.errors.size > 0) {
        throw new Error('Corrige les quantités signalées avant d’encaisser.');
      }
      if (pricedResult.priced.length !== cart.length) {
        throw new Error('Une ligne du ticket est incomplète.');
      }

      let remise = 0;
      let motif: string | null = null;
      if (canDiscount && discountEnabled) {
        remise = parseAmount(discountAmount, 'La remise');
        if (remise > subtotalXof) {
          throw new Error('La remise ne peut pas dépasser le sous-total.');
        }
        if (remise > 0) {
          const trimmed = discountReason.trim();
          if (trimmed.length < 3) {
            throw new Error('Le motif de la remise est obligatoire (au moins 3 caractères).');
          }
          motif = trimmed;
        }
      }

      const computed = computeSaleTotals(
        pricedResult.priced.map((entry) => xof(entry.totalXof)),
        xof(remise),
      );
      const payments = buildPayments(Number(computed.totalXof));

      validatePayments(
        computed.totalXof,
        payments.map((payment) => ({
          method: payment.method,
          amountXof: xof(payment.montantXof),
          ...(payment.referenceMobile ? { reference: payment.referenceMobile } : {}),
        })),
      );

      const sale = await completeSale({
        lines: pricedResult.priced.map((entry) => entry.line),
        payments,
        sousTotalXof: Number(computed.subtotalXof),
        remiseXof: Number(computed.discountXof),
        remiseMotif: motif,
        totalXof: Number(computed.totalXof),
        caissierNom: profile.nom,
      });

      setTicket(sale);
      resetSale();
    } catch (cause) {
      setSaleError(cause instanceof Error ? cause.message : 'La vente n’a pas été enregistrée.');
    } finally {
      setSubmitting(false);
    }
  };

  const requestClose = () => {
    if (cart.length > 0) {
      const confirmed = window.confirm(
        'Le ticket en cours sera abandonné. Veux-tu vraiment clôturer la caisse ?',
      );
      if (!confirmed) {
        return;
      }
      resetSale();
    }
    setCloseError(null);
    setCounted('');
    setCloseOpen(true);
  };

  const submitClose = async () => {
    setCloseBusy(true);
    setCloseError(null);
    try {
      if (counted.trim() === '') {
        throw new Error('Saisis le montant compté dans le tiroir.');
      }
      const countedXof = parseAmount(counted, 'Le montant compté');
      await closeSession(countedXof);
      setCloseOpen(false);
      setCounted('');
    } catch (cause) {
      setCloseError(cause instanceof Error ? cause.message : 'La caisse n’a pas pu être clôturée.');
    } finally {
      setCloseBusy(false);
    }
  };

  const countedValue = counted.trim() === '' ? null : wholeAmount(counted);
  const expectedXof = totals.expectedXof;
  const closeGap = countedValue === null ? null : countedValue - expectedXof;

  return (
    <div className="page cashier-page">
      <PageHeader
        eyebrow="Caisse"
        title="Encaisser une vente"
        description="Choisis l’article, ajuste la mesure, puis encaisse. Tout reste possible hors ligne."
        actions={
          <button
            type="button"
            className="button button-ghost"
            onClick={requestClose}
            disabled={closeBusy}
          >
            <Wallet size={17} aria-hidden="true" />
            Clôturer la caisse
          </button>
        }
      />

      <section className="cashier-status">
        <div className="cashier-status-balance">
          <span>Espèces attendues dans le tiroir</span>
          <strong>{money(expectedXof)}</strong>
          <small>
            Fond {money(session?.fondOuvertureXof ?? 0)} + ventes espèces{' '}
            {money(totals.cashSalesXof)}
          </small>
        </div>
        <div className="cashier-status-chips">
          <span className="cashier-chip">
            <ReceiptText size={15} aria-hidden="true" /> {totals.saleCount} ticket
            {totals.saleCount === 1 ? '' : 's'}
          </span>
          <span className="cashier-chip">
            <Smartphone size={15} aria-hidden="true" /> {money(mobileXof)}
          </span>
          <span className={`cashier-chip${pendingCount > 0 ? ' is-pending' : ''}`}>
            <RefreshCw size={15} aria-hidden="true" />
            {pendingCount > 0 ? `${pendingCount} en attente` : 'Tout est synchronisé'}
          </span>
        </div>
        {syncError && (
          <p className="cashier-sync-error">
            <AlertTriangle size={15} aria-hidden="true" /> {syncError}
          </p>
        )}
      </section>

      <div className="cashier-grid">
        <section className="panel cashier-catalog-panel">
          <header className="panel-header">
            <div>
              <h2>Choisir un article</h2>
              <p>Appuie sur un article pour l’ajouter au ticket.</p>
            </div>
            <span className="panel-badge">{filteredItems.length}</span>
          </header>

          <label className="search-field cashier-search">
            <Search size={17} aria-hidden="true" />
            <input
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder="Nom, couleur ou code court…"
              aria-label="Rechercher un article"
            />
          </label>

          {cached && (
            <p className="cashier-cache-note">
              Stock mémorisé sur l’appareil. Les ventes restent possibles hors ligne.
            </p>
          )}

          {stockError && <p className="form-error">{stockError}</p>}

          {stockLoading && items.length === 0 ? (
            <p className="form-hint">Chargement du stock…</p>
          ) : filteredItems.length === 0 ? (
            <div className="empty-state">
              <span className="empty-icon">
                <Search size={22} aria-hidden="true" />
              </span>
              <strong>Aucun article trouvé</strong>
              <p>Essaie un autre nom, une couleur ou un code court.</p>
            </div>
          ) : (
            <ul className="cashier-catalog">
              {filteredItems.map((item) => {
                const available = item.quantity + pendingDeltaFor(item.id);
                return (
                  <li key={item.id}>
                    <button type="button" className="cashier-item" onClick={() => addItem(item)}>
                      <span className="cashier-item-body">
                        <strong>
                          {item.article} <em>{item.color}</em>
                        </strong>
                        <small>
                          {item.code} · {money(item.salePrice)} / {unitLabel(item.saleUnit)}
                        </small>
                      </span>
                      <span className={`cashier-item-stock${available <= 0 ? ' is-out' : ''}`}>
                        {formatQuantity(available, item)}
                      </span>
                      <span className="cashier-item-add" aria-hidden="true">
                        <Plus size={17} />
                      </span>
                    </button>
                  </li>
                );
              })}
            </ul>
          )}
        </section>

        <section className="panel cashier-ticket-panel">
          <header className="panel-header">
            <div>
              <h2>Ticket en cours</h2>
              <p>
                {cart.length === 0
                  ? 'Le ticket est vide.'
                  : `${cart.length} ligne${cart.length === 1 ? '' : 's'} · ${
                      PAYMENT_MODES.find((mode) => mode.id === paymentMode)?.label ?? 'Espèces'
                    }`}
              </p>
            </div>
            {cart.length > 0 && (
              <button type="button" className="text-button" onClick={resetSale}>
                <Trash2 size={15} aria-hidden="true" />
                Vider
              </button>
            )}
          </header>

          {cart.length === 0 ? (
            <div className="empty-state">
              <span className="empty-icon">
                <ShoppingCart size={22} aria-hidden="true" />
              </span>
              <strong>Commence par un article</strong>
              <p>Le ticket se construit à gauche, la mesure s’ajuste ici.</p>
            </div>
          ) : (
            <ul className="sale-lines">
              {cart.map((entry) => {
                const item = itemById.get(entry.variantId);
                const priced = pricedResult.byKey.get(entry.key);
                const lineError = pricedResult.errors.get(entry.key);

                return (
                  <li key={entry.key} className={lineError ? 'has-error' : ''}>
                    <div className="sale-line-head">
                      <div>
                        <strong>
                          {item ? `${item.article} — ${item.color}` : 'Article inconnu'}
                        </strong>
                        <small>
                          {item ? `${money(item.salePrice)} / ${unitLabel(item.saleUnit)}` : '—'}
                        </small>
                      </div>
                      <span className="sale-line-total">
                        {priced ? money(priced.totalXof) : '—'}
                      </span>
                    </div>

                    <div className="sale-line-controls">
                      <div className="sale-qty-field">
                        <button
                          type="button"
                          className="icon-button"
                          onClick={() =>
                            updateLine(entry.key, {
                              quantity: bumpQuantityDown(entry.quantity),
                            })
                          }
                          aria-label="Diminuer la quantité"
                        >
                          <Minus size={16} aria-hidden="true" />
                        </button>
                        <input
                          value={entry.quantity}
                          onChange={(event) =>
                            updateLine(entry.key, { quantity: event.target.value })
                          }
                          inputMode="decimal"
                          aria-label={`Quantité pour ${item?.article ?? 'l’article'}`}
                        />
                        <button
                          type="button"
                          className="icon-button"
                          onClick={() =>
                            updateLine(entry.key, {
                              quantity: bumpQuantity(entry.quantity),
                            })
                          }
                          aria-label="Augmenter la quantité"
                        >
                          <Plus size={16} aria-hidden="true" />
                        </button>
                      </div>

                      {item?.dimension === 'length' ? (
                        <select
                          className="sale-unit-select"
                          value={entry.unit}
                          onChange={(event) =>
                            updateLine(entry.key, {
                              unit: event.target.value as SaleInputUnit,
                            })
                          }
                          aria-label="Unité de saisie"
                        >
                          {(Object.keys(INPUT_UNITS) as SaleInputUnit[])
                            .filter((unit) => unit !== 'piece')
                            .map((unit) => (
                              <option key={unit} value={unit}>
                                {INPUT_UNIT_LABELS[unit]}
                              </option>
                            ))}
                        </select>
                      ) : (
                        <span className="sale-unit-fixed">à l’unité</span>
                      )}

                      <button
                        type="button"
                        className="icon-button sale-remove"
                        onClick={() => removeLine(entry.key)}
                        aria-label="Retirer la ligne"
                      >
                        <Trash2 size={16} aria-hidden="true" />
                      </button>
                    </div>

                    {lineError && <p className="sale-line-error">{lineError}</p>}
                  </li>
                );
              })}
            </ul>
          )}

          <div className="sale-totals">
            <div>
              <span>Sous-total</span>
              <strong>{money(subtotalXof)}</strong>
            </div>
            {discountXof > 0 && (
              <div>
                <span>Remise</span>
                <strong>− {money(discountXof)}</strong>
              </div>
            )}
            <div className="sale-total-due">
              <span>Total à payer</span>
              <strong>{money(totalXof)}</strong>
            </div>
          </div>

          {canDiscount && (
            <div className="discount-box">
              <label className="checkbox-field">
                <input
                  type="checkbox"
                  checked={discountEnabled}
                  onChange={(event) => {
                    setDiscountEnabled(event.target.checked);
                    setSaleError(null);
                  }}
                />
                <span>Remise administrateur</span>
              </label>

              {discountEnabled && (
                <div className="discount-fields">
                  <label className="field">
                    <span>Montant (F CFA)</span>
                    <input
                      value={discountAmount}
                      onChange={(event) => setDiscountAmount(event.target.value)}
                      inputMode="numeric"
                      placeholder="0"
                    />
                  </label>
                  <label className="field">
                    <span>Motif</span>
                    <input
                      value={discountReason}
                      onChange={(event) => setDiscountReason(event.target.value)}
                      placeholder="Ex. Geste commercial"
                      maxLength={200}
                    />
                  </label>
                </div>
              )}

              {discountParsed === null && (
                <p className="sale-line-error">Le montant de la remise doit être un entier.</p>
              )}
            </div>
          )}

          <div className="payment-box">
            <div className="payment-modes" role="group" aria-label="Moyen de paiement">
              {PAYMENT_MODES.map((mode) => (
                <button
                  key={mode.id}
                  type="button"
                  className={paymentMode === mode.id ? 'is-active' : undefined}
                  onClick={() => {
                    setPaymentMode(mode.id);
                    setSaleError(null);
                  }}
                  aria-pressed={paymentMode === mode.id}
                >
                  {mode.label}
                </button>
              ))}
            </div>

            {paymentMode === 'cash' && (
              <div className="payment-fields">
                <label className="field">
                  <span>Montant reçu (F CFA)</span>
                  <input
                    value={cashReceived}
                    onChange={(event) => setCashReceived(event.target.value)}
                    inputMode="numeric"
                    placeholder={String(totalXof)}
                  />
                  <small>Laisser vide pour le montant exact.</small>
                </label>
                <div className={`cash-change${cashChange === null ? ' is-error' : ''}`}>
                  <span>Monnaie à rendre</span>
                  <strong>{cashChange === null ? '—' : money(cashChange)}</strong>
                </div>
              </div>
            )}

            {(paymentMode === 'tmoney' || paymentMode === 'flooz') && (
              <div className="payment-fields">
                <label className="field">
                  <span>Référence {PAYMENT_LABELS[paymentMode]}</span>
                  <input
                    value={mobileReference}
                    onChange={(event) => setMobileReference(event.target.value)}
                    placeholder="Ex. MP240811.1432.A12345"
                    maxLength={60}
                  />
                  <small>Le numéro de transaction affiché sur le téléphone du client.</small>
                </label>
                <div className="cash-change">
                  <span>Montant Mobile Money</span>
                  <strong>{money(totalXof)}</strong>
                </div>
              </div>
            )}

            {paymentMode === 'mixte' && (
              <div className="payment-fields">
                <label className="field">
                  <span>Part en espèces (F CFA)</span>
                  <input
                    value={mixedCash}
                    onChange={(event) => setMixedCash(event.target.value)}
                    inputMode="numeric"
                    placeholder="0"
                  />
                </label>
                <label className="field">
                  <span>Part Mobile Money</span>
                  <div className="segmented segmented-wrap">
                    <button
                      type="button"
                      className={mobileMethod === 'tmoney' ? 'is-active' : undefined}
                      onClick={() => setMobileMethod('tmoney')}
                    >
                      T-Money
                    </button>
                    <button
                      type="button"
                      className={mobileMethod === 'flooz' ? 'is-active' : undefined}
                      onClick={() => setMobileMethod('flooz')}
                    >
                      Flooz
                    </button>
                  </div>
                  <small>
                    {mixedMobilePart === null
                      ? 'La part en espèces doit être inférieure au total.'
                      : `Reste ${money(mixedMobilePart)} en ${PAYMENT_LABELS[mobileMethod]}.`}
                  </small>
                </label>
                <label className="field field-full">
                  <span>Référence {PAYMENT_LABELS[mobileMethod]}</span>
                  <input
                    value={mobileReference}
                    onChange={(event) => setMobileReference(event.target.value)}
                    placeholder="Ex. MP240811.1432.A12345"
                    maxLength={60}
                  />
                </label>
              </div>
            )}
          </div>

          {saleError && <p className="form-error">{saleError}</p>}

          <button
            type="button"
            className="button button-gold button-block cashier-validate"
            onClick={() => void validate()}
            disabled={submitting || cart.length === 0 || pricedResult.errors.size > 0}
          >
            <CheckCircle2 size={19} aria-hidden="true" />
            {submitting ? 'Enregistrement…' : `Encaisser ${money(totalXof)}`}
          </button>

          <p className="form-hint">
            {canDiscount
              ? 'La vente est enregistrée localement puis synchronisée une seule fois.'
              : 'Les remises sont réservées aux administrateurs connectés.'}
          </p>
        </section>
      </div>

      {closeOpen && (
        <Modal
          title="Clôturer la caisse"
          subtitle="Compte les espèces présentes dans le tiroir avant de confirmer."
          onClose={() => setCloseOpen(false)}
          footer={
            <>
              <button
                type="button"
                className="button button-ghost"
                onClick={() => setCloseOpen(false)}
                disabled={closeBusy}
              >
                Annuler
              </button>
              <button
                type="button"
                className="button button-gold"
                onClick={() => void submitClose()}
                disabled={closeBusy}
              >
                <CheckCircle2 size={18} aria-hidden="true" />
                {closeBusy ? 'Clôture…' : 'Confirmer la clôture'}
              </button>
            </>
          }
        >
          <div className="close-session-summary">
            <div>
              <span>Espèces attendues</span>
              <strong>{money(expectedXof)}</strong>
            </div>
            <div>
              <span>Tickets de la session</span>
              <strong>{totals.saleCount}</strong>
            </div>
          </div>

          <label className="field">
            <span>Montant compté dans le tiroir (F CFA)</span>
            <input
              value={counted}
              onChange={(event) => setCounted(event.target.value)}
              inputMode="numeric"
              placeholder={String(expectedXof)}
              autoFocus
            />
          </label>

          <div
            className={`close-gap${
              closeGap === null || closeGap === 0 ? '' : closeGap < 0 ? ' is-short' : ' is-over'
            }`}
          >
            <span>Écart de caisse</span>
            <strong>{closeGap === null ? '—' : money(closeGap)}</strong>
          </div>

          {closeGap !== null && closeGap !== 0 && (
            <p className="form-hint">
              {closeGap < 0
                ? 'Il manque de l’argent dans le tiroir. L’écart sera enregistré et signalé.'
                : 'Il y a plus d’argent que prévu. L’écart sera enregistré et signalé.'}
            </p>
          )}

          {closeError && <p className="form-error">{closeError}</p>}
        </Modal>
      )}

      {liveTicket && (
        <Modal
          title="Ticket de vente"
          subtitle={
            liveTicket.syncStatus === 'synced'
              ? `${liveTicket.reference} · synchronisé`
              : `${liveTicket.reference} · en attente de synchronisation`
          }
          onClose={() => setTicket(null)}
          footer={
            <>
              <button type="button" className="button button-ghost" onClick={() => window.print()}>
                <Printer size={17} aria-hidden="true" />
                Imprimer
              </button>
              <button type="button" className="button button-gold" onClick={() => setTicket(null)}>
                Nouvelle vente
              </button>
            </>
          }
        >
          <Receipt sale={liveTicket} />
          {liveTicket.syncStatus !== 'synced' && (
            <p className="form-hint">
              Ticket enregistré sur l’appareil. Il sera envoyé au serveur dès que le réseau revient.
            </p>
          )}
        </Modal>
      )}
    </div>
  );
}

function Receipt({ sale }: { readonly sale: LocalSale }) {
  const paid = sale.payments.reduce((sum, payment) => sum + payment.montantXof, 0);

  return (
    <article className="receipt">
      <header className="receipt-brand">
        <strong>MERCERIE PDJ</strong>
        <span>Puits de Jacob — Lomé</span>
        <span>Ticket de vente</span>
      </header>

      <div className="receipt-meta">
        <span>
          Référence <strong>{sale.reference}</strong>
        </span>
        <span>
          Date <strong>{formatDateTime(sale.dateVente)}</strong>
        </span>
        <span>
          Caissier <strong>{sale.caissierNom}</strong>
        </span>
      </div>

      <ul className="receipt-lines">
        {sale.lines.map((line) => (
          <li key={line.id}>
            <div>
              <strong>{line.designation}</strong>
              <span>
                {formatDecimal(pricingQuantity(line))} {INPUT_UNITS[line.prixPar]} ×{' '}
                {money(line.prixUnitaireXof)}
              </span>
            </div>
            <strong>{money(line.totalXof)}</strong>
          </li>
        ))}
      </ul>

      <div className="receipt-totals">
        <div>
          <span>Sous-total</span>
          <strong>{money(sale.sousTotalXof)}</strong>
        </div>
        {sale.remiseXof > 0 && (
          <div>
            <span>Remise{sale.remiseMotif ? ` (${sale.remiseMotif})` : ''}</span>
            <strong>− {money(sale.remiseXof)}</strong>
          </div>
        )}
        <div className="receipt-due">
          <span>Total</span>
          <strong>{money(sale.totalXof)}</strong>
        </div>
      </div>

      <div className="receipt-payments">
        {sale.payments.map((payment) => (
          <div key={payment.id}>
            <span>
              {PAYMENT_LABELS[payment.method]}
              {payment.referenceMobile ? ` · ${payment.referenceMobile}` : ''}
            </span>
            <strong>{money(payment.montantXof)}</strong>
          </div>
        ))}
        <div>
          <span>Total payé</span>
          <strong>{money(paid)}</strong>
        </div>
        {sale.payments
          .filter((payment) => payment.method === 'cash' && (payment.renduXof ?? 0) > 0)
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
          {sale.syncStatus === 'synced'
            ? 'Ticket synchronisé.'
            : 'Enregistré sur cet appareil, en attente de synchronisation.'}
        </span>
      </footer>
    </article>
  );
}
