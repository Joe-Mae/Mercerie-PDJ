import {
  cleanupOutdatedCaches,
  createHandlerBoundToURL,
  precacheAndRoute,
} from 'workbox-precaching';
import type { PrecacheEntry } from 'workbox-precaching';
import { NavigationRoute, registerRoute } from 'workbox-routing';

declare let self: ServiceWorkerGlobalScope & {
  readonly __WB_MANIFEST: Array<PrecacheEntry | string>;
};

const sw = self as unknown as ServiceWorkerGlobalScope;

// En développement le manifeste est vide : pas de précache ni de repli de navigation.
const precache = self.__WB_MANIFEST;
if (precache.length > 0) {
  precacheAndRoute(precache);
  cleanupOutdatedCaches();
  registerRoute(new NavigationRoute(createHandlerBoundToURL('/index.html')));
}

sw.addEventListener('install', (event) => {
  event.waitUntil(sw.skipWaiting());
});

sw.addEventListener('activate', (event) => {
  event.waitUntil(sw.clients.claim());
});

function absoluteUrl(path: string): string {
  return new URL(path, sw.registration.scope).href;
}

sw.addEventListener('push', (event) => {
  if (!event.data) {
    return;
  }

  let payload: Record<string, unknown>;
  try {
    const parsed: unknown = event.data.json();
    payload =
      typeof parsed === 'object' && parsed !== null ? (parsed as Record<string, unknown>) : {};
  } catch {
    payload = { title: 'Mercerie PDJ', body: event.data.text() };
  }

  const rawTitle = payload['title'];
  const rawBody = payload['body'];
  const rawTag = payload['tag'];
  const rawUrl = payload['url'];
  const title = typeof rawTitle === 'string' && rawTitle ? rawTitle : 'Mercerie PDJ';
  const body = typeof rawBody === 'string' ? rawBody : '';
  const tag = typeof rawTag === 'string' ? rawTag : 'mercerie-alerte';
  const target = typeof rawUrl === 'string' ? rawUrl : '?page=alertes';

  event.waitUntil(
    sw.registration.showNotification(title, {
      body,
      tag,
      icon: absoluteUrl('icons/icon-192.png'),
      badge: absoluteUrl('icons/favicon-32.png'),
      data: { url: absoluteUrl(target) },
    }),
  );
});

sw.addEventListener('notificationclick', (event) => {
  event.notification.close();

  const data = event.notification.data as { readonly url?: unknown } | undefined;
  const target = typeof data?.url === 'string' ? data.url : absoluteUrl('?page=alertes');

  event.waitUntil(
    (async () => {
      const windows = await sw.clients.matchAll({ type: 'window', includeUncontrolled: true });

      for (const client of windows) {
        if (new URL(client.url).origin !== sw.location.origin) {
          continue;
        }

        await client.focus();
        if (client.navigate) {
          await client.navigate(target);
        }
        return;
      }

      await sw.clients.openWindow(target);
    })(),
  );
});

/* Safari et Chrome peuvent renouveler l’abonnement. L’application ouverte
   enregistre alors le nouvel endpoint auprès du serveur. */
sw.addEventListener('pushsubscriptionchange', (event) => {
  event.waitUntil(
    (async () => {
      const windows = await sw.clients.matchAll({ type: 'window', includeUncontrolled: true });
      for (const client of windows) {
        client.postMessage({ type: 'push-subscription-change' });
      }
    })(),
  );
});
