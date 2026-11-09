import { readFile } from 'node:fs/promises';
import { expect, test } from '@playwright/test';
import { heading, openDemo } from './support';

const XLSX_MIME = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';

test.describe('Import Excel', () => {
  test('télécharge le modèle, l’importe et ne double pas le stock existant', async ({ page }) => {
    await openDemo(page, 'admin', 'inventaire');
    await page.getByRole('tab', { name: 'Import Excel' }).click();
    await expect(heading(page, 'Importer le catalogue Excel')).toBeVisible();

    const downloadPromise = page.waitForEvent('download');
    await page.getByRole('button', { name: 'Télécharger le modèle' }).click();
    const download = await downloadPromise;
    expect(download.suggestedFilename()).toBe('modele-import-catalogue-mercerie-pdj.xlsx');

    const filePath = await download.path();
    expect(filePath).not.toBeNull();
    await page.locator('input[type="file"]').setInputFiles({
      name: 'modele-import-catalogue-mercerie-pdj.xlsx',
      mimeType: XLSX_MIME,
      buffer: await readFile(filePath!),
    });

    await expect(page.getByRole('heading', { name: 'Aperçu avant import' })).toBeVisible();
    await expect(page.getByText('3 lignes prêtes, 0 à corriger.')).toBeVisible();

    await page.getByRole('button', { name: 'Importer 3 lignes' }).click();
    await expect(page.getByText('3 lignes importées. Le catalogue est à jour.')).toBeVisible();
    await expect(page.getByRole('button', { name: 'Importer 3 lignes' })).toBeDisabled();

    await page.getByRole('tab', { name: 'Niveaux' }).click();
    await page.getByPlaceholder('Rechercher un article, une couleur, un code…').fill('BAZ-BL');

    const row = page.locator('.stock-row').filter({ hasText: 'BAZ-BL' });
    await expect(row).toHaveCount(1);
    await expect(row.locator('.stock-quantity')).toHaveText('3,5 m');
  });

  test('refuse un fichier qui n’est pas au format .xlsx', async ({ page }) => {
    await openDemo(page, 'admin', 'inventaire');
    await page.getByRole('tab', { name: 'Import Excel' }).click();

    await page.locator('input[type="file"]').setInputFiles({
      name: 'catalogue.csv',
      mimeType: 'text/csv',
      buffer: Buffer.from('article;couleur\nBazin;Blanc'),
    });

    await expect(page.getByText('Choisis un fichier Excel au format .xlsx.')).toBeVisible();
    await expect(page.getByRole('heading', { name: 'Aperçu avant import' })).toHaveCount(0);
  });
});
