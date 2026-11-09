import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import type { AppRole, Profile } from '../types';

const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL?.trim() ?? '';
const SUPABASE_KEY = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY?.trim() ?? '';

const DEVICE_STORAGE_KEY = 'mercerie.device.v1';
const ROLES: readonly AppRole[] = ['admin', 'cashier', 'seller'];

export const isSupabaseConfigured = SUPABASE_URL.length > 0 && SUPABASE_KEY.length > 0;

let client: SupabaseClient | null = null;

export function getSupabase(): SupabaseClient {
  if (!isSupabaseConfigured) {
    throw new Error('La connexion au serveur n’est pas configurée sur cet appareil.');
  }

  client ??= createClient(SUPABASE_URL, SUPABASE_KEY, {
    auth: {
      persistSession: false,
      autoRefreshToken: true,
      detectSessionInUrl: false,
    },
  });

  return client;
}

export interface AuthErrorLike {
  readonly message?: string | undefined;
  readonly code?: string | undefined;
  readonly status?: number | undefined;
}

export function mapAuthError(error: AuthErrorLike | null | undefined): string {
  const code = error?.code ?? '';
  const message = error?.message?.toLowerCase() ?? '';

  if (
    code === 'invalid_credentials' ||
    message.includes('invalid login credentials') ||
    message.includes('invalid_grant')
  ) {
    return 'Adresse e-mail ou mot de passe incorrect.';
  }

  if (code === 'email_not_confirmed' || message.includes('email not confirmed')) {
    return 'Ton adresse e-mail n’est pas encore confirmée. Demande à l’administrateur.';
  }

  if (
    code === 'over_request_rate_limit' ||
    code === 'over_email_send_rate_limit' ||
    error?.status === 429
  ) {
    return 'Trop de tentatives. Patiente une minute avant de réessayer.';
  }

  if (message.includes('failed to fetch') || message.includes('networkerror')) {
    return 'Connexion au serveur impossible. Vérifie le réseau puis réessaie.';
  }

  if (code === 'user_not_found') {
    return 'Adresse e-mail ou mot de passe incorrect.';
  }

  return 'La connexion a échoué. Vérifie les informations puis réessaie.';
}

function isAppRole(value: string): value is AppRole {
  return (ROLES as readonly string[]).includes(value);
}

export type ProfileErrorKind = 'inactive' | 'missing' | 'invalid' | 'server';

export class ProfileError extends Error {
  public constructor(
    message: string,
    public readonly kind: ProfileErrorKind,
  ) {
    super(message);
    this.name = 'ProfileError';
  }
}

export async function fetchProfile(userId: string): Promise<Profile> {
  const { data, error } = await getSupabase()
    .from('profiles')
    .select('id, boutique_id, email, nom, role, actif, est_superadmin')
    .eq('id', userId)
    .maybeSingle();

  if (error) {
    throw new ProfileError(
      'Impossible de charger ton profil. Vérifie la connexion puis réessaie.',
      'server',
    );
  }

  if (!data) {
    throw new ProfileError(
      'Aucun profil n’est associé à ce compte. Demande à l’administrateur de te créer un accès.',
      'missing',
    );
  }

  if (!isAppRole(data.role)) {
    throw new ProfileError(
      'Le rôle de ce compte est inconnu. Contacte l’administrateur.',
      'invalid',
    );
  }

  if (!data.actif) {
    throw new ProfileError(
      'Ce compte est désactivé. Demande à l’administrateur de l’activer.',
      'inactive',
    );
  }

  return {
    id: data.id,
    boutique_id: data.boutique_id,
    email: data.email,
    nom: data.nom,
    role: data.role,
    actif: data.actif,
    est_superadmin: data.est_superadmin === true,
  };
}

function isUuid(value: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value);
}

function createUuid(): string {
  if (typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }

  const bytes = crypto.getRandomValues(new Uint8Array(16));
  bytes[6] = (bytes[6]! & 0x0f) | 0x40;
  bytes[8] = (bytes[8]! & 0x3f) | 0x80;
  const hex = Array.from(bytes, (byte) => byte.toString(16).padStart(2, '0')).join('');
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

export function getDeviceId(): string {
  try {
    const stored = localStorage.getItem(DEVICE_STORAGE_KEY);
    if (stored && isUuid(stored)) {
      return stored;
    }

    const created = createUuid();
    localStorage.setItem(DEVICE_STORAGE_KEY, created);
    return created;
  } catch {
    return createUuid();
  }
}

export function getDeviceName(): string {
  const userAgent = navigator.userAgent;
  const platform = /iphone|ipad|ipod/i.test(userAgent)
    ? 'iPhone / iPad'
    : /android/i.test(userAgent)
      ? 'Appareil Android'
      : /windows/i.test(userAgent)
        ? 'Ordinateur Windows'
        : /macintosh|mac os x/i.test(userAgent)
          ? 'Mac'
          : 'Appareil web';

  const browser = /edg\//i.test(userAgent)
    ? 'Edge'
    : /chrome\//i.test(userAgent)
      ? 'Chrome'
      : /firefox\//i.test(userAgent)
        ? 'Firefox'
        : /safari\//i.test(userAgent)
          ? 'Safari'
          : null;

  return browser ? `${platform} · ${browser}` : platform;
}

export async function registerDevice(): Promise<void> {
  const { error } = await getSupabase().rpc('register_device', {
    p_device_id: getDeviceId(),
    p_nom: getDeviceName(),
    p_plateforme: 'web',
    p_version_app: '0.1.0',
  });

  if (error) {
    throw new Error('Impossible d’enregistrer cet appareil. Réessaie dans un instant.');
  }
}

export async function recordLogin(): Promise<void> {
  const { error } = await getSupabase().rpc('record_login', {
    p_device_id: getDeviceId(),
    p_details: {
      plateforme: getDeviceName(),
      version_app: '0.1.0',
      mode: 'mot_de_passe',
    },
  });

  if (error) {
    throw new Error('Impossible d’enregistrer la connexion. Réessaie dans un instant.');
  }
}
