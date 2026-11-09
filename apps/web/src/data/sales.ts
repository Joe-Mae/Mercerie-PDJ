import { getSupabase } from '../lib/supabase';

export type PaymentMethod = 'cash' | 'tmoney' | 'flooz';

export interface SalesDayPoint {
  readonly jour: string;
  readonly montantXof: number;
}

export interface SalesBestSeller {
  readonly articleId: string;
  readonly nom: string;
  readonly dimension: 'length' | 'unit';
  readonly quantite: number;
  readonly montantXof: number;
}

export interface SalesRecentTicket {
  readonly id: string;
  readonly reference: string;
  readonly dateVente: string;
  readonly lignes: number;
  readonly totalXof: number;
  readonly caissier: string;
  readonly methodes: readonly PaymentMethod[];
}

export interface SalesRegisterState {
  readonly ouverteAt: string;
  readonly fondOuvertureXof: number;
}

export interface SalesDashboard {
  readonly role: 'admin' | 'cashier';
  readonly jour: string;
  readonly periodeJours: number;
  readonly ventesJourXof: number;
  readonly ventesHierXof: number;
  readonly variationPct: number | null;
  readonly ticketsJour: number;
  readonly panierMoyenXof: number;
  readonly especesJourXof: number;
  readonly mobileJourXof: number;
  readonly beneficeJourXof: number | null;
  readonly coutJourXof: number | null;
  readonly lignesJour: number;
  readonly lignesAvecCoutJour: number;
  readonly serie: readonly SalesDayPoint[];
  readonly meilleuresVentes: readonly SalesBestSeller[];
  readonly dernieresVentes: readonly SalesRecentTicket[];
  readonly caisse: SalesRegisterState | null;
}

export type SalesTicketStatus = 'validated' | 'cancelled';

export interface SalesJournalTicket {
  readonly id: string;
  readonly reference: string;
  readonly statut: SalesTicketStatus;
  readonly dateVente: string;
  readonly heure: string;
  readonly lignes: number;
  readonly totalXof: number;
  readonly remiseXof: number;
  readonly caissier: string;
  readonly methodes: readonly PaymentMethod[];
  readonly annuleeAt: string | null;
  readonly annuleePar: string | null;
}

export interface SalesJournal {
  readonly role: 'admin' | 'cashier';
  readonly jour: string;
  readonly aujourdHui: string;
  readonly dernierJourVente: string | null;
  readonly ticketsValides: number;
  readonly ticketsAnnules: number;
  readonly totalXof: number;
  readonly remiseXof: number;
  readonly especesXof: number;
  readonly mobileXof: number;
  readonly coutXof: number | null;
  readonly beneficeXof: number | null;
  readonly tickets: readonly SalesJournalTicket[];
}

export type SaleLineKind = 'article' | 'service';
export type SaleQuantityUnit = 'metre' | 'yard' | 'centimetre' | 'piece';
export type SalePriceUnit = 'metre' | 'yard' | 'piece';

export interface SaleDetailLine {
  readonly id: string;
  readonly kind: SaleLineKind;
  readonly designation: string;
  readonly quantiteSaisie: number;
  readonly uniteSaisie: SaleQuantityUnit;
  readonly prixUnitaireXof: number;
  readonly prixPar: SalePriceUnit;
  readonly totalXof: number;
}

export interface SaleDetailPayment {
  readonly id: string;
  readonly method: PaymentMethod;
  readonly montantXof: number;
  readonly referenceMobile: string | null;
  readonly montantRecuXof: number | null;
  readonly renduXof: number | null;
}

export interface SaleDetail {
  readonly id: string;
  readonly reference: string;
  readonly statut: SalesTicketStatus;
  readonly dateVente: string;
  readonly heure: string;
  readonly caissier: string;
  readonly sousTotalXof: number;
  readonly remiseXof: number;
  readonly remiseMotif: string | null;
  readonly totalXof: number;
  readonly annuleeAt: string | null;
  readonly annuleePar: string | null;
  readonly lignes: readonly SaleDetailLine[];
  readonly paiements: readonly SaleDetailPayment[];
}

const PAYMENT_LABELS: Readonly<Record<PaymentMethod, string>> = {
  cash: 'Espèces',
  tmoney: 'T-Money',
  flooz: 'Flooz',
};

interface RpcErrorLike {
  readonly message: string;
  readonly code?: string;
}

function isPaymentMethod(value: string): value is PaymentMethod {
  return value === 'cash' || value === 'tmoney' || value === 'flooz';
}

export function paymentLabel(methodes: readonly PaymentMethod[]): string {
  const unique = [...new Set(methodes)];
  if (unique.length === 0) {
    return 'Paiement inconnu';
  }
  if (unique.length > 1) {
    return 'Mixte';
  }
  return PAYMENT_LABELS[unique[0] ?? 'cash'];
}

export function paymentTone(methodes: readonly PaymentMethod[]): string {
  return `method-${paymentLabel(methodes).toLowerCase().replace(/\s+/g, '-')}`;
}

export function dayKey(date: Date): string {
  return [
    String(date.getFullYear()),
    String(date.getMonth() + 1).padStart(2, '0'),
    String(date.getDate()).padStart(2, '0'),
  ].join('-');
}

export function shiftDay(day: string, days: number): string {
  const date = new Date(`${day}T12:00:00Z`);
  if (Number.isNaN(date.getTime())) {
    return day;
  }
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

export function journalDayLabel(day: string, today: string): string {
  if (!day) {
    return '';
  }
  if (day === today) {
    return 'Aujourd’hui';
  }
  if (today && day === shiftDay(today, -1)) {
    return 'Hier';
  }

  const date = new Date(`${day}T12:00:00Z`);
  if (Number.isNaN(date.getTime())) {
    return day;
  }

  const formatted = new Intl.DateTimeFormat('fr-FR', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    year: 'numeric',
    timeZone: 'UTC',
  }).format(date);
  return formatted.charAt(0).toUpperCase() + formatted.slice(1);
}

export function soldQuantityLabel(seller: SalesBestSeller): string {
  const quantity = seller.quantite.toLocaleString('fr-FR', { maximumFractionDigits: 2 });
  if (seller.dimension === 'length') {
    return `${quantity} m vendus`;
  }
  return `${quantity} unité${seller.quantite > 1 ? 's' : ''} vendue${seller.quantite > 1 ? 's' : ''}`;
}

export function shortDayLabel(iso: string): string {
  const date = new Date(`${iso}T12:00:00`);
  if (Number.isNaN(date.getTime())) {
    return iso;
  }
  const label = new Intl.DateTimeFormat('fr-FR', { weekday: 'short' }).format(date);
  return label.charAt(0).toUpperCase() + label.slice(1).replace('.', '');
}

export function emptySalesSeries(days = 7): readonly SalesDayPoint[] {
  const today = new Date();
  return Array.from({ length: days }, (_, index) => {
    const date = new Date(
      today.getFullYear(),
      today.getMonth(),
      today.getDate() - (days - 1 - index),
      12,
    );
    const jour = [
      String(date.getFullYear()),
      String(date.getMonth() + 1).padStart(2, '0'),
      String(date.getDate()).padStart(2, '0'),
    ].join('-');
    return { jour, montantXof: 0 };
  });
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function readNumber(value: unknown): number {
  return typeof value === 'number' && Number.isFinite(value) ? value : 0;
}

function readNullableNumber(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) ? value : null;
}

function readString(value: unknown, fallback = ''): string {
  return typeof value === 'string' ? value : fallback;
}

function readNullableString(value: unknown): string | null {
  return typeof value === 'string' && value.length > 0 ? value : null;
}

function readArray(value: unknown): readonly unknown[] {
  return Array.isArray(value) ? value : [];
}

function readMethods(value: unknown): PaymentMethod[] {
  return readArray(value)
    .filter((entry): entry is string => typeof entry === 'string')
    .filter(isPaymentMethod);
}

export async function loadSalesDashboard(days = 7): Promise<SalesDashboard> {
  const { data, error } = await getSupabase().rpc('get_sales_dashboard', { p_days: days });

  if (error) {
    throw new Error(dashboardError(error));
  }

  if (!isRecord(data)) {
    throw new Error('Le tableau de bord a renvoyé une réponse inattendue.');
  }

  const register = isRecord(data.caisse)
    ? {
        ouverteAt: readString(data.caisse.ouverte_at),
        fondOuvertureXof: readNumber(data.caisse.fond_ouverture_xof),
      }
    : null;

  return {
    role: data.role === 'admin' ? 'admin' : 'cashier',
    jour: readString(data.jour),
    periodeJours: readNumber(data.periode_jours),
    ventesJourXof: readNumber(data.ventes_jour_xof),
    ventesHierXof: readNumber(data.ventes_hier_xof),
    variationPct: readNullableNumber(data.variation_pct),
    ticketsJour: readNumber(data.tickets_jour),
    panierMoyenXof: readNumber(data.panier_moyen_xof),
    especesJourXof: readNumber(data.especes_jour_xof),
    mobileJourXof: readNumber(data.mobile_jour_xof),
    beneficeJourXof: readNullableNumber(data.benefice_jour_xof),
    coutJourXof: readNullableNumber(data.cout_jour_xof),
    lignesJour: readNumber(data.lignes_jour),
    lignesAvecCoutJour: readNumber(data.lignes_avec_cout_jour),
    serie: readArray(data.serie).map((entry) => {
      const point = isRecord(entry) ? entry : {};
      return {
        jour: readString(point.jour),
        montantXof: readNumber(point.montant_xof),
      };
    }),
    meilleuresVentes: readArray(data.meilleures_ventes).map((entry) => {
      const seller = isRecord(entry) ? entry : {};
      return {
        articleId: readString(seller.article_id),
        nom: readString(seller.nom),
        dimension: seller.dimension === 'unit' ? 'unit' : 'length',
        quantite: readNumber(seller.quantite),
        montantXof: readNumber(seller.montant_xof),
      };
    }),
    dernieresVentes: readArray(data.dernieres_ventes).map((entry) => {
      const sale = isRecord(entry) ? entry : {};
      return {
        id: readString(sale.id),
        reference: readString(sale.reference),
        dateVente: readString(sale.date_vente),
        lignes: readNumber(sale.lignes),
        totalXof: readNumber(sale.total_xof),
        caissier: readString(sale.caissier),
        methodes: readMethods(sale.methodes),
      };
    }),
    caisse: register,
  };
}

function dashboardError(error: RpcErrorLike): string {
  if (error.code === '42501' || /autre rôle|inactif|authentifié/i.test(error.message)) {
    return 'Le tableau de bord des ventes est réservé à l’équipe de caisse.';
  }
  if (/entre 1 et 31/i.test(error.message)) {
    return 'La période demandée est invalide.';
  }
  return 'Impossible de charger les ventes. Vérifie la connexion puis réessaie.';
}

export async function loadSalesJournal(day: string | null = null): Promise<SalesJournal> {
  const { data, error } = await getSupabase().rpc('get_sales_journal', { p_day: day });

  if (error) {
    throw new Error(journalError(error));
  }

  if (!isRecord(data)) {
    throw new Error('Le journal des ventes a renvoyé une réponse inattendue.');
  }

  return {
    role: data.role === 'admin' ? 'admin' : 'cashier',
    jour: readString(data.jour),
    aujourdHui: readString(data.aujourd_hui, readString(data.jour)),
    dernierJourVente: readNullableString(data.dernier_jour_vente),
    ticketsValides: readNumber(data.tickets_valides),
    ticketsAnnules: readNumber(data.tickets_annules),
    totalXof: readNumber(data.total_xof),
    remiseXof: readNumber(data.remise_xof),
    especesXof: readNumber(data.especes_xof),
    mobileXof: readNumber(data.mobile_xof),
    coutXof: readNullableNumber(data.cout_xof),
    beneficeXof: readNullableNumber(data.benefice_xof),
    tickets: readArray(data.tickets).map((entry) => {
      const ticket = isRecord(entry) ? entry : {};
      return {
        id: readString(ticket.id, readString(ticket.reference)),
        reference: readString(ticket.reference),
        statut: ticket.statut === 'cancelled' ? 'cancelled' : 'validated',
        dateVente: readString(ticket.date_vente),
        heure: readString(ticket.heure),
        lignes: readNumber(ticket.lignes),
        totalXof: readNumber(ticket.total_xof),
        remiseXof: readNumber(ticket.remise_xof),
        caissier: readString(ticket.caissier),
        methodes: readMethods(ticket.methodes),
        annuleeAt: readNullableString(ticket.annulee_at),
        annuleePar: readNullableString(ticket.annulee_par),
      };
    }),
  };
}

function readQuantityUnit(value: unknown): SaleQuantityUnit {
  return value === 'metre' || value === 'yard' || value === 'centimetre' ? value : 'piece';
}

function readPriceUnit(value: unknown): SalePriceUnit {
  return value === 'metre' || value === 'yard' ? value : 'piece';
}

function readPaymentMethod(value: unknown): PaymentMethod {
  return typeof value === 'string' && isPaymentMethod(value) ? value : 'cash';
}

export async function loadSaleDetail(saleId: string): Promise<SaleDetail> {
  const { data, error } = await getSupabase().rpc('get_sale_detail', { p_sale_id: saleId });

  if (error) {
    throw new Error(saleDetailError(error));
  }

  if (!isRecord(data)) {
    throw new Error('Le détail de la vente a renvoyé une réponse inattendue.');
  }

  return {
    id: readString(data.id),
    reference: readString(data.reference),
    statut: data.statut === 'cancelled' ? 'cancelled' : 'validated',
    dateVente: readString(data.date_vente),
    heure: readString(data.heure),
    caissier: readString(data.caissier),
    sousTotalXof: readNumber(data.sous_total_xof),
    remiseXof: readNumber(data.remise_xof),
    remiseMotif: readNullableString(data.remise_motif),
    totalXof: readNumber(data.total_xof),
    annuleeAt: readNullableString(data.annulee_at),
    annuleePar: readNullableString(data.annulee_par),
    lignes: readArray(data.lignes).map((entry) => {
      const line = isRecord(entry) ? entry : {};
      return {
        id: readString(line.id),
        kind: line.kind === 'service' ? 'service' : 'article',
        designation: readString(line.designation),
        quantiteSaisie: readNumber(line.quantite_saisie),
        uniteSaisie: readQuantityUnit(line.unite_saisie),
        prixUnitaireXof: readNumber(line.prix_unitaire_xof),
        prixPar: readPriceUnit(line.prix_par),
        totalXof: readNumber(line.total_xof),
      };
    }),
    paiements: readArray(data.paiements).map((entry) => {
      const payment = isRecord(entry) ? entry : {};
      return {
        id: readString(payment.id),
        method: readPaymentMethod(payment.method),
        montantXof: readNumber(payment.montant_xof),
        referenceMobile: readNullableString(payment.reference_mobile),
        montantRecuXof: readNullableNumber(payment.montant_recu_xof),
        renduXof: readNullableNumber(payment.rendu_xof),
      };
    }),
  };
}

function saleDetailError(error: RpcErrorLike): string {
  if (error.code === '42501' || /autre rôle|inactif|authentifié/i.test(error.message)) {
    return 'Le détail des ventes est réservé à l’équipe de caisse.';
  }
  if (error.code === 'P0002' || /introuvable/i.test(error.message)) {
    return 'Cette vente est introuvable.';
  }
  if (
    error.code === 'PGRST202' ||
    /could not find the function|in the schema cache/i.test(error.message)
  ) {
    return 'La mise à jour du serveur n’est pas encore installée. Préviens l’administrateur.';
  }
  return 'Impossible de charger le détail de la vente. Vérifie la connexion puis réessaie.';
}

function journalError(error: RpcErrorLike): string {
  if (error.code === '42501' || /autre rôle|inactif|authentifié/i.test(error.message)) {
    return 'Le journal des ventes est réservé à l’équipe de caisse.';
  }
  if (/journée à venir/i.test(error.message)) {
    return 'Cette journée n’est pas encore arrivée.';
  }
  if (
    error.code === 'PGRST202' ||
    /could not find the function|in the schema cache/i.test(error.message)
  ) {
    return 'La mise à jour du serveur n’est pas encore installée. Préviens l’administrateur.';
  }
  return 'Impossible de charger le journal. Vérifie la connexion puis réessaie.';
}
