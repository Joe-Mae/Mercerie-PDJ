export type AppRole = 'admin' | 'cashier' | 'seller';

export interface Profile {
  readonly id: string;
  readonly boutique_id: string;
  readonly email: string;
  readonly nom: string;
  readonly role: AppRole;
  readonly actif: boolean;
  readonly est_superadmin: boolean;
}

export interface ProfileSnapshot {
  readonly id: string;
  readonly boutique_id: string;
  readonly email: string;
  readonly nom: string;
  readonly role: AppRole;
  readonly est_superadmin: boolean;
}

export const ROLE_LABELS: Readonly<Record<AppRole, string>> = {
  admin: 'Administrateur',
  cashier: 'Caissier',
  seller: 'Vendeur',
};
