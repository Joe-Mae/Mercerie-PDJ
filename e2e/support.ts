import { expect, type Page } from '@playwright/test';

export type DemoRole = 'admin' | 'owner' | 'cashier' | 'seller';

export type DemoPage =
  'dashboard' | 'alertes' | 'caisse' | 'inventaire' | 'ventes' | 'preparer' | 'equipe';

export async function openDemo(page: Page, role: DemoRole, target?: DemoPage): Promise<void> {
  const params = new URLSearchParams({ apercu: role });

  if (target) {
    params.set('page', target);
  }

  await page.goto(`/?${params.toString()}`);
  await expect(page.locator('.workspace')).toBeVisible();
}

export function sidebar(page: Page) {
  return page.locator('.sidebar');
}

export function sidebarButton(page: Page, name: string | RegExp) {
  return sidebar(page).getByRole('button', { name });
}

export function chipValue(page: Page, label: string) {
  return page.locator('.summary-chip', { hasText: label }).locator('strong');
}

export function heading(page: Page, name: string | RegExp) {
  return page.getByRole('heading', { level: 1, name });
}
