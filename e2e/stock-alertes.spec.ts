import { expect, test } from '@playwright/test';
import { chipValue, heading, openDemo } from './support';

test.describe('Stock et alertes', () => {
  test('l’inventaire affiche les quantités, les seuils et les ruptures', async ({ page }) => {
    await openDemo(page, 'admin', 'inventaire');
    await expect(heading(page, 'Le stock de la boutique')).toBeVisible();

    await expect(chipValue(page, 'variantes suivies')).toHaveText('12');
    await expect(chipValue(page, 'sous le seuil')).toHaveText('7');
    await expect(chipValue(page, 'en rupture')).toHaveText('1');
    await expect(page.locator('.stock-row')).toHaveCount(12);

    const search = page.getByPlaceholder('Rechercher un article, une couleur, un code…');
    await search.fill('bazin');
    await expect(page.locator('.stock-row')).toHaveCount(2);

    await search.fill('');
    await page
      .getByRole('group', { name: 'Filtrer par catégorie' })
      .getByRole('button', { name: 'Tissus' })
      .click();
    await expect(page.locator('.stock-row')).toHaveCount(7);
    await expect(page.locator('.stock-row').first()).toContainText('Bazin riche');
  });

  test('l’administrateur prend en charge une alerte', async ({ page }) => {
    await openDemo(page, 'admin', 'alertes');
    await expect(heading(page, 'Ce qui demande ton attention')).toBeVisible();

    await expect(chipValue(page, 'à traiter')).toHaveText('3');
    await expect(chipValue(page, 'prises en charge')).toHaveText('1');
    await expect(chipValue(page, 'résolues')).toHaveText('2');
    await expect(page.locator('.alert-ack-button')).toHaveCount(3);
    await expect(page.getByText('Écart de caisse à la clôture')).toBeVisible();

    await page.locator('.alert-ack-button').first().click();

    await expect(chipValue(page, 'à traiter')).toHaveText('2');
    await expect(chipValue(page, 'prises en charge')).toHaveText('2');
    await expect(page.locator('.alert-ack-button')).toHaveCount(2);
    await expect(page.locator('.nav-badge')).toHaveText('2');
    await expect(page.locator('.alert-entry-trace').first()).toContainText(
      'Prise en charge par Mme Adjovi',
    );
  });

  test('le caissier consulte toutes les alertes mais ne peut pas les prendre en charge', async ({
    page,
  }) => {
    await openDemo(page, 'cashier', 'alertes');

    await expect(chipValue(page, 'à traiter')).toHaveText('2');
    await expect(chipValue(page, 'prises en charge')).toHaveText('1');
    await expect(chipValue(page, 'résolues')).toHaveText('2');
    await expect(page.locator('.alert-entry')).toHaveCount(5);
    await expect(page.getByRole('heading', { name: 'Notifications' })).toBeVisible();
    await expect(page.locator('.alert-ack-button')).toHaveCount(0);
  });

  test('le vendeur ne voit que les alertes de stock', async ({ page }) => {
    await openDemo(page, 'seller', 'alertes');

    await expect(chipValue(page, 'à traiter')).toHaveText('2');
    await expect(chipValue(page, 'prises en charge')).toHaveText('1');
    await expect(chipValue(page, 'résolues')).toHaveText('2');
    await expect(page.locator('.alert-entry')).toHaveCount(5);
    await expect(page.getByRole('heading', { name: 'Notifications' })).toHaveCount(0);
    await expect(page.locator('.alert-ack-button')).toHaveCount(0);
    await expect(page.getByText('Écart de caisse')).toHaveCount(0);
  });

  test('une sortie de stock exige un motif et laisse une trace', async ({ page }) => {
    await openDemo(page, 'admin', 'inventaire');
    await page.getByRole('tab', { name: 'Mouvements' }).click();
    await expect(heading(page, 'Mouvements de stock')).toBeVisible();

    await page
      .getByLabel('Article et couleur')
      .selectOption({ label: 'Bazin riche — Blanc (BAZ-BL)' });
    await page
      .getByRole('group', { name: 'Type de mouvement' })
      .getByRole('button', { name: 'Perte' })
      .click();
    await page.getByLabel('Quantité (mètre)').fill('0,5');
    await page.getByRole('button', { name: 'Enregistrer le mouvement' }).click();
    await expect(
      page.getByText('Le motif est obligatoire pour une perte ou une correction.'),
    ).toBeVisible();

    await page.getByLabel('Motif (obligatoire)').fill('Test Playwright');
    await page.getByRole('button', { name: 'Enregistrer le mouvement' }).click();

    await expect(page.getByText(/Perte enregistrée pour Bazin riche — Blanc/)).toBeVisible();
    await expect(page.getByText('Stock après opération : 3 m')).toBeVisible();
    await expect(page.locator('.movement-list')).toContainText('Test Playwright');
    await expect(page.locator('.movement-list')).toContainText('− 0,5 m');
  });
});
