import { expect, test } from '@playwright/test';

test.describe('Application installable et hors ligne', () => {
  test('sert le manifeste et les icônes d’installation', async ({ page }) => {
    await page.goto('/?apercu=admin');

    const manifest = await page.request.get('/manifest.webmanifest');
    expect(manifest.status()).toBe(200);
    const body = (await manifest.json()) as {
      readonly name: string;
      readonly display: string;
      readonly icons: readonly { readonly src: string }[];
    };
    expect(body.name).toContain('Mercerie PDJ');
    expect(body.display).toBe('standalone');
    expect(body.icons).toHaveLength(3);

    for (const icon of body.icons) {
      const response = await page.request.get(icon.src);
      expect(response.status()).toBe(200);
      expect(response.headers()['content-type']).toContain('image/png');
    }
  });

  test('reste utilisable après le passage hors ligne', async ({ page, context }) => {
    await page.goto('/?apercu=admin&page=caisse');
    await expect(page.getByRole('heading', { level: 1, name: 'Ouvrir la caisse' })).toBeVisible();

    await page.evaluate(async () => {
      await navigator.serviceWorker.ready;
    });
    await page.waitForFunction(() => navigator.serviceWorker.controller !== null);

    await context.setOffline(true);
    await page.reload();

    await expect(page.getByRole('heading', { level: 1, name: 'Ouvrir la caisse' })).toBeVisible();
    await expect(page.getByText('Aperçu — données de démonstration')).toBeVisible();
  });

  test('précache les fichiers de l’application', async ({ page }) => {
    await page.goto('/?apercu=admin');

    const cached = await page.evaluate(async () => {
      await navigator.serviceWorker.ready;
      const keys = await caches.keys();
      const entries: string[] = [];

      for (const key of keys) {
        const cache = await caches.open(key);
        for (const request of await cache.keys()) {
          entries.push(new URL(request.url).pathname);
        }
      }

      return entries;
    });

    expect(cached).toContain('/index.html');
    expect(cached.some((entry) => entry.startsWith('/assets/'))).toBe(true);
    expect(cached).toContain('/manifest.webmanifest');
  });
});
