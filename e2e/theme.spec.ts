import { expect, test } from '@playwright/test';
import { openDemo, sidebarButton } from './support';

test.describe('Thème clair et sombre', () => {
  test('bascule le thème et mémorise le choix', async ({ page }) => {
    await openDemo(page, 'admin');
    const root = page.locator('html');
    await expect(root).toHaveAttribute('data-theme', 'dark');

    await sidebarButton(page, 'Passer en mode clair').click();
    await expect(root).toHaveAttribute('data-theme', 'light');
    await expect(sidebarButton(page, 'Passer en mode sombre')).toBeVisible();
    await expect(page.locator('meta[name="theme-color"]')).toHaveAttribute('content', '#f6f2e9');

    await page.reload();
    await expect(page.locator('.workspace')).toBeVisible();
    await expect(root).toHaveAttribute('data-theme', 'light');
  });

  test('revient au thème sombre', async ({ page }) => {
    await page.addInitScript(() => {
      window.localStorage.setItem('mercerie:theme', 'light');
    });
    await openDemo(page, 'admin');

    await sidebarButton(page, 'Passer en mode sombre').click();
    await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');
    await expect(page.locator('meta[name="theme-color"]')).toHaveAttribute('content', '#070d18');
  });
});
