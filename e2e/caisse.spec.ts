import { expect, test, type Page } from '@playwright/test';
import { heading, openDemo } from './support';

const XOF = /[\s\u00A0\u202F]/;

async function openSession(page: Page, fond: string): Promise<void> {
  await page.getByLabel('Fond de caisse (F CFA)').fill(fond);
  await page.getByRole('button', { name: 'Ouvrir la caisse' }).click();
  await expect(heading(page, 'Encaisser une vente')).toBeVisible();
}

async function addArticle(page: Page, code: string, quantity: string): Promise<void> {
  await page.getByLabel('Rechercher un article').fill(code);

  const item = page.locator('.cashier-catalog li').filter({ hasText: code });
  await expect(item).toHaveCount(1);
  await item.getByRole('button').click();

  const quantityInput = page.locator('.sale-lines input[inputmode="decimal"]');
  await expect(quantityInput).toHaveCount(1);
  await quantityInput.fill(quantity);
}

test.describe('Caisse', () => {
  test('vend au comptant, délivre le ticket et clôture la caisse juste', async ({ page }) => {
    await openDemo(page, 'admin', 'caisse');
    await expect(heading(page, 'Ouvrir la caisse')).toBeVisible();
    await openSession(page, '10000');

    await addArticle(page, 'WAX-JA', '2');

    const total = page.locator('.sale-total-due strong');
    await expect(total).toHaveText(new RegExp(`9${XOF.source}000`));

    await page.getByLabel('Montant reçu (F CFA)').fill('10000');
    await expect(page.locator('.cash-change strong')).toHaveText(new RegExp(`1${XOF.source}000`));

    await page.getByRole('button', { name: /Encaisser/ }).click();

    const ticket = page.getByRole('dialog');
    await expect(ticket.getByRole('heading', { name: 'Ticket de vente' })).toBeVisible();
    await expect(ticket.locator('.receipt-meta')).toContainText(/PDJ-[0-9A-F]{4}-[0-9A-F]{10}/);
    await expect(ticket.getByText('Wax Hollandais — Jaune')).toBeVisible();
    await expect(ticket.getByText('Ticket synchronisé.')).toBeVisible();

    await ticket.getByRole('button', { name: 'Nouvelle vente' }).click();
    await expect(page.getByRole('dialog')).toHaveCount(0);
    await expect(page.locator('.cashier-status')).toContainText('1 ticket');

    await page.getByRole('button', { name: 'Clôturer la caisse' }).click();
    const closeDialog = page.getByRole('dialog');
    await expect(closeDialog.getByRole('heading', { name: 'Clôturer la caisse' })).toBeVisible();
    await closeDialog.getByLabel('Montant compté dans le tiroir (F CFA)').fill('19000');
    await expect(closeDialog.locator('.close-gap strong')).toHaveText(
      new RegExp(`0${XOF.source}F${XOF.source}CFA`),
    );
    await closeDialog.getByRole('button', { name: 'Confirmer la clôture' }).click();

    await expect(heading(page, 'Caisse clôturée')).toBeVisible();
    await expect(page.getByText('Caisse juste')).toBeVisible();
    await expect(page.locator('.closed-sales')).toContainText(new RegExp(`9${XOF.source}000`));
    await expect(page.getByText('1 ticket')).toBeVisible();
  });

  test('exige une référence Mobile Money avant d’encaisser', async ({ page }) => {
    await openDemo(page, 'cashier', 'caisse');
    await openSession(page, '5000');

    await addArticle(page, 'FIL-NO', '2');
    await page.getByRole('button', { name: 'T-Money' }).click();

    await page.getByLabel('Référence T-Money').fill('12');
    await page.getByRole('button', { name: /Encaisser/ }).click();
    await expect(
      page.getByText('Saisis la référence Mobile Money (au moins 3 caractères).'),
    ).toBeVisible();
    await expect(page.getByRole('dialog')).toHaveCount(0);

    await page.getByLabel('Référence T-Money').fill('MP-2408-0001');
    await page.getByRole('button', { name: /Encaisser/ }).click();

    const ticket = page.getByRole('dialog');
    await expect(ticket.getByRole('heading', { name: 'Ticket de vente' })).toBeVisible();
    await expect(ticket.getByText('T-Money · MP-2408-0001')).toBeVisible();
    await expect(ticket.getByText('Fil polyester — Noir')).toBeVisible();
  });

  test('un vendeur ne peut pas ouvrir la caisse', async ({ page }) => {
    await openDemo(page, 'seller', 'caisse');

    await expect(heading(page, /Bonjour, Kossi/)).toBeVisible();
    await expect(page.getByRole('button', { name: 'Ouvrir la caisse' })).toHaveCount(0);
  });
});
