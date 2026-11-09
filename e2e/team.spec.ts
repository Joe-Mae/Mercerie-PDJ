import { expect, test } from '@playwright/test';
import { heading, openDemo, sidebarButton } from './support';

test('le propriétaire ne voit pas la gestion de l’équipe', async ({ page }) => {
  await openDemo(page, 'owner');

  await expect(heading(page, /Bonjour, Koffi/)).toBeVisible();
  await expect(sidebarButton(page, 'Équipe et droits')).toHaveCount(0);

  await openDemo(page, 'owner', 'equipe');
  await expect(heading(page, /Bonjour, Koffi/)).toBeVisible();
  await expect(heading(page, 'Chacun son compte, chacun son rôle')).toHaveCount(0);
});

test('le superadmin liste les comptes et protège son propre accès', async ({ page }) => {
  await openDemo(page, 'admin', 'equipe');

  await expect(heading(page, 'Chacun son compte, chacun son rôle')).toBeVisible();
  await expect(page.getByText('superadmin@merceriepdj.test')).toBeVisible();
  await expect(page.getByText('proprietaire@merceriepdj.test')).toBeVisible();
  await expect(page.getByText('caisse@merceriepdj.test')).toBeVisible();
  await expect(page.getByText('vente@merceriepdj.test')).toBeVisible();

  const superadminRow = page.locator('.team-row', { hasText: 'superadmin@merceriepdj.test' });
  await expect(superadminRow.getByText('Compte protégé')).toBeVisible();
  await expect(superadminRow.getByRole('combobox')).toHaveCount(0);
  await expect(superadminRow.getByRole('button', { name: 'Désactiver' })).toHaveCount(0);
});

test('le superadmin change un rôle et désactive puis réactive un compte', async ({ page }) => {
  await openDemo(page, 'admin', 'equipe');

  const sellerRow = page.locator('.team-row', { hasText: 'vente@merceriepdj.test' });
  await sellerRow.getByLabel('Rôle de Kossi').selectOption('cashier');
  await expect(sellerRow.locator('.role-pill.role-cashier')).toHaveText('Caissier');
  await expect(page.getByText(/Le rôle de Kossi est maintenant « Caissier »/)).toBeVisible();

  page.on('dialog', (dialog) => void dialog.accept());
  await sellerRow.getByRole('button', { name: 'Désactiver' }).click();
  await expect(sellerRow.locator('.status-pill.is-off')).toHaveText('Désactivé');
  await expect(page.getByText('Le compte de Kossi est désactivé.')).toBeVisible();

  await sellerRow.getByRole('button', { name: 'Réactiver' }).click();
  await expect(sellerRow.locator('.status-pill.is-active')).toHaveText('Actif');
  await expect(page.getByText('Le compte de Kossi est réactivé.')).toBeVisible();
});

test('le superadmin crée un compte et affiche le mot de passe une seule fois', async ({ page }) => {
  await openDemo(page, 'admin', 'equipe');

  await page.getByRole('button', { name: 'Créer un compte' }).click();
  const dialog = page.getByRole('dialog');
  await expect(dialog.getByRole('heading', { name: 'Créer un compte' })).toBeVisible();

  await dialog.getByLabel('Nom affiché').fill('Affo Mensah');
  await dialog.getByLabel('Adresse e-mail').fill('affo@merceriepdj.test');
  await dialog.getByLabel('Rôle').selectOption('seller');
  await dialog.getByRole('button', { name: 'Créer le compte' }).click();

  const credentials = page.getByRole('dialog');
  await expect(credentials.getByRole('heading', { name: 'Compte créé' })).toBeVisible();
  await expect(credentials.getByText('affo@merceriepdj.test', { exact: true })).toBeVisible();
  await expect(credentials.locator('.team-password')).toHaveText(/^PdJ-/);

  await credentials.getByRole('button', { name: 'J’ai noté' }).click();
  await expect(page.getByText('affo@merceriepdj.test')).toBeVisible();
  await expect(page.getByText('Le compte est créé. Transmets le mot de passe temporaire')).toBeVisible();
});

test('le superadmin réinitialise un mot de passe', async ({ page }) => {
  await openDemo(page, 'admin', 'equipe');

  const cashierRow = page.locator('.team-row', { hasText: 'caisse@merceriepdj.test' });
  page.on('dialog', (dialog) => void dialog.accept());
  await cashierRow.getByRole('button', { name: 'Mot de passe' }).click();

  const credentials = page.getByRole('dialog');
  await expect(
    credentials.getByRole('heading', { name: 'Mot de passe réinitialisé' }),
  ).toBeVisible();
  await expect(credentials.getByText('caisse@merceriepdj.test', { exact: true })).toBeVisible();
  await expect(credentials.locator('.team-password')).toHaveText(/^PdJ-/);

  await credentials.getByRole('button', { name: 'J’ai noté' }).click();
  await expect(credentials).toHaveCount(0);
});
