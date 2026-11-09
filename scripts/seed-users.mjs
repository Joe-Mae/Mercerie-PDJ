import { randomBytes } from 'node:crypto';
import { createClient } from '@supabase/supabase-js';

const url = (process.env.SUPABASE_URL ?? process.env.VITE_SUPABASE_URL ?? '').trim();
const serviceKey = (process.env.SUPABASE_SERVICE_ROLE_KEY ?? '').trim();
const boutiqueId = (process.env.BOUTIQUE_ID ?? 'b7e2c1a4-5d6f-4e8a-9b0c-1d2e3f4a5b6c').trim();

const ACCOUNTS = [
  {
    email: 'superadmin@merceriepdj.test',
    nom: 'Superadmin PDJ',
    role: 'admin',
    estSuperadmin: true,
  },
  {
    email: 'proprietaire@merceriepdj.test',
    nom: 'Propriétaire PDJ',
    role: 'admin',
    estSuperadmin: false,
  },
  {
    email: 'caisse@merceriepdj.test',
    nom: 'Caisse PDJ',
    role: 'cashier',
    estSuperadmin: false,
  },
  {
    email: 'vente@merceriepdj.test',
    nom: 'Vente PDJ',
    role: 'seller',
    estSuperadmin: false,
  },
];

if (!url || !serviceKey) {
  console.error(
    'Variables manquantes. Renseigne SUPABASE_URL et SUPABASE_SERVICE_ROLE_KEY dans .env.local.',
  );
  process.exit(1);
}

if (!/^https?:\/\//.test(url)) {
  console.error('SUPABASE_URL doit commencer par https:// (ou http:// en local).');
  process.exit(1);
}

const supabase = createClient(url, serviceKey, {
  auth: { autoRefreshToken: false, persistSession: false },
});

const { data: listed, error: listError } = await supabase.auth.admin.listUsers({
  page: 1,
  perPage: 1000,
});

if (listError) {
  console.error(`Impossible de lister les comptes : ${listError.message}`);
  process.exit(1);
}

console.log('Création des comptes de la Mercerie PDJ\n');

let created = 0;
let updated = 0;

for (const account of ACCOUNTS) {
  const existing = listed.users.find(
    (user) => user.email?.toLowerCase() === account.email.toLowerCase(),
  );

  let userId;
  let password = null;

  if (existing) {
    const { error } = await supabase.auth.admin.updateUserById(existing.id, {
      user_metadata: { ...existing.user_metadata, nom: account.nom },
      app_metadata: {
        ...existing.app_metadata,
        role: account.role,
        boutique_id: boutiqueId,
        actif: true,
      },
    });

    if (error) {
      console.error(`${account.email} : mise à jour impossible (${error.message}).`);
      process.exitCode = 1;
      continue;
    }

    userId = existing.id;
    updated += 1;
  } else {
    password = randomBytes(18).toString('base64url');
    const { data, error } = await supabase.auth.admin.createUser({
      email: account.email,
      password,
      email_confirm: true,
      user_metadata: { nom: account.nom },
      app_metadata: {
        role: account.role,
        boutique_id: boutiqueId,
        actif: true,
      },
    });

    if (error || !data.user) {
      console.error(
        `${account.email} : création impossible (${error?.message ?? 'réponse vide'}).`,
      );
      process.exitCode = 1;
      continue;
    }

    userId = data.user.id;
    created += 1;
  }

  const { error: profileError } = await supabase.from('profiles').upsert(
    {
      id: userId,
      boutique_id: boutiqueId,
      email: account.email,
      nom: account.nom,
      role: account.role,
      actif: true,
      est_superadmin: account.estSuperadmin,
    },
    { onConflict: 'id' },
  );

  if (profileError) {
    console.error(`${account.email} : profil impossible (${profileError.message}).`);
    process.exitCode = 1;
    continue;
  }

  const status = password ? 'Créé' : 'Mis à jour';
  const credentials = password
    ? `mot de passe : ${password}`
    : 'mot de passe inchangé (utilise « mot de passe oublié » si besoin)';

  console.log(`${status} — ${account.email} [${account.role}] — ${credentials}`);
}

console.log(`\n${created} compte(s) créé(s), ${updated} compte(s) mis à jour.`);
console.log(
  'Le code à 4 chiffres est choisi sur l’appareil à la première connexion. En développement, 0000 peut être utilisé.',
);
console.log('Conserve les mots de passe affichés en lieu sûr : ils ne sont plus réaffichés.');
