import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import type { Session } from '@supabase/supabase-js';
import {
  createVaultWithPin,
  encryptWithKey,
  openVaultWithPin,
  PinError,
  PinIncorrectError,
  readVault,
  removeVault,
  writeVault,
  type VaultFile,
  type VaultPayload,
} from './pinVault';
import {
  fetchProfile,
  getSupabase,
  isSupabaseConfigured,
  mapAuthError,
  ProfileError,
  recordLogin,
  registerDevice,
} from '../lib/supabase';
import { disablePush } from '../lib/push';
import type { Profile, ProfileSnapshot } from '../types';

const PIN_ATTEMPTS_KEY = 'mercerie.pin.attempts.v1';
const MAX_PIN_ATTEMPTS = 5;

export type AuthStatus =
  | { readonly kind: 'setup_required' }
  | { readonly kind: 'signed_out' }
  | { readonly kind: 'pin_setup'; readonly profile: ProfileSnapshot }
  | { readonly kind: 'locked'; readonly email: string }
  | { readonly kind: 'unlocked'; readonly profile: ProfileSnapshot };

interface AuthContextValue {
  readonly status: AuthStatus;
  readonly isOnline: boolean;
  readonly busy: boolean;
  readonly error: string | null;
  readonly notice: string | null;
  readonly signIn: (email: string, password: string) => Promise<void>;
  readonly setupPin: (pin: string) => Promise<void>;
  readonly unlock: (pin: string) => Promise<void>;
  readonly lock: () => void;
  readonly signOut: () => Promise<void>;
  readonly clearMessages: () => void;
}

const AuthContext = createContext<AuthContextValue | null>(null);

function toSnapshot(profile: Profile | ProfileSnapshot): ProfileSnapshot {
  return {
    id: profile.id,
    boutique_id: profile.boutique_id,
    email: profile.email,
    nom: profile.nom,
    role: profile.role,
    est_superadmin: profile.est_superadmin === true,
  };
}

function buildPayload(session: Session, profile: ProfileSnapshot): VaultPayload {
  return {
    version: 1,
    email: profile.email,
    profile: toSnapshot(profile),
    session: {
      access_token: session.access_token,
      refresh_token: session.refresh_token,
      ...(session.expires_at !== undefined ? { expires_at: session.expires_at } : {}),
    },
    savedAt: new Date().toISOString(),
  };
}

function readAttempts(): number {
  try {
    const raw = localStorage.getItem(PIN_ATTEMPTS_KEY);
    const value = raw ? Number.parseInt(raw, 10) : 0;
    return Number.isSafeInteger(value) && value > 0 ? value : 0;
  } catch {
    return 0;
  }
}

function writeAttempts(value: number): void {
  try {
    localStorage.setItem(PIN_ATTEMPTS_KEY, String(value));
  } catch {
    // Le compteur est une protection secondaire : le stockage peut être indisponible.
  }
}

function clearAttempts(): void {
  try {
    localStorage.removeItem(PIN_ATTEMPTS_KEY);
  } catch {
    // Sans stockage, il n’y a rien à effacer.
  }
}

function initialStatus(): AuthStatus {
  if (!isSupabaseConfigured) {
    return { kind: 'setup_required' };
  }

  const vault = readVault();
  return vault ? { kind: 'locked', email: vault.email } : { kind: 'signed_out' };
}

export function AuthProvider({ children }: { readonly children: ReactNode }) {
  const [status, setStatus] = useState<AuthStatus>(initialStatus);
  const [isOnline, setIsOnline] = useState(() => navigator.onLine);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const statusRef = useRef(status);
  const vaultRef = useRef<VaultFile | null>(readVault());
  const keyRef = useRef<CryptoKey | null>(null);
  const sessionRef = useRef<Session | null>(null);
  const profileRef = useRef<ProfileSnapshot | null>(null);
  const pendingSessionRef = useRef<Session | null>(null);

  const applyStatus = useCallback((next: AuthStatus) => {
    statusRef.current = next;
    setStatus(next);
  }, []);

  useEffect(() => {
    const onOnline = () => setIsOnline(true);
    const onOffline = () => setIsOnline(false);
    window.addEventListener('online', onOnline);
    window.addEventListener('offline', onOffline);
    return () => {
      window.removeEventListener('online', onOnline);
      window.removeEventListener('offline', onOffline);
    };
  }, []);

  const persistVault = useCallback(async (session: Session) => {
    const key = keyRef.current;
    const profile = profileRef.current;
    const vault = vaultRef.current;

    if (!key || !profile || !vault) {
      return;
    }

    try {
      const file = await encryptWithKey(buildPayload(session, profile), key, vault.salt);
      writeVault(file);
      vaultRef.current = file;
    } catch {
      // Le coffre actuel reste valable ; la prochaine ouverture utilisera le jeton stocké.
    }
  }, []);

  const clearLocalSession = useCallback(
    (nextNotice: string | null, nextError: string | null) => {
      removeVault();
      vaultRef.current = null;
      keyRef.current = null;
      sessionRef.current = null;
      profileRef.current = null;
      pendingSessionRef.current = null;
      clearAttempts();
      applyStatus({ kind: 'signed_out' });
      setNotice(nextNotice);
      setError(nextError);
    },
    [applyStatus],
  );

  const verifySession = useCallback(async () => {
    try {
      const { data } = await getSupabase().auth.getSession();
      if (!data.session) {
        return;
      }

      const profile = await fetchProfile(data.session.user.id);
      sessionRef.current = data.session;
      profileRef.current = toSnapshot(profile);
      applyStatus({ kind: 'unlocked', profile: toSnapshot(profile) });
      await persistVault(data.session);
    } catch (cause) {
      if (
        cause instanceof ProfileError &&
        (cause.kind === 'inactive' || cause.kind === 'missing' || cause.kind === 'invalid')
      ) {
        clearLocalSession(null, cause.message);
      }
    }
  }, [applyStatus, clearLocalSession, persistVault]);

  useEffect(() => {
    if (!isSupabaseConfigured) {
      return;
    }

    const { data } = getSupabase().auth.onAuthStateChange((event, session) => {
      if (event === 'TOKEN_REFRESHED' && session) {
        sessionRef.current = session;
        void persistVault(session);
        return;
      }

      if (event === 'SIGNED_OUT' && statusRef.current.kind === 'unlocked') {
        keyRef.current = null;
        sessionRef.current = null;
        const vault = vaultRef.current;
        applyStatus(vault ? { kind: 'locked', email: vault.email } : { kind: 'signed_out' });
      }
    });

    return () => {
      data.subscription.unsubscribe();
    };
  }, [applyStatus, persistVault]);

  const signIn = useCallback(
    async (email: string, password: string) => {
      setBusy(true);
      setError(null);
      setNotice(null);
      let signedIn = false;

      try {
        const supabase = getSupabase();
        const { data, error: authError } = await supabase.auth.signInWithPassword({
          email: email.trim(),
          password,
        });

        if (authError || !data.session) {
          throw new Error(mapAuthError(authError));
        }

        signedIn = true;
        const profile = await fetchProfile(data.user.id);
        const snapshot = toSnapshot(profile);

        pendingSessionRef.current = data.session;
        sessionRef.current = data.session;
        profileRef.current = snapshot;

        try {
          await registerDevice();
          await recordLogin();
        } catch {
          // L’audit d’appareil ne doit pas empêcher une connexion valide.
        }

        clearAttempts();
        applyStatus({ kind: 'pin_setup', profile: snapshot });
      } catch (cause) {
        if (signedIn) {
          try {
            await getSupabase().auth.signOut({ scope: 'local' });
          } catch {
            // La session locale sera de toute façon oubliée.
          }
        }

        pendingSessionRef.current = null;
        setError(cause instanceof Error ? cause.message : 'La connexion a échoué.');
      } finally {
        setBusy(false);
      }
    },
    [applyStatus],
  );

  const setupPin = useCallback(
    async (pin: string) => {
      setBusy(true);
      setError(null);

      try {
        const session = pendingSessionRef.current;
        const profile = profileRef.current;

        if (!session || !profile) {
          throw new Error('Reconnecte-toi avec ton mot de passe pour configurer le code.');
        }

        const { file, key } = await createVaultWithPin(buildPayload(session, profile), pin);
        writeVault(file);

        vaultRef.current = file;
        keyRef.current = key;
        sessionRef.current = session;
        pendingSessionRef.current = null;
        clearAttempts();

        applyStatus({ kind: 'unlocked', profile });
      } catch (cause) {
        setError(
          cause instanceof Error
            ? cause.message
            : 'Impossible d’enregistrer le code sur cet appareil.',
        );
      } finally {
        setBusy(false);
      }
    },
    [applyStatus],
  );

  const unlock = useCallback(
    async (pin: string) => {
      setBusy(true);
      setError(null);
      setNotice(null);

      const vault = vaultRef.current ?? readVault();
      vaultRef.current = vault;

      if (!vault) {
        applyStatus({ kind: 'signed_out' });
        setError('Aucune session n’est enregistrée sur cet appareil. Reconnecte-toi.');
        setBusy(false);
        return;
      }

      let opened: { payload: VaultPayload; key: CryptoKey };

      try {
        opened = await openVaultWithPin(vault, pin);
      } catch (cause) {
        if (cause instanceof PinIncorrectError) {
          const attempts = readAttempts() + 1;

          if (attempts >= MAX_PIN_ATTEMPTS) {
            removeVault();
            vaultRef.current = null;
            clearAttempts();
            applyStatus({ kind: 'signed_out' });
            setError(
              'Cinq codes incorrects. Pour protéger la boutique, reconnecte-toi avec ton mot de passe.',
            );
          } else {
            writeAttempts(attempts);
            const remaining = MAX_PIN_ATTEMPTS - attempts;
            setError(`Code incorrect. Il te reste ${remaining} essai${remaining > 1 ? 's' : ''}.`);
          }
        } else if (cause instanceof PinError) {
          removeVault();
          vaultRef.current = null;
          applyStatus({ kind: 'signed_out' });
          setError(cause.message);
        } else {
          setError('Impossible d’ouvrir la session enregistrée. Reconnecte-toi.');
        }

        setBusy(false);
        return;
      }

      try {
        const { data, error: sessionError } = await getSupabase().auth.setSession({
          access_token: opened.payload.session.access_token,
          refresh_token: opened.payload.session.refresh_token,
        });

        if (sessionError) {
          throw sessionError;
        }

        sessionRef.current = data.session;
      } catch {
        setError('La session enregistrée a expiré. Reconnecte-toi avec ton mot de passe.');
        setBusy(false);
        return;
      }

      keyRef.current = opened.key;
      const unlockedProfile: ProfileSnapshot = {
        ...opened.payload.profile,
        est_superadmin: opened.payload.profile.est_superadmin === true,
      };
      profileRef.current = unlockedProfile;
      clearAttempts();
      applyStatus({ kind: 'unlocked', profile: unlockedProfile });
      setBusy(false);

      if (navigator.onLine) {
        void verifySession();
      }
    },
    [applyStatus, verifySession],
  );

  const lock = useCallback(() => {
    const vault = vaultRef.current ?? readVault();
    keyRef.current = null;
    sessionRef.current = null;
    profileRef.current = null;
    pendingSessionRef.current = null;
    setError(null);
    setNotice(null);
    applyStatus(vault ? { kind: 'locked', email: vault.email } : { kind: 'signed_out' });

    if (isSupabaseConfigured) {
      void getSupabase()
        .auth.signOut({ scope: 'local' })
        .catch(() => undefined);
    }
  }, [applyStatus]);

  const signOut = useCallback(async () => {
    setBusy(true);

    if (isSupabaseConfigured) {
      await disablePush().catch(() => undefined);

      try {
        await getSupabase().auth.signOut();
      } catch {
        try {
          await getSupabase().auth.signOut({ scope: 'local' });
        } catch {
          // Le coffre local est supprimé juste après, dans tous les cas.
        }
      }
    }

    clearLocalSession(isSupabaseConfigured ? 'Tu es déconnecté. À bientôt.' : null, null);
    setBusy(false);
  }, [clearLocalSession]);

  const clearMessages = useCallback(() => {
    setError(null);
    setNotice(null);
  }, []);

  const value = useMemo<AuthContextValue>(
    () => ({
      status,
      isOnline,
      busy,
      error,
      notice,
      signIn,
      setupPin,
      unlock,
      lock,
      signOut,
      clearMessages,
    }),
    [busy, clearMessages, error, isOnline, lock, notice, setupPin, signIn, signOut, status, unlock],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth doit être utilisé dans AuthProvider.');
  }
  return context;
}
