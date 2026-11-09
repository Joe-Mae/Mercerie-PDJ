import { useCallback, useEffect, useState } from 'react';
import {
  disablePush,
  enablePush,
  readPushState,
  syncPushSubscription,
  type PushState,
} from '../lib/push';

interface PushNotificationsValue {
  readonly state: PushState | null;
  readonly loading: boolean;
  readonly busy: boolean;
  readonly error: string | null;
  readonly enable: () => Promise<void>;
  readonly disable: () => Promise<void>;
  readonly refresh: () => Promise<void>;
}

function errorMessage(cause: unknown): string {
  return cause instanceof Error
    ? cause.message
    : 'Les notifications n’ont pas pu être modifiées. Réessaie dans un instant.';
}

export function usePushNotifications(active: boolean): PushNotificationsValue {
  const [state, setState] = useState<PushState | null>(null);
  const [loading, setLoading] = useState(active);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    if (!active) {
      return;
    }

    try {
      setState(await readPushState());
    } catch (cause) {
      setError(errorMessage(cause));
    }
  }, [active]);

  useEffect(() => {
    if (!active) {
      setState(null);
      setLoading(false);
      return;
    }

    let cancelled = false;
    setLoading(true);
    setError(null);

    void (async () => {
      try {
        const next = await readPushState();
        if (cancelled) {
          return;
        }

        setState(next);

        if (next.support === 'ready' && next.permission === 'granted' && next.subscribed) {
          try {
            await syncPushSubscription();
          } catch {
            // L’abonnement local reste valable ; la synchronisation sera retentée.
          }
        }
      } catch (cause) {
        if (!cancelled) {
          setError(errorMessage(cause));
        }
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [active]);

  useEffect(() => {
    if (!active || !('serviceWorker' in navigator)) {
      return;
    }

    const handleMessage = (event: MessageEvent) => {
      if (event.data?.type !== 'push-subscription-change') {
        return;
      }

      void syncPushSubscription()
        .catch(() => undefined)
        .then(refresh);
    };

    navigator.serviceWorker.addEventListener('message', handleMessage);
    return () => {
      navigator.serviceWorker.removeEventListener('message', handleMessage);
    };
  }, [active, refresh]);

  const enable = useCallback(async () => {
    setBusy(true);
    setError(null);

    try {
      await enablePush();
      setState(await readPushState());
    } catch (cause) {
      setError(errorMessage(cause));
    } finally {
      setBusy(false);
    }
  }, []);

  const disable = useCallback(async () => {
    setBusy(true);
    setError(null);

    try {
      await disablePush();
      setState(await readPushState());
    } catch (cause) {
      setError(errorMessage(cause));
    } finally {
      setBusy(false);
    }
  }, []);

  return { state, loading, busy, error, enable, disable, refresh };
}
