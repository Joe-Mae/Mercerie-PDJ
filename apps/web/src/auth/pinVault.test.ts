import { describe, expect, it } from 'vitest';
import {
  decryptWithPin,
  encryptWithPin,
  InvalidPinFormatError,
  PinIncorrectError,
  VaultCorruptedError,
  type VaultPayload,
} from './pinVault';

const PAYLOAD: VaultPayload = {
  version: 1,
  email: 'caisse@merceriepdj.test',
  profile: {
    id: 'a0000000-0000-4000-8000-000000000002',
    boutique_id: 'b7e2c1a4-5d6f-4e8a-9b0c-1d2e3f4a5b6c',
    email: 'caisse@merceriepdj.test',
    nom: 'Caisse Test',
    role: 'cashier',
    est_superadmin: false,
  },
  session: {
    access_token: 'access-token',
    refresh_token: 'refresh-token',
    expires_at: 1_800_000_000,
  },
  savedAt: '2026-11-08T08:00:00.000Z',
};

describe('coffre PIN local', () => {
  it('chiffre et déchiffre la session avec le bon code', async () => {
    const file = await encryptWithPin(PAYLOAD, '1234');
    expect(file.ciphertext).not.toContain('access-token');
    await expect(decryptWithPin(file, '1234')).resolves.toEqual(PAYLOAD);
  });

  it('refuse un code incorrect', async () => {
    const file = await encryptWithPin(PAYLOAD, '1234');
    await expect(decryptWithPin(file, '0000')).rejects.toBeInstanceOf(PinIncorrectError);
  });

  it('exige exactement quatre chiffres', async () => {
    await expect(encryptWithPin(PAYLOAD, '123')).rejects.toBeInstanceOf(InvalidPinFormatError);
    await expect(encryptWithPin(PAYLOAD, '12a4')).rejects.toBeInstanceOf(InvalidPinFormatError);
  });

  it('refuse un coffre altéré', async () => {
    const file = await encryptWithPin(PAYLOAD, '1234');
    const altered = {
      ...file,
      ciphertext: `${file.ciphertext.slice(0, -4)}AAAA`,
    };
    await expect(decryptWithPin(altered, '1234')).rejects.toBeInstanceOf(PinIncorrectError);
  });

  it('refuse un coffre dont le format est inconnu', async () => {
    const file = await encryptWithPin(PAYLOAD, '1234');
    await expect(decryptWithPin({ ...file, version: 2 as 1 }, '1234')).rejects.toBeInstanceOf(
      VaultCorruptedError,
    );
  });
});
