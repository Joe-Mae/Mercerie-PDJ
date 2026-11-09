import type { PaymentMethod } from '@mercerie/core';

export type SaleInputUnit = 'metre' | 'yard' | 'centimetre' | 'piece';
export type SalePricingUnit = 'metre' | 'yard' | 'piece';
export type SyncStatus = 'pending' | 'synced' | 'error';

export interface LocalSaleLine {
  readonly id: string;
  readonly variantId: string;
  readonly designation: string;
  readonly quantiteSaisie: number;
  readonly uniteSaisie: SaleInputUnit;
  readonly quantiteStock: number;
  readonly prixUnitaireXof: number;
  readonly prixPar: SalePricingUnit;
  readonly totalXof: number;
}

export interface LocalPayment {
  readonly id: string;
  readonly method: PaymentMethod;
  readonly montantXof: number;
  readonly referenceMobile: string | null;
  readonly montantRecuXof: number | null;
  readonly renduXof: number | null;
}

export interface LocalSale {
  readonly id: string;
  readonly userId: string;
  readonly deviceId: string;
  readonly sessionId: string;
  readonly reference: string;
  readonly dateVente: string;
  readonly caissierNom: string;
  readonly sousTotalXof: number;
  readonly remiseXof: number;
  readonly remiseMotif: string | null;
  readonly totalXof: number;
  readonly lines: readonly LocalSaleLine[];
  readonly payments: readonly LocalPayment[];
  syncStatus: SyncStatus;
  syncError: string | null;
  syncedAt: string | null;
}

export interface LocalSession {
  readonly id: string;
  readonly userId: string;
  readonly deviceId: string;
  readonly fondOuvertureXof: number;
  readonly ouverteAt: string;
  statut: 'open' | 'closed';
  fermeeAt: string | null;
  montantCompteXof: number | null;
  montantAttenduXof: number | null;
  ecartXof: number | null;
  syncStatus: SyncStatus;
  syncError: string | null;
}

export interface StockCache {
  readonly items: readonly unknown[];
  readonly categories: readonly unknown[];
  readonly savedAt: string;
}

export interface OpenSessionPayload {
  readonly id: string;
  readonly deviceId: string;
  readonly fondOuvertureXof: number;
  readonly ouverteAt: string;
}

export interface SaleOperationPayload {
  readonly id: string;
  readonly deviceId: string;
  readonly sessionId: string;
  readonly reference: string;
  readonly dateVente: string;
  readonly remiseXof: number;
  readonly remiseMotif: string | null;
  readonly lines: readonly {
    readonly variantId: string;
    readonly quantiteSaisie: number;
    readonly uniteSaisie: SaleInputUnit;
    readonly prixUnitaireXof: number;
  }[];
  readonly payments: readonly {
    readonly method: PaymentMethod;
    readonly montantXof: number;
    readonly referenceMobile: string | null;
    readonly montantRecuXof: number | null;
  }[];
}

export interface CloseSessionPayload {
  readonly id: string;
  readonly deviceId: string;
  readonly montantCompteXof: number;
  readonly fermeeAt: string;
}

interface OutboxBase {
  id: string;
  userId: string;
  deviceId: string;
  sequence: number;
  occurredAt: string;
  attempts: number;
  lastError: string | null;
  nextAttemptAt: number;
}

export interface OpenSessionOperation extends OutboxBase {
  kind: 'open_session';
  payload: OpenSessionPayload;
}

export interface SaleOperation extends OutboxBase {
  kind: 'sale';
  payload: SaleOperationPayload;
}

export interface CloseSessionOperation extends OutboxBase {
  kind: 'close_session';
  payload: CloseSessionPayload;
}

export type OutboxRecord = OpenSessionOperation | SaleOperation | CloseSessionOperation;
