import type { AppRole, ProfileSnapshot } from '../types';
import type { AlertEntry } from './alerts';
import type {
  PaymentMethod,
  SaleDetail,
  SaleDetailLine,
  SaleDetailPayment,
} from './sales';
import type { StockCategory, StockItem } from './stock';

export interface DemoProfile extends ProfileSnapshot {
  readonly role: AppRole;
}

export type DemoActor = AppRole | 'owner';

export const DEMO_BOUTIQUE_ID = 'b7e2c1a4-5d6f-4e8a-9b0c-1d2e3f4a5b6c';

export const DEMO_PROFILES: Readonly<Record<DemoActor, DemoProfile>> = {
  admin: {
    id: 'a0000000-0000-4000-8000-000000000001',
    boutique_id: DEMO_BOUTIQUE_ID,
    email: 'superadmin@merceriepdj.test',
    nom: 'Mme Adjovi',
    role: 'admin',
    est_superadmin: true,
  },
  owner: {
    id: 'a0000000-0000-4000-8000-000000000006',
    boutique_id: DEMO_BOUTIQUE_ID,
    email: 'proprietaire@merceriepdj.test',
    nom: 'Koffi',
    role: 'admin',
    est_superadmin: false,
  },
  cashier: {
    id: 'a0000000-0000-4000-8000-000000000002',
    boutique_id: DEMO_BOUTIQUE_ID,
    email: 'caisse@merceriepdj.test',
    nom: 'Awa',
    role: 'cashier',
    est_superadmin: false,
  },
  seller: {
    id: 'a0000000-0000-4000-8000-000000000003',
    boutique_id: DEMO_BOUTIQUE_ID,
    email: 'vente@merceriepdj.test',
    nom: 'Kossi',
    role: 'seller',
    est_superadmin: false,
  },
};

interface DemoStockSource {
  readonly id: string;
  readonly article: string;
  readonly categorie: string;
  readonly couleur: string;
  readonly codeCourt: string;
  readonly stock: number;
  readonly seuil: number;
  readonly dimension: 'length' | 'unit';
  readonly prixVente: number;
  readonly prixAchat: number;
}

const DEMO_CATEGORY_TISSUS: StockCategory = {
  id: 'demo-cat-tissus',
  nom: 'Tissus',
  codeCourt: 'TIS',
  actif: true,
};

const DEMO_CATEGORY_MERCERIE: StockCategory = {
  id: 'demo-cat-mercerie',
  nom: 'Mercerie',
  codeCourt: 'MER',
  actif: true,
};

export const DEMO_CATEGORIES: readonly StockCategory[] = [
  DEMO_CATEGORY_TISSUS,
  DEMO_CATEGORY_MERCERIE,
];

const DEMO_STOCK_SOURCE: readonly DemoStockSource[] = [
  {
    id: 'v-bazin-blanc',
    article: 'Bazin riche',
    categorie: 'Tissus',
    couleur: 'Blanc',
    codeCourt: 'BAZ-BL',
    stock: 350,
    seuil: 300,
    dimension: 'length',
    prixVente: 5000,
    prixAchat: 3400,
  },
  {
    id: 'v-bazin-bleu',
    article: 'Bazin riche',
    categorie: 'Tissus',
    couleur: 'Bleu roi',
    codeCourt: 'BAZ-BR',
    stock: 120,
    seuil: 300,
    dimension: 'length',
    prixVente: 5000,
    prixAchat: 3400,
  },
  {
    id: 'v-wax-jaune',
    article: 'Wax Hollandais',
    categorie: 'Tissus',
    couleur: 'Jaune',
    codeCourt: 'WAX-JA',
    stock: 540,
    seuil: 270,
    dimension: 'length',
    prixVente: 4500,
    prixAchat: 3000,
  },
  {
    id: 'v-wax-vert',
    article: 'Wax Hollandais',
    categorie: 'Tissus',
    couleur: 'Vert',
    codeCourt: 'WAX-VE',
    stock: 90,
    seuil: 180,
    dimension: 'length',
    prixVente: 4500,
    prixAchat: 3000,
  },
  {
    id: 'v-dentelle-rose',
    article: 'Dentelle brodée',
    categorie: 'Tissus',
    couleur: 'Rose poudré',
    codeCourt: 'DEN-RO',
    stock: 45,
    seuil: 180,
    dimension: 'length',
    prixVente: 7000,
    prixAchat: 4800,
  },
  {
    id: 'v-popeline-ecru',
    article: 'Popeline',
    categorie: 'Tissus',
    couleur: 'Écru',
    codeCourt: 'POP-EC',
    stock: 480,
    seuil: 200,
    dimension: 'length',
    prixVente: 2500,
    prixAchat: 1600,
  },
  {
    id: 'v-satin-bordeaux',
    article: 'Satin duchesse',
    categorie: 'Tissus',
    couleur: 'Bordeaux',
    codeCourt: 'SAT-BO',
    stock: 240,
    seuil: 180,
    dimension: 'length',
    prixVente: 6000,
    prixAchat: 4100,
  },
  {
    id: 'v-fil-noir',
    article: 'Fil polyester',
    categorie: 'Mercerie',
    couleur: 'Noir',
    codeCourt: 'FIL-NO',
    stock: 24,
    seuil: 12,
    dimension: 'unit',
    prixVente: 500,
    prixAchat: 280,
  },
  {
    id: 'v-fil-blanc',
    article: 'Fil polyester',
    categorie: 'Mercerie',
    couleur: 'Blanc',
    codeCourt: 'FIL-BL',
    stock: 6,
    seuil: 12,
    dimension: 'unit',
    prixVente: 500,
    prixAchat: 280,
  },
  {
    id: 'v-ruban-or',
    article: 'Ruban satin',
    categorie: 'Mercerie',
    couleur: 'Or',
    codeCourt: 'RUB-OR',
    stock: 9,
    seuil: 10,
    dimension: 'unit',
    prixVente: 1200,
    prixAchat: 700,
  },
  {
    id: 'v-bouton-nacre',
    article: 'Boutons nacre',
    categorie: 'Mercerie',
    couleur: 'Nacré',
    codeCourt: 'BOU-NA',
    stock: 8,
    seuil: 15,
    dimension: 'unit',
    prixVente: 250,
    prixAchat: 120,
  },
  {
    id: 'v-fermeture-noire',
    article: 'Fermeture éclair',
    categorie: 'Mercerie',
    couleur: 'Noire',
    codeCourt: 'FER-NO',
    stock: 0,
    seuil: 10,
    dimension: 'unit',
    prixVente: 750,
    prixAchat: 400,
  },
];

function articleIdFor(source: DemoStockSource): string {
  return `demo-article-${source.article
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')}`;
}

export const DEMO_STOCK: readonly StockItem[] = DEMO_STOCK_SOURCE.map((source) => {
  const category = source.categorie === 'Tissus' ? DEMO_CATEGORY_TISSUS : DEMO_CATEGORY_MERCERIE;

  return {
    id: source.id,
    articleId: articleIdFor(source),
    article: source.article,
    description: null,
    categoryId: category.id,
    category: category.nom,
    categoryCode: category.codeCourt,
    color: source.couleur,
    code: source.codeCourt,
    dimension: source.dimension,
    saleUnit: source.dimension === 'length' ? 'metre' : 'piece',
    salePrice: source.prixVente,
    purchasePrice: source.prixAchat,
    threshold: source.seuil,
    quantity: source.stock,
    active: true,
  };
});

export const DEMO_ALERTS: readonly AlertEntry[] = [
  {
    id: 'demo-alert-cash-gap',
    type: 'cash_gap',
    severity: 'critical',
    message:
      'Écart de caisse à la clôture : 10 000 XOF comptés pour 15 000 attendus (écart -5 000).',
    variantId: null,
    saleId: null,
    cashSessionId: null,
    resolvedAt: null,
    acknowledgedAt: null,
    acknowledgedBy: null,
    acknowledgedByName: null,
    createdAt: '2026-11-08T09:05:00.000Z',
  },
  {
    id: 'demo-alert-stock-bazin',
    type: 'low_stock',
    severity: 'warning',
    message: 'Stock bas : Bazin riche — Bleu roi (BAZ-BR), 120 cm pour un seuil de 300.',
    variantId: 'v-bazin-bleu',
    saleId: null,
    cashSessionId: null,
    resolvedAt: null,
    acknowledgedAt: null,
    acknowledgedBy: null,
    acknowledgedByName: null,
    createdAt: '2026-11-08T08:40:00.000Z',
  },
  {
    id: 'demo-alert-stock-fermeture',
    type: 'low_stock',
    severity: 'warning',
    message: 'Stock bas : Fermeture éclair — Noire (FER-NO), 0 unité(s) pour un seuil de 10.',
    variantId: 'v-fermeture-noire',
    saleId: null,
    cashSessionId: null,
    resolvedAt: null,
    acknowledgedAt: null,
    acknowledgedBy: null,
    acknowledgedByName: null,
    createdAt: '2026-11-08T08:12:00.000Z',
  },
  {
    id: 'demo-alert-stock-dentelle',
    type: 'low_stock',
    severity: 'warning',
    message: 'Stock bas : Dentelle brodée — Rose poudré (DEN-RO), 45 cm pour un seuil de 180.',
    variantId: 'v-dentelle-rose',
    saleId: null,
    cashSessionId: null,
    resolvedAt: null,
    acknowledgedAt: '2026-11-07T16:10:00.000Z',
    acknowledgedBy: DEMO_PROFILES.admin.id,
    acknowledgedByName: DEMO_PROFILES.admin.nom,
    createdAt: '2026-11-07T09:15:00.000Z',
  },
  {
    id: 'demo-alert-stock-wax',
    type: 'low_stock',
    severity: 'warning',
    message: 'Stock bas : Wax Hollandais — Vert (WAX-VE), 90 cm pour un seuil de 180.',
    variantId: 'v-wax-vert',
    saleId: null,
    cashSessionId: null,
    resolvedAt: '2026-11-06T18:00:00.000Z',
    acknowledgedAt: '2026-11-05T12:00:00.000Z',
    acknowledgedBy: DEMO_PROFILES.admin.id,
    acknowledgedByName: DEMO_PROFILES.admin.nom,
    createdAt: '2026-11-05T10:30:00.000Z',
  },
  {
    id: 'demo-alert-negative-fermeture',
    type: 'negative_stock',
    severity: 'critical',
    message: 'Stock négatif : Fermeture éclair — Noire (FER-NO), -2 unité(s).',
    variantId: 'v-fermeture-noire',
    saleId: null,
    cashSessionId: null,
    resolvedAt: '2026-11-04T17:30:00.000Z',
    acknowledgedAt: '2026-11-04T17:05:00.000Z',
    acknowledgedBy: DEMO_PROFILES.admin.id,
    acknowledgedByName: DEMO_PROFILES.admin.nom,
    createdAt: '2026-11-04T16:45:00.000Z',
  },
];

export interface DemoWeekPoint {
  readonly jour: string;
  readonly montant: number;
}

export const DEMO_WEEK: readonly DemoWeekPoint[] = [
  { jour: 'Lun', montant: 61_000 },
  { jour: 'Mar', montant: 74_500 },
  { jour: 'Mer', montant: 52_000 },
  { jour: 'Jeu', montant: 96_000 },
  { jour: 'Ven', montant: 108_500 },
  { jour: 'Sam', montant: 132_000 },
  { jour: 'Dim', montant: 87_500 },
];

export interface DemoBestSeller {
  readonly nom: string;
  readonly detail: string;
  readonly montant: number;
  readonly part: number;
}

export const DEMO_BEST_SELLERS: readonly DemoBestSeller[] = [
  { nom: 'Bazin riche', detail: '12,5 m vendus', montant: 62_500, part: 100 },
  { nom: 'Wax Hollandais', detail: '9,0 m vendus', montant: 40_500, part: 65 },
  { nom: 'Dentelle brodée', detail: '4,5 m vendus', montant: 31_500, part: 50 },
  { nom: 'Popeline', detail: '8,0 m vendus', montant: 20_000, part: 32 },
];

export interface DemoSaleArticle {
  readonly designation: string;
  readonly quantite: number;
  readonly unite: 'metre' | 'piece';
  readonly prix: number;
}

export interface DemoSale {
  readonly reference: string;
  readonly heure: string;
  readonly lignes: number;
  readonly moyen: 'Espèces' | 'T-Money' | 'Flooz' | 'Mixte';
  readonly total: number;
  readonly caissier: string;
  readonly articles: readonly DemoSaleArticle[];
}

export const DEMO_SALES: readonly DemoSale[] = [
  {
    reference: 'PDJ-00412',
    heure: '14:32',
    lignes: 2,
    moyen: 'Espèces',
    total: 12_500,
    caissier: 'Awa',
    articles: [
      { designation: 'Bazin riche — Blanc', quantite: 1.5, unite: 'metre', prix: 5000 },
      { designation: 'Fil polyester — Noir', quantite: 10, unite: 'piece', prix: 500 },
    ],
  },
  {
    reference: 'PDJ-00411',
    heure: '14:05',
    lignes: 1,
    moyen: 'T-Money',
    total: 9_000,
    caissier: 'Awa',
    articles: [
      { designation: 'Wax Hollandais — Jaune', quantite: 2, unite: 'metre', prix: 4500 },
    ],
  },
  {
    reference: 'PDJ-00410',
    heure: '13:48',
    lignes: 3,
    moyen: 'Mixte',
    total: 17_000,
    caissier: 'Awa',
    articles: [
      { designation: 'Satin duchesse — Bordeaux', quantite: 1.5, unite: 'metre', prix: 6000 },
      { designation: 'Ruban satin — Or', quantite: 5, unite: 'piece', prix: 1200 },
      { designation: 'Boutons nacre — Nacré', quantite: 8, unite: 'piece', prix: 250 },
    ],
  },
  {
    reference: 'PDJ-00409',
    heure: '12:20',
    lignes: 1,
    moyen: 'Flooz',
    total: 5_000,
    caissier: 'Awa',
    articles: [
      { designation: 'Bazin riche — Bleu roi', quantite: 1, unite: 'metre', prix: 5000 },
    ],
  },
  {
    reference: 'PDJ-00408',
    heure: '11:36',
    lignes: 2,
    moyen: 'Espèces',
    total: 14_000,
    caissier: 'Awa',
    articles: [
      { designation: 'Satin duchesse — Bordeaux', quantite: 1.5, unite: 'metre', prix: 6000 },
      { designation: 'Popeline — Écru', quantite: 2, unite: 'metre', prix: 2500 },
    ],
  },
];

export const DEMO_DAY = {
  ventes: 87_500,
  benefice: 26_400,
  tickets: 23,
  encaisse: 62_000,
  mobile: 25_500,
  panierMoyen: 3_804,
  caisseOuverte: '08:12',
  fondCaisse: 10_000,
};

export function demoPaymentMethods(moyen: DemoSale['moyen']): PaymentMethod[] {
  switch (moyen) {
    case 'T-Money':
      return ['tmoney'];
    case 'Flooz':
      return ['flooz'];
    case 'Mixte':
      return ['cash', 'tmoney'];
    default:
      return ['cash'];
  }
}

export function demoSaleDetail(reference: string): SaleDetail | null {
  const sale = DEMO_SALES.find((entry) => entry.reference === reference);
  if (!sale) {
    return null;
  }

  const lignes: SaleDetailLine[] = sale.articles.map((article, index) => ({
    id: `${sale.reference}-L${index}`,
    kind: 'article',
    designation: article.designation,
    quantiteSaisie: article.quantite,
    uniteSaisie: article.unite,
    prixUnitaireXof: article.prix,
    prixPar: article.unite === 'piece' ? 'piece' : 'metre',
    totalXof: Math.round(article.quantite * article.prix),
  }));

  const methods = demoPaymentMethods(sale.moyen);
  const firstAmount =
    methods.length === 1 ? sale.total : Math.floor(sale.total / 2000) * 1000;
  const paiements: SaleDetailPayment[] = methods.map((method, index) => ({
    id: `${sale.reference}-P${index}`,
    method,
    montantXof: index === 0 ? firstAmount : sale.total - firstAmount,
    referenceMobile: null,
    montantRecuXof: null,
    renduXof: null,
  }));

  const [hour, minute] = sale.heure.split(':');
  const date = new Date();
  date.setHours(Number(hour ?? 0), Number(minute ?? 0), 0, 0);

  return {
    id: sale.reference,
    reference: sale.reference,
    statut: 'validated',
    dateVente: date.toISOString(),
    heure: sale.heure,
    caissier: sale.caissier,
    sousTotalXof: sale.total,
    remiseXof: 0,
    remiseMotif: null,
    totalXof: sale.total,
    annuleeAt: null,
    annuleePar: null,
    lignes,
    paiements,
  };
}
