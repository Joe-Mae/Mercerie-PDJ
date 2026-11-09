import { expect, test } from '@playwright/test';
import { heading, openDemo, sidebarButton, type DemoRole } from './support';

const NAVIGATION: Readonly<Record<DemoRole, readonly string[]>> = {
  admin: [
    'Tableau de bord',
    'Alertes',
    'Caisse',
    'Stock',
    'Journal des ventes',
    'Équipe et droits',
  ],
  owner: ['Tableau de bord', 'Alertes', 'Caisse', 'Stock', 'Journal des ventes'],
  cashier: ['Tableau de bord', 'Alertes', 'Caisse', 'Stock', 'Journal des ventes'],
  seller: ['Tableau de bord', 'Alertes', 'Préparer une vente', 'Stock'],
};

const FORBIDDEN: Readonly<Record<DemoRole, readonly string[]>> = {
  admin: ['Préparer une vente'],
  owner: ['Préparer une vente', 'Équipe et droits'],
  cashier: ['Préparer une vente', 'Équipe et droits'],
  seller: ['Caisse', 'Journal des ventes', 'Équipe et droits'],
};

const GREETING: Readonly<Record<DemoRole, RegExp>> = {
  admin: /Bonjour, Mme\./,
  owner: /Bonjour, Koffi/,
  cashier: /Bonjour, Awa/,
  seller: /Bonjour, Kossi/,
};

const DESTINATIONS: Readonly<Record<DemoRole, readonly (readonly [string, string])[]>> = {
  admin: [
    ['Alertes', 'Ce qui demande ton attention'],
    ['Caisse', 'Ouvrir la caisse'],
    ['Stock', 'Le stock de la boutique'],
    ['Journal des ventes', 'Les tickets de la journée'],
    ['Équipe et droits', 'Chacun son compte, chacun son rôle'],
    ['Tableau de bord', 'Tableau de bord'],
  ],
  owner: [
    ['Alertes', 'Ce qui demande ton attention'],
    ['Caisse', 'Ouvrir la caisse'],
    ['Stock', 'Le stock de la boutique'],
    ['Journal des ventes', 'Les tickets de la journée'],
  ],
  cashier: [
    ['Alertes', 'Ce qui demande ton attention'],
    ['Caisse', 'Ouvrir la caisse'],
    ['Stock', 'Le stock de la boutique'],
    ['Journal des ventes', 'Les tickets de la journée'],
  ],
  seller: [
    ['Alertes', 'Ce qui demande ton attention'],
    ['Préparer une vente', 'Préparer une vente pour le caissier'],
    ['Stock', 'Le stock de la boutique'],
  ],
};

for (const role of ['admin', 'owner', 'cashier', 'seller'] as const) {
  test.describe(`rôle ${role}`, () => {
    test('affiche seulement les menus autorisés', async ({ page }) => {
      await openDemo(page, role);
      await expect(heading(page, GREETING[role])).toBeVisible();
      await expect(page.getByText('Aperçu — données de démonstration')).toBeVisible();

      for (const label of NAVIGATION[role]) {
        await expect(sidebarButton(page, label)).toBeVisible();
      }

      for (const label of FORBIDDEN[role]) {
        await expect(sidebarButton(page, label)).toHaveCount(0);
      }
    });

    test('ouvre chaque page autorisée depuis le menu', async ({ page }) => {
      await openDemo(page, role);

      for (const [label, title] of DESTINATIONS[role]) {
        await sidebarButton(page, label).click();

        if (title === 'Tableau de bord') {
          await expect(heading(page, GREETING[role])).toBeVisible();
        } else {
          await expect(heading(page, title)).toBeVisible();
        }
      }
    });
  });
}

test('une page interdite demandée par URL retombe sur le tableau de bord', async ({ page }) => {
  await openDemo(page, 'seller', 'caisse');

  await expect(heading(page, /Bonjour, Kossi/)).toBeVisible();
  await expect(heading(page, 'Ouvrir la caisse')).toHaveCount(0);
});
