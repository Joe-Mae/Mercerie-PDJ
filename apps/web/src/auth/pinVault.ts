import type { ProfileSnapshot } from '../types';

export interface SessionSnapshot {
  readonly access_token: string;
  readonly refresh_token: string;
  readonly expires_at?: number;
}

export interface VaultPayload {
  readonly version: 1;
  readonly email: string;
  readonly profile: ProfileSnapshot;
  readonly session: SessionSnapshot;
  readonly savedAt: string;
}

export interface VaultFile {
  readonly version: 1;
  readonly email: string;
  readonly salt: string;
  readonly iv: string;
  readonly ciphertext: string;
  readonly createdAt: string;
}

export class PinError extends Error {}

export class InvalidPinFormatError extends PinError {
  public constructor() {
    super('Le code doit contenir exactement 4 chiffres.');
    this.name = 'InvalidPinFormatError';
  }
}

export class PinIncorrectError extends PinError {
  public constructor() {
    super('Code incorrect. Réessaie.');
    this.name = 'PinIncorrectError';
  }
}

export class VaultCorruptedError extends PinError {
  public constructor() {
    super(
      'Le code enregistré sur cet appareil est illisible. Reconnecte-toi avec ton mot de passe.',
    );
    this.name = 'VaultCorruptedError';
  }
}

const VAULT_STORAGE_KEY = 'mercerie.vault.v1';
const PBKDF2_ITERATIONS = 210_000;
const SALT_BYTES = 16;
const IV_BYTES = 12;

const encoder = new TextEncoder();
const decoder = new TextDecoder();

function toBase64(bytes: Uint8Array): string {
  let binary = '';
  for (const byte of bytes) {
    binary += String.fromCharCode(byte);
  }
  return btoa(binary);
}

function fromBase64(value: string): Uint8Array {
  try {
    const binary = atob(value);
    return Uint8Array.from(binary, (character) => character.charCodeAt(0));
  } catch {
    throw new VaultCorruptedError();
  }
}

function randomBytes(length: number): Uint8Array {
  return crypto.getRandomValues(new Uint8Array(length));
}

export function assertPinFormat(pin: string): void {
  if (!/^\d{4}$/.test(pin)) {
    throw new InvalidPinFormatError();
  }
}

async function deriveKey(pin: string, salt: Uint8Array): Promise<CryptoKey> {
  const material = await crypto.subtle.importKey('raw', encoder.encode(pin), 'PBKDF2', false, [
    'deriveKey',
  ]);

  return crypto.subtle.deriveKey(
    {
      name: 'PBKDF2',
      salt: salt as BufferSource,
      iterations: PBKDF2_ITERATIONS,
      hash: 'SHA-256',
    },
    material,
    { name: 'AES-GCM', length: 256 },
    false,
    ['encrypt', 'decrypt'],
  );
}

export async function encryptWithKey(
  payload: VaultPayload,
  key: CryptoKey,
  saltB64: string,
): Promise<VaultFile> {
  const iv = randomBytes(IV_BYTES);
  const plaintext = encoder.encode(JSON.stringify(payload));
  const ciphertext = await crypto.subtle.encrypt(
    { name: 'AES-GCM', iv: iv as BufferSource },
    key,
    plaintext as BufferSource,
  );

  return {
    version: 1,
    email: payload.email,
    salt: saltB64,
    iv: toBase64(iv),
    ciphertext: toBase64(new Uint8Array(ciphertext)),
    createdAt: new Date().toISOString(),
  };
}

export async function encryptWithPin(payload: VaultPayload, pin: string): Promise<VaultFile> {
  const { file } = await createVaultWithPin(payload, pin);
  return file;
}

export async function createVaultWithPin(
  payload: VaultPayload,
  pin: string,
): Promise<{ file: VaultFile; key: CryptoKey }> {
  assertPinFormat(pin);
  const salt = randomBytes(SALT_BYTES);
  const key = await deriveKey(pin, salt);
  const file = await encryptWithKey(payload, key, toBase64(salt));
  return { file, key };
}

function isVaultPayload(value: unknown): value is VaultPayload {
  if (typeof value !== 'object' || value === null) {
    return false;
  }

  const candidate = value as Partial<VaultPayload>;
  return (
    candidate.version === 1 &&
    typeof candidate.email === 'string' &&
    typeof candidate.profile?.id === 'string' &&
    typeof candidate.profile?.nom === 'string' &&
    typeof candidate.profile?.role === 'string' &&
    typeof candidate.session?.access_token === 'string' &&
    typeof candidate.session?.refresh_token === 'string'
  );
}

export async function decryptWithPin(file: VaultFile, pin: string): Promise<VaultPayload> {
  const { payload } = await openVaultWithPin(file, pin);
  return payload;
}

export async function openVaultWithPin(
  file: VaultFile,
  pin: string,
): Promise<{ payload: VaultPayload; key: CryptoKey }> {
  assertPinFormat(pin);

  if (file.version !== 1) {
    throw new VaultCorruptedError();
  }

  const salt = fromBase64(file.salt);
  const iv = fromBase64(file.iv);
  const ciphertext = fromBase64(file.ciphertext);
  if (iv.length !== IV_BYTES || salt.length !== SALT_BYTES) {
    throw new VaultCorruptedError();
  }

  const key = await deriveKey(pin, salt);

  let plaintext: ArrayBuffer;
  try {
    plaintext = await crypto.subtle.decrypt(
      { name: 'AES-GCM', iv: iv as BufferSource },
      key,
      ciphertext as BufferSource,
    );
  } catch {
    throw new PinIncorrectError();
  }

  let payload: unknown;
  try {
    payload = JSON.parse(decoder.decode(plaintext));
  } catch {
    throw new VaultCorruptedError();
  }

  if (!isVaultPayload(payload) || payload.email !== file.email) {
    throw new VaultCorruptedError();
  }

  return { payload, key };
}

export function readVault(storage: Storage = localStorage): VaultFile | null {
  try {
    const raw = storage.getItem(VAULT_STORAGE_KEY);
    if (!raw) {
      return null;
    }
    const parsed = JSON.parse(raw) as Partial<VaultFile>;
    if (
      parsed.version !== 1 ||
      typeof parsed.email !== 'string' ||
      typeof parsed.salt !== 'string' ||
      typeof parsed.iv !== 'string' ||
      typeof parsed.ciphertext !== 'string'
    ) {
      return null;
    }
    return parsed as VaultFile;
  } catch {
    return null;
  }
}

export function writeVault(file: VaultFile, storage: Storage = localStorage): void {
  storage.setItem(VAULT_STORAGE_KEY, JSON.stringify(file));
}

export function removeVault(storage: Storage = localStorage): void {
  try {
    storage.removeItem(VAULT_STORAGE_KEY);
  } catch {
    // Le stockage local peut être indisponible en navigation privée.
  }
}
