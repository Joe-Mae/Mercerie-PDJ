import type { PGlite } from '@electric-sql/pglite';
import {
  ADMIN_ID,
  ARTICLE_ID,
  BOUTIQUE_ID,
  CASHIER_ID,
  CASH_SESSION_ID,
  DEVICE_ID,
  SUPERADMIN_ID,
  INACTIVE_ID,
  INACTIVE_VARIANT_ID,
  PAYMENT_ID,
  SALE_ID,
  SALE_LINE_ID,
  SELLER_ID,
  TISSU_CATEGORY_ID,
  VARIANT_ID,
} from '../fixtures';

export async function seedUsers(db: PGlite): Promise<void> {
  await db.exec(`
    insert into auth.users (id, email, raw_app_meta_data, raw_user_meta_data)
    values
      (
        '${ADMIN_ID}',
        'admin@test.local',
        '{"role":"admin","actif":true,"boutique_id":"${BOUTIQUE_ID}"}'::jsonb,
        '{"nom":"Admin Test"}'::jsonb
      ),
      (
        '${CASHIER_ID}',
        'caisse@test.local',
        '{"role":"cashier","actif":true,"boutique_id":"${BOUTIQUE_ID}"}'::jsonb,
        '{"nom":"Caisse Test"}'::jsonb
      ),
      (
        '${SELLER_ID}',
        'vente@test.local',
        '{"role":"seller","actif":true,"boutique_id":"${BOUTIQUE_ID}"}'::jsonb,
        '{"nom":"Vente Test"}'::jsonb
      ),
      (
        '${INACTIVE_ID}',
        'inactif@test.local',
        '{"role":"seller","actif":false,"boutique_id":"${BOUTIQUE_ID}"}'::jsonb,
        '{"nom":"Compte Inactif"}'::jsonb
      ),
      (
        '${SUPERADMIN_ID}',
        'superadmin@test.local',
        '{"role":"admin","actif":true,"boutique_id":"${BOUTIQUE_ID}"}'::jsonb,
        '{"nom":"Superadmin Test"}'::jsonb
      );

    update public.profiles
      set est_superadmin = true
      where id = '${SUPERADMIN_ID}';
  `);
}

export async function seedCatalog(db: PGlite): Promise<void> {
  await db.exec(`
    insert into public.articles (
      id, boutique_id, categorie_id, nom, dimension
    )
    values (
      '${ARTICLE_ID}',
      '${BOUTIQUE_ID}',
      '${TISSU_CATEGORY_ID}',
      'Satin duchesse test',
      'length'
    );

    insert into public.variants (
      id, boutique_id, article_id, couleur, code_court, dimension, unite_vente,
      prix_vente_xof, seuil_alerte
    )
    values (
      '${VARIANT_ID}',
      '${BOUTIQUE_ID}',
      '${ARTICLE_ID}',
      'Ivoire',
      'SAT-001',
      'length',
      'metre',
      5000,
      100
    );

    insert into public.variants (
      id, boutique_id, article_id, couleur, code_court, dimension, unite_vente,
      prix_vente_xof, seuil_alerte, actif
    )
    values (
      '${INACTIVE_VARIANT_ID}',
      '${BOUTIQUE_ID}',
      '${ARTICLE_ID}',
      'Noir',
      'SAT-002',
      'length',
      'metre',
      6000,
      0,
      false
    );

    insert into public.variant_costs (variant_id, boutique_id, prix_achat_xof, updated_by)
    values ('${VARIANT_ID}', '${BOUTIQUE_ID}', 3000, '${ADMIN_ID}');
  `);
}

export async function seedSaleData(db: PGlite): Promise<void> {
  await db.exec(`
    insert into public.devices (
      id, boutique_id, nom, plateforme, created_by
    )
    values ('${DEVICE_ID}', '${BOUTIQUE_ID}', 'Tablette caisse', 'web', '${ADMIN_ID}');

    insert into public.cash_sessions (
      id, boutique_id, device_id, ouverte_par, ouverte_at, fond_ouverture_xof
    )
    values (
      '${CASH_SESSION_ID}',
      '${BOUTIQUE_ID}',
      '${DEVICE_ID}',
      '${CASHIER_ID}',
      now(),
      10000
    );

    insert into public.sales (
      id, boutique_id, reference, cash_session_id, caissier_id, device_id,
      date_vente, sous_total_xof, remise_xof, total_xof
    )
    values (
      '${SALE_ID}',
      '${BOUTIQUE_ID}',
      'TEST-0001',
      '${CASH_SESSION_ID}',
      '${CASHIER_ID}',
      '${DEVICE_ID}',
      now(),
      7500,
      0,
      7500
    );

    insert into public.sale_lines (
      id, sale_id, boutique_id, kind, variant_id, designation,
      quantite_saisie, unite_saisie, quantite_stock, prix_unitaire_xof, prix_par, total_xof
    )
    values (
      '${SALE_LINE_ID}',
      '${SALE_ID}',
      '${BOUTIQUE_ID}',
      'article',
      '${VARIANT_ID}',
      'Satin duchesse test — Ivoire',
      1.5,
      'metre',
      150,
      5000,
      'metre',
      7500
    );

    insert into public.sale_line_costs (sale_line_id, boutique_id, cout_total_xof)
    values ('${SALE_LINE_ID}', '${BOUTIQUE_ID}', 4500);

    insert into public.payments (
      id, sale_id, boutique_id, method, montant_xof, reference_mobile, created_by
    )
    values (
      '${PAYMENT_ID}',
      '${SALE_ID}',
      '${BOUTIQUE_ID}',
      'tmoney',
      7500,
      'MOMO-TEST-001',
      '${CASHIER_ID}'
    );
  `);
}
