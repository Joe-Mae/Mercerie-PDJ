import { isInstalledApp, isIosDevice } from './platform';
import { getDeviceId, getSupabase, isSupabaseConfigured } from './supabase';

const VAPID_PUBLIC_KEY = (import.meta.env.VITE_VAPID_PUBLIC_KEY ?? '').trim();
const SERVICE_WORKER_URL = `${import.meta.env.BASE_URL}sw.js`;

export type PushSupport = 'ready' | 'unsupported' | 'ios-install-required' | 'unconfigured';
export type PushPermission = NotificationPermission | 'unsupported';

export interface PushState {
  readonly support: PushSupport;
  readonly permission: PushPermission;
  readonly subscribed: boolean;
}

export class PushError extends Error {
  public constructor(message: string) {
    super(message);
    this.name = 'PushError';
  }
}

function decodeBase64Url(value: string): Uint8Array<ArrayBuffer> | null {
  try {
    const padded = value.replace(/-/g, '+').replace(/_/g, '/');
    const padding = '='.repeat((4 - (padded.length % 4)) % 4);
    const raw = atob(padded + padding);
    const bytes = new Uint8Array(new ArrayBuffer(raw.length));
    for (let index = 0; index < raw.length; index += 1) {
      bytes[index] = raw.charCodeAt(index);
    }
    return bytes;
  } catch {
    return null;
  }
}

function vapidKey(): Uint8Array<ArrayBuffer> | null {
  if (!VAPID_PUBLIC_KEY) {
    return null;
  }

  const bytes = decodeBase64Url(VAPID_PUBLIC_KEY);
  if (!bytes || bytes.length !== 65 || bytes[0] !== 4) {
    return null;
  }

  return bytes;
}

function hasPushApi(): boolean {
  return (
    window.isSecureContext &&
    'serviceWorker' in navigator &&
    'PushManager' in window &&
    'Notification' in window
  );
}

export function detectPushSupport(): PushSupport {
  if (!hasPushApi()) {
    return 'unsupported';
  }

  if (isIosDevice() && !isInstalledApp()) {
    return 'ios-install-required';
  }

  if (!isSupabaseConfigured || vapidKey() === null) {
    return 'unconfigured';
  }

  return 'ready';
}

async function serviceWorkerRegistration(): Promise<ServiceWorkerRegistration> {
  const existing = await navigator.serviceWorker.getRegistration();
  if (existing) {
    return navigator.serviceWorker.ready;
  }

  await navigator.serviceWorker.register(SERVICE_WORKER_URL, {
    scope: import.meta.env.BASE_URL,
    type: import.meta.env.DEV ? 'module' : 'classic',
  });
  return navigator.serviceWorker.ready;
}

function subscriptionMatchesKey(subscription: PushSubscription, key: Uint8Array): boolean {
  const current = subscription.options.applicationServerKey;
  if (!current) {
    return false;
  }

  const bytes = new Uint8Array(current);
  return bytes.length === key.length && bytes.every((value, index) => value === key[index]);
}

function mapPushError(message: string): string {
  if (/rôle|administrateur|caisse/i.test(message)) {
    return 'Les notifications sont réservées aux administrateurs et à la caisse.';
  }
  if (/inactif|authentifié/i.test(message)) {
    return 'Reconnecte-toi pour activer les notifications.';
  }
  if (/appareil/i.test(message)) {
    return 'Cet appareil n’est pas reconnu. Reconnecte-toi puis réessaie.';
  }

  return 'Impossible d’enregistrer cet appareil pour les notifications. Réessaie dans un instant.';
}

async function saveSubscription(subscription: PushSubscription): Promise<void> {
  const keys = subscription.toJSON().keys;
  if (!keys?.p256dh || !keys.auth) {
    throw new PushError(
      'Cet appareil n’a pas fourni de clés de notification. Désactive puis réactive les notifications.',
    );
  }

  const { error } = await getSupabase().rpc('register_push_subscription', {
    p_endpoint: subscription.endpoint,
    p_p256dh: keys.p256dh,
    p_auth: keys.auth,
    p_device_id: getDeviceId(),
  });

  if (error) {
    throw new PushError(mapPushError(error.message));
  }
}

export async function readPushState(): Promise<PushState> {
  const support = detectPushSupport();
  const permission: PushPermission =
    'Notification' in window ? Notification.permission : 'unsupported';

  if (support !== 'ready') {
    return { support, permission, subscribed: false };
  }

  const registration = await navigator.serviceWorker.getRegistration();
  if (!registration) {
    return { support, permission, subscribed: false };
  }

  const subscription = await registration.pushManager.getSubscription();
  return { support, permission, subscribed: subscription !== null };
}

export async function enablePush(): Promise<void> {
  const support = detectPushSupport();
  if (support !== 'ready') {
    throw new PushError('Les notifications ne sont pas disponibles sur cet appareil.');
  }

  const key = vapidKey();
  if (!key) {
    throw new PushError('La clé publique des notifications est absente.');
  }

  const permission = await Notification.requestPermission();
  if (permission === 'denied') {
    throw new PushError(
      'Les notifications sont bloquées pour ce site. Autorise-les dans les réglages du navigateur, puis recharge la page.',
    );
  }
  if (permission !== 'granted') {
    throw new PushError('Les notifications n’ont pas été autorisées sur cet appareil.');
  }

  const registration = await serviceWorkerRegistration();
  let subscription = await registration.pushManager.getSubscription();
  if (subscription && !subscriptionMatchesKey(subscription, key)) {
    await subscription.unsubscribe();
    subscription = null;
  }

  let created = false;
  if (!subscription) {
    subscription = await registration.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: key,
    });
    created = true;
  }

  try {
    await saveSubscription(subscription);
  } catch (cause) {
    if (created) {
      await subscription.unsubscribe().catch(() => undefined);
    }
    throw cause;
  }
}

export async function syncPushSubscription(): Promise<void> {
  const key = vapidKey();
  if (detectPushSupport() !== 'ready' || !key || Notification.permission !== 'granted') {
    return;
  }

  const registration = await navigator.serviceWorker.getRegistration();
  if (!registration) {
    return;
  }

  let subscription = await registration.pushManager.getSubscription();
  if (subscription && !subscriptionMatchesKey(subscription, key)) {
    await subscription.unsubscribe();
    subscription = null;
  }

  if (!subscription) {
    subscription = await registration.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: key,
    });
  }

  await saveSubscription(subscription);
}

function settleWithin(promise: PromiseLike<unknown>, milliseconds: number): Promise<void> {
  return Promise.race([
    Promise.resolve(promise).then(
      () => undefined,
      () => undefined,
    ),
    new Promise<void>((resolve) => {
      window.setTimeout(resolve, milliseconds);
    }),
  ]);
}

export async function disablePush(): Promise<void> {
  if (!('serviceWorker' in navigator)) {
    return;
  }

  const registration = await navigator.serviceWorker.getRegistration();
  const subscription = registration ? await registration.pushManager.getSubscription() : null;
  if (!subscription) {
    return;
  }

  const revocation = isSupabaseConfigured
    ? getSupabase()
        .rpc('revoke_push_subscription', {
          p_endpoint: subscription.endpoint,
        })
        .then(
          () => undefined,
          () => undefined,
        )
    : Promise.resolve();

  await subscription.unsubscribe();
  // Hors ligne, le serveur retirera l’abonnement à la première notification refusée.
  await settleWithin(revocation, 1500);
}
