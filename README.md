# Mercerie PDJ

Application de gestion de la mercerie **PDJ — Puits de Jacob** (Lomé, Togo) :
stock, caisse, ventes, prestations et suivi de l’équipe.
Interface en français, pensée d’abord pour tablette et smartphone.

## État actuel

**Étapes 1 à 8 terminées : socle métier, base Supabase, accès, gestion du stock,
caisse hors ligne, centre d’alertes, notifications Web Push, application installable,
tableau de bord des ventes réelles et journal des ventes par journée.**

Ce qui est en place :

- monorepo TypeScript strict avec npm workspaces ;
- module `@mercerie/core` sans dépendance à React ni à Supabase ;
- montants XOF en entiers, arrondis au franc le plus proche ;
- longueurs stockées en centimètres entiers, avec **1 yard = 90 cm** ;
- calcul des lignes au mètre, au yard ou à l’unité ;
- paiements multiples, Mobile Money avec référence, monnaie à rendre ;
- stock tenu comme un **registre de mouvements**, projection dans `stock_levels` ;
- alertes de franchissement de seuil et de stock négatif ;
- caisse attendue et écart de caisse ;
- déduplication et ordre des opérations hors ligne ;
- schéma PostgreSQL Supabase : catalogue, variantes, mouvements, ventes, paiements,
  sessions de caisse, journal d’audit, alertes, import Excel ;
- fonctions et triggers serveur (ventes, mouvements, protection du dernier administrateur) ;
- RLS activée sur toutes les tables, rôles `admin`, `cashier`, `seller` ;
- authentification email + mot de passe, puis **PIN local chiffré** sur l’appareil ;
- coquille front-end responsive aux couleurs PDJ, navigation selon le rôle ;
- tableau de bord alimenté par le stock et les ventes réels, avec bénéfice estimé
  réservé aux administrateurs et cache hors ligne ;
- journal des ventes réel par journée : tickets validés et annulés, moyens de paiement,
  navigation dans les journées et bénéfice administrateur ;
- catalogue administrateur : catégories, articles, couleurs, prix et seuils ;
- historique des prix et des coûts, daté et signé ;
- mouvements de stock motivés (entrée, perte, correction) et journal récent ;
- import Excel avec modèle téléchargeable, aperçu ligne par ligne et import partiel ;
- écritures catalogue et stock uniquement via des fonctions serveur contrôlées ;
- script de création des comptes de l’équipe ;
- caisse hors ligne : ouverture et clôture de session, ventes et paiements enregistrés
  localement dans Dexie, file d’attente ordonnée et idempotente ;
- écran de caisse tactile : recherche, mesure au mètre, au centimètre ou au yard,
  paiement espèces, T-Money, Flooz ou mixte, monnaie à rendre ;
- remise administrateur avec motif, bloquée hors ligne ;
- ticket imprimable et écart de caisse signé à la clôture ;
- centre d’alertes alimenté par le serveur : lecture selon le rôle, prise en charge
  administrateur journalisée, badge de navigation et cache local hors ligne ;
- notifications Web Push des alertes, abonnement par appareil, refus des rôles non
  concernés et révocation sans suppression ;
- application installable : manifeste, icônes, coquille mise en cache par Workbox et
  navigation hors ligne, avec une invitation à installer sur tablette et téléphone.

La sauvegarde automatique après clôture de caisse est active. Pas encore testé : la
restauration d’une copie. En cours : fiche de préparation du vendeur et gestion des
comptes depuis l’application.

## Guide utilisateur

Le mode d’emploi par rôle (connexion, caisse, stock, alertes, hors ligne, installation)
est dans [docs/guide-utilisateur.md](docs/guide-utilisateur.md).

## Décisions structurantes

- **Une instance par boutique** : le même code est déployé séparément pour chaque mercerie,
  avec sa propre base Supabase. La V1 ne gère que Mercerie PDJ.
- **1 yard = 90 cm** : règle métier PDJ, différente du yard standard de 91,44 cm.
- **Stock en centimètres entiers** : la quantité facturée est calculée sur la saisie exacte,
  puis le stock est arrondi au centimètre le plus proche.
- **XOF sans centimes** : tous les montants sont des entiers.
- **Connexion** : email et mot de passe à la première connexion, puis PIN local sur
  l’appareil. Le PIN `0000` ne sert qu’au développement.
- **Vendeur** : prépare les ventes et consulte le stock. Le caissier encaisse et édite le ticket.
- **Remises et annulations** : administrateur connecté uniquement, jamais hors ligne.
- **Aucune suppression** : une erreur se corrige par une opération datée et traçable.
- **Toute sortie de stock hors vente exige un motif.**
- **Droits vérifiés côté serveur** : RLS et fonctions `security definer` contrôlent les rôles,
  pas seulement l’interface.
- **Offre Supabase gratuite** : les sauvegardes quotidiennes sont assurées par un export
  externe (script fourni dans `scripts/`), puisque l’offre gratuite ne fournit pas les
  sauvegardes de l’offre Pro.

## Prérequis

- Node.js 22 ou plus récent, npm ;
- un projet Supabase (offre gratuite suffisante) pour le mode connecté ;
- la CLI Supabase pour appliquer les migrations.

## Installation

```bash
npm install
npm run dev
```

Sans configuration Supabase, l’application démarre en **mode aperçu** avec des données
fictives. Les liens directs permettent de voir chaque rôle :

```text
http://localhost:5173/?apercu=admin&page=dashboard
http://localhost:5173/?apercu=owner&page=dashboard
http://localhost:5173/?apercu=cashier&page=dashboard
http://localhost:5173/?apercu=seller&page=dashboard
```

`admin` est le compte superadmin (seul à voir **Équipe et droits**) ; `owner` est un
administrateur propriétaire qui n’y a pas accès.

Pages disponibles : `dashboard`, `alertes`, `caisse`, `inventaire`, `ventes`,
`preparer`, `equipe`.

Pour un administrateur, `inventaire` ouvre quatre onglets :

```text
?page=inventaire&onglet=niveaux      niveaux de stock et alertes
?page=inventaire&onglet=catalogue    articles, couleurs, prix et historique
?page=inventaire&onglet=mouvements   saisie motivée et journal des mouvements
?page=inventaire&onglet=import       import Excel et modèle
```

Caissiers et vendeurs voient uniquement les niveaux de stock, sans prix d’achat
ni onglet d’administration.

## Configuration Supabase

1. Créer un projet Supabase.
2. Appliquer les migrations :

```bash
supabase link --project-ref <reference-du-projet>
supabase db push
```

3. Copier `.env.example` vers `.env.local` et renseigner :

```text
VITE_SUPABASE_URL=https://<projet>.supabase.co
VITE_SUPABASE_PUBLISHABLE_KEY=<clé publiable>
SUPABASE_URL=https://<projet>.supabase.co
SUPABASE_SERVICE_ROLE_KEY=<clé de service>
BOUTIQUE_ID=b7e2c1a4-5d6f-4e8a-9b0c-1d2e3f4a5b6c
```

La clé publiable est la seule autorisée dans l’application web. La clé de service
reste sur la machine de l’administrateur et ne doit **jamais** être exposée au navigateur.

4. Créer les comptes de l’équipe :

```bash
npm run seed:users
```

Le script est idempotent et affiche les mots de passe générés une seule fois :

| Compte                          | Rôle     | Superadmin |
| ------------------------------- | -------- | :-------: |
| `superadmin@merceriepdj.test`   | admin    |    oui    |
| `proprietaire@merceriepdj.test` | admin    |    non    |
| `caisse@merceriepdj.test`       | caissier |    non    |
| `vente@merceriepdj.test`        | vendeur  |    non    |

À la première connexion, chacun choisit son PIN à 4 chiffres. Le PIN n’est jamais
envoyé au serveur : il chiffre localement la session avec AES-GCM 256 et une clé
dérivée par PBKDF2-SHA-256 (210 000 itérations).

## Rôles et droits

| Rôle           | Droits                                                                |
| -------------- | --------------------------------------------------------------------- |
| Superadmin      | Administrateur marqué « superadmin » : tout, plus la gestion de l’équipe. |
| Administrateur | Tout sauf la page équipe : catalogue, prix et historique, stock, ventes, caisse. |
| Caissier       | Ventes, encaissements, prestations, consultation du stock, caisse.    |
| Vendeur        | Consultation du stock et préparation des ventes. Ni caisse ni remise. |

Les remises et annulations sont réservées aux administrateurs connectés.
Le dernier administrateur actif ne peut pas être désactivé.

### Équipe et droits (superadmin)

La page **Équipe et droits** est réservée au compte superadmin. Elle permet de créer
un compte (mot de passe provisoire affiché une seule fois), changer un rôle,
désactiver ou réactiver un membre et réinitialiser un mot de passe. Aucun compte
n’est supprimé : chaque changement laisse une ligne dans `audit_log`.

Tout est vérifié côté serveur :

- lecture et modifications via les RPC `team_list`, `team_set_role`,
  `team_set_actif`, qui exigent `app_private.require_superadmin()` ;
- l’écriture directe sur `public.profiles` est retirée au rôle `authenticated` ;
- la création de compte et la réinitialisation passent par la fonction Edge
  `team-admin`, qui revérifie le superadmin et utilise la clé de service côté serveur.

Mise en place en production :

```bash
# 1. migration 17 (colonne est_superadmin, contraintes, RPC d’équipe)
npx supabase db push

# 2. fonction Edge (JWT vérifié, pas de secret supplémentaire)
npx supabase functions deploy team-admin
```

Puis désigner le compte superadmin, une seule fois, en SQL éditeur :

```sql
update public.profiles
  set est_superadmin = true
  where email = 'superadmin@merceriepdj.test';
```

La contrainte `profiles_one_superadmin_per_boutique` empêche d’en désigner un second.
`npm run seed:users` marque automatiquement ce compte comme superadmin en local.

## Catalogue, prix et stock

- Chaque couleur est une **variante** avec son propre stock, son seuil et son prix.
- Le prix de vente et le prix d’achat sont modifiables par un administrateur ;
  chaque changement est enregistré par un trigger dans l’historique daté.
- Le stock est un registre de mouvements : une entrée ajoute, une perte retire,
  une correction ajoute ou retire. Aucune quantité n’est écrasée.
- Une perte ou une correction exige un motif d’au moins trois caractères.
- Le stock négatif reste possible pour ne pas bloquer une vente déjà engagée.
- Les écritures passent par des fonctions `security definer` ; le rôle `authenticated`
  n’a que le droit de lecture sur les tables du catalogue.

### Import Excel

Le modèle contient une ligne par couleur avec les colonnes : code catégorie,
catégorie, article, description, dimension, couleur, code court, unité de vente,
prix de vente, prix d’achat, seuil d’alerte et stock initial.

- 500 lignes maximum par fichier ;
- les lignes valides sont importées même si d’autres sont en erreur ;
- une variante déjà connue met à jour ses prix, son seuil et sa couleur, mais son
  stock initial n’est **jamais** rajouté ;
- chaque stock initial crée un mouvement de réception « Stock initial (import) ».

## Caisse hors ligne

- Une seule session ouverte par appareil. Le fond de caisse est saisi à l’ouverture.
- Chaque vente, paiement et mouvement est d’abord écrit dans IndexedDB avec Dexie,
  puis envoyé au serveur par une file ordonnée.
- Chaque opération porte un identifiant UUID et une séquence propre à l’appareil ;
  le serveur rejoue sans doublon une opération déjà reçue.
- En cas d’échec, la file s’arrête pour préserver l’ordre. L’erreur s’affiche et
  l’opération peut être relancée manuellement ; les suivantes attendent.
- Hors ligne, les ventes, encaissements et la consultation du stock restent possibles.
  Les remises et annulations sont réservées aux administrateurs connectés.
- Le stock affiché déduit les ventes encore en attente de synchronisation.
- La clôture calcule les espèces attendues (fond + ventes espèces), enregistre le
  montant compté et l’écart signé. Le ticket reste consultable et imprimable.

Pour essayer : ouvrir la caisse, encaisser une vente, puis couper le réseau. La vente
reste enregistrée et le bandeau indique le nombre d’opérations en attente ; au retour
du réseau, la file part dans l’ordre, une seule fois par opération.

## Tableau de bord des ventes

Le tableau de bord lit les ventes validées par la fonction serveur
`get_sales_dashboard(p_days)`, agrégée et contrôlée par rôle.

- Ventes du jour, tickets encaissés, panier moyen, variation par rapport à la veille.
- Encaissements en espèces et en Mobile Money (T-Money et Flooz).
- Série des sept derniers jours, meilleures ventes et cinq derniers tickets.
- Le caissier voit aussi sa propre session de caisse et son fond d’ouverture.
- Le bénéfice estimé est **réservé aux administrateurs**. Il vaut
  `ventes − coûts d’achat` et reste vide tant qu’une ligne vendue n’a pas de coût
  connu : l’écran indique alors que les coûts sont incomplets. Ni le caissier ni
  le vendeur ne reçoivent de coût ou de bénéfice.
- Les ventes annulées et celles d’une autre boutique sont exclues. Les journées sont
  découpées selon le fuseau de la boutique (`Africa/Lome`).
- L’écran se rafraîchit toutes les 60 secondes, au retour sur l’onglet et au retour
  du réseau. La dernière réponse est mise en cache dans Dexie et réaffichée hors
  ligne. En cas d’erreur sans cache, un message français propose de réessayer.
- Le vendeur ne voit aucune section de ventes : seulement le stock et la préparation.

La fonction est `security definer` avec `search_path` fixé, révoquée pour `public`
et ouverte aux seuls rôles `admin` et `cashier`. Les lignes de vente et les coûts
ne quittent jamais la base : le client ne reçoit que des totaux.

## Journal des ventes

La page **Journal des ventes** lit `get_sales_journal(p_day)` pour une journée de la
boutique, `p_day` valant par défaut aujourd’hui dans le fuseau `Africa/Lome`.

- Tous les tickets de la journée sont listés, les plus récents en premier, avec l’heure,
  le nombre de lignes, le caissier et le moyen de paiement.
- Les **ventes annulées restent visibles**, marquées « Annulée ». Elles sont exclues du
  total encaissé et des totaux par moyen de paiement : une annulation laisse une trace.
- Les flèches changent de journée ; une journée vide rappelle la date de la dernière
  vente. Le serveur refuse une journée à venir.
- Le caissier voit les tickets, les espèces, le Mobile Money et son panier moyen.
  Les coûts d’achat et le bénéfice sont réservés aux administrateurs et restent vides
  tant qu’un coût manque.
- La page se rafraîchit toutes les 60 secondes, au retour sur l’onglet et au retour du
  réseau, avec un bouton **Actualiser**.
- Un clic sur un ticket ouvre un **aperçu façon facture** : référence, date, caissier,
  articles vendus avec quantité et prix, remise, total et paiements. L’aperçu est
  imprimable et lit `get_sale_detail(p_sale_id)`. Les coûts d’achat n’y figurent pas,
  même pour un administrateur.

Comme le tableau de bord, la fonction est `security definer`, révoquée pour `public`
et ouverte aux seuls rôles `admin` et `cashier`.

## Centre d’alertes

- Les alertes sont créées par le serveur : stock sous le seuil, stock négatif, écart
  de caisse à la clôture, remise, annulation, ajustement ou connexion.
- Une alerte de stock est **résolue automatiquement** quand le stock repasse au-dessus
  du seuil. `resolved_at` reste piloté par le système.
- La **prise en charge** est un acte humain séparé (`acknowledged_at`) : réservée aux
  administrateurs connectés, idempotente et journalisée dans `audit_log`.
- Aucune alerte n’est supprimée : l’historique reste consultable dans « Résolues ».
- Le caissier et le vendeur ne voient que les alertes de stock ; l’administrateur voit
  aussi les écarts de caisse et les autres événements.
- Le badge de navigation compte les alertes ni résolues ni prises en charge. La page
  se rafraîchit toutes les 60 secondes et au retour sur l’onglet.
- Hors ligne, les dernières alertes connues sont relues depuis le cache local ; la
  prise en charge nécessite une connexion.

## Notifications Web Push

Chaque alerte peut être poussée sur les appareils, même application fermée.

- Alertes de stock → administrateurs et caisse ; autres alertes → administrateurs.
- Une notification par alerte : le même `tag` remplace la précédente au lieu de s’empiler.
- Un clic ouvre directement le centre d’alertes (`?page=alertes`).
- Chaque appareil s’active séparément depuis la page Alertes. Le vendeur ne reçoit rien.
- La déconnexion et le bouton « Désactiver » révoquent l’abonnement. Un endpoint refusé
  par le service de push (404 ou 410) est marqué `revoked_at`, jamais supprimé.
- iPhone et iPad : iOS 16.4 ou plus récent, avec l’application ajoutée à l’écran d’accueil.
- La clé privée VAPID n’existe que dans les secrets Supabase. Seule la clé publique est
  compilée dans l’application web.

### Mise en place

1. Générer les clés :

```bash
npm run vapid:generate
```

2. Ajouter la clé publique dans `.env.local` :

```text
VITE_VAPID_PUBLIC_KEY=<clé-publique>
```

3. Créer `supabase/.env.functions.local` (ignoré par git) avec les valeurs affichées
   par le script :

```text
VAPID_KEYS='{"publicKey":{...},"privateKey":{...}}'
PUSH_CONTACT=adresse@exemple.com
```

4. Envoyer les secrets au projet, puis déployer la fonction :

```bash
npx supabase secrets set --env-file supabase/.env.functions.local
npx supabase functions deploy send-push
```

5. Enregistrer la clé secrète du projet dans Supabase Vault :

```sql
select vault.create_secret('<clé-secrète>', 'send_push_apikey', 'Webhook send-push');
```

Puis appliquer les migrations :

```bash
npx supabase db push
```

La migration `14_push_webhook` active `pg_net` et crée le déclencheur
`alerts_push_webhook` sur `public.alerts` (événement `INSERT`). La fonction privée
lit la clé dans Vault à chaque appel : elle ne figure ni dans le dépôt ni dans le
déclencheur. La fonction `send-push` n’accepte que cette clé
(`withSupabase({ auth: 'secret' })`) et vérifie que le corps est bien un `INSERT`
sur `public.alerts`. Le réglage `verify_jwt = false` est déclaré dans
`supabase/config.toml`. L’URL de la fonction est celle du projet
`uwruoxubqsyfhyxnmvdd` ; adapte-la dans la migration pour un autre projet.

6. Reconstruire l’application web pour intégrer la clé publique, puis activer les
   notifications depuis **Alertes → Notifications** sur chaque appareil.

Pour tester : activer les notifications, puis enregistrer un mouvement de stock qui
passe sous le seuil. La notification doit arriver même si l’onglet est fermé. En cas
d’échec, consulter les logs de la fonction (`supabase functions logs send-push`) et
l’historique des webhooks dans le schéma `net`.

En local, servir la fonction avec les mêmes secrets :

```bash
npx supabase functions serve send-push --env-file supabase/.env.functions.local
```

Un webhook local doit viser
`http://host.docker.internal:54321/functions/v1/send-push` et envoyer la clé
secrète locale dans l’en-tête `apikey`.

## Application installable (PWA)

L’application peut être ajoutée à l’écran d’accueil et s’ouvre alors en plein écran,
sans barre d’adresse. C’est aussi la condition pour recevoir les notifications sur
iPhone et iPad.

- Le service worker précache la coquille et les ressources du build (Workbox) : après
  une première visite, l’application démarre même sans réseau.
- Chaque nouveau build est précaché et prend la main au chargement suivant.
- Le bandeau « Installer l’application » utilise l’invitation native de Chrome,
  Edge et Android. Sur iPhone et iPad, il indique **Partager → Sur l’écran d’accueil**.
- Le bandeau peut être masqué ; l’installation reste possible depuis le menu du
  navigateur.
- Le service worker n’existe qu’en production. Pour tester l’installation et le mode
  avion :

```bash
npm run build
npm run preview
```

Le site doit être servi en **HTTPS** (ou sur `localhost`) pour que le service worker
et l’installation soient autorisés. Les icônes sont générées depuis le logo de la
boutique ; pour les régénérer après un changement de logo :

```powershell
powershell -ExecutionPolicy Bypass -File scripts/generate-icons.ps1
```

## Tests navigateur

Les parcours critiques sont couverts avec Playwright, sur l’aperçu de démonstration :
les tests ne touchent jamais la base Supabase et ne demandent aucun secret.

```bash
npx playwright install chromium   # une seule fois sur la machine
npm run test:e2e                  # rôles, caisse, stock, alertes, import, mobile
npm run test:e2e:pwa              # build de production, manifeste, cache et hors ligne
```

Les serveurs de test démarrent automatiquement : Vite sur `127.0.0.1:5174` pour les
parcours, et un build de production servi sur `127.0.0.1:4174` pour le service worker.
Le rapport HTML s’ouvre avec `npx playwright show-report` (ou
`npx playwright show-report playwright-report/pwa` pour la suite PWA).

Sont vérifiés : menus et pages par rôle, vente comptant et Mobile Money avec ticket,
clôture juste, motif obligatoire sur une sortie de stock, portée des alertes par rôle,
import du modèle Excel sans double stock, navigation mobile, manifeste, précache et
rechargement hors ligne. L’invitation d’installation dépend du navigateur réel et reste
à valider sur un appareil.

## Commandes

```bash
npm run dev            # application web en développement
npm run build          # build de production
npm run preview        # sert le build de production (service worker et PWA)
npm test               # tests Vitest (core, base, PIN, caisse hors ligne, push)
npm run test:watch     # tests en continu
npm run test:e2e       # tests navigateur Playwright sur l’aperçu
npm run test:e2e:pwa   # tests PWA sur un build de production
npm run typecheck      # core, db, web, service worker et logique des fonctions Edge
npm run format         # formatage Prettier
npm run format:check   # vérification du formatage
npm run seed:users     # création des comptes (nécessite .env.local)
npm run vapid:generate # génération des clés Web Push
```

## Structure

```text
apps/web                  application React + Vite
apps/web/src/auth         connexion, PIN local, coffre chiffré
apps/web/src/data         accès Supabase, contexte de stock, tableau de bord, démonstration
apps/web/src/offline      caisse Dexie, file d’attente et synchronisation
apps/web/src/pages        tableau de bord, alertes, caisse, stock, ventes, équipe
apps/web/src/ui           coquille, navigation, en-têtes
apps/web/src/lib/push.ts  support navigateur, permission et abonnement VAPID
apps/web/sw.ts            service worker : cache Workbox, notifications, hors ligne
apps/web/public/manifest.webmanifest  métadonnées d’installation
apps/web/public/icons     icônes de l’application
e2e                       parcours Playwright sur l’aperçu de démonstration
e2e-pwa                   manifeste, cache et hors ligne sur le build
playwright.config.ts      serveur de démonstration et scénarios
playwright.pwa.config.ts  build de production et tests PWA
supabase/functions/send-push  fonction Edge appelée par le webhook
supabase/functions/team-admin  création de compte et mots de passe (superadmin)
supabase/functions/_shared    logique pure et testée des notifications
packages/core             logique métier pure et testée
packages/core/src/money   montants XOF et arrondis
packages/core/src/units   mètres, centimètres, yards, unités
packages/core/src/pricing lignes, remises, paiements
packages/core/src/stock   mouvements, projection, alertes
packages/core/src/cash    caisse attendue et écarts
packages/core/src/sync    file d’attente et idempotence
packages/db               schéma et tests PostgreSQL (PGlite)
packages/db/src/testing   simulation de Supabase Auth et des rôles
supabase/migrations       schéma versionné de la base
scripts/seed-users.mjs    création des comptes de l’équipe
scripts/generate-vapid-keys.mjs  génération des clés Web Push
scripts/generate-icons.ps1       génération des icônes PWA depuis le logo
scripts/sauvegarde.ps1           sauvegarde vérifiée
scripts/sauvegarde-auto.ps1      déclenchement après clôture de caisse
scripts/installer-outils-postgres.ps1  pg_dump et psql portables
scripts/installer-tache-sauvegarde.ps1 tâche Windows de contrôle
docs/guide-utilisateur.md        mode d’emploi par rôle
docs/sauvegardes.md              procédure de sauvegarde et restauration
```

## Base de données

Les migrations créent :

- `boutiques`, `profiles`, `devices` et le journal de connexion ;
- `categories`, `articles`, `variants`, `prices` (historique daté) ;
- `stock_movements` (append-only) et `stock_levels` (projection) ;
- `sales`, `sale_lines`, `payments`, `cash_sessions` ;
- `audit_log`, `alerts`, `imports`, `import_rows`, `settings` ;
- la prise en charge des alertes (`acknowledged_at`, `acknowledged_by`) et la fonction
  `acknowledge_alert`, réservée aux administrateurs et idempotente ;
- `push_subscriptions` (un endpoint par appareil) et les fonctions
  `register_push_subscription` / `revoke_push_subscription`, réservées aux rôles
  concernés, avec réaffectation contrôlée et révocation sans suppression ;
- les fonctions de vente, de mouvement de stock, de caisse et d’audit ;
- `get_sales_dashboard`, lecture agrégée des ventes et du bénéfice pour les rôles
  `admin` et `cashier`, sans exposer les lignes ni les coûts au client ;
- `get_sales_journal`, journal d’une journée avec tickets validés et annulés, totaux
- `get_sale_detail`, détail d’un ticket (articles, remise, paiements) pour l’aperçu
  par moyen de paiement et bénéfice administrateur ;
- les fonctions de catalogue (`create_article_with_variant`, `update_variant`,
  `record_stock_movement`, `import_catalog`, entre autres) ;
- les politiques RLS par rôle, avec `TO authenticated` et contrôle d’appartenance.

Les tests de base s’exécutent sans Docker grâce à PGlite, qui simule
`auth.users`, `auth.uid()` et les rôles `anon`, `authenticated`, `service_role`.

## Règle de conversion

```text
1 m    = 100 cm
1 yard = 90 cm
0,5 yd = 45 cm
1,25 yd = 112,5 cm, arrondi à 113 cm pour le stock
```

Le prix d’une ligne est calculé à partir de la quantité exacte saisie et du prix
par unité de vente. Le stock retire la quantité canonique arrondie au centimètre.

## Sauvegardes

L’offre gratuite Supabase ne fournit pas de sauvegardes automatiques. Le dépôt contient
le script et la procédure :

- `scripts/sauvegarde.ps1` : dump du schéma applicatif (`public`, `private`,
  `app_private`), des données et des comptes, vérifications, empreintes SHA-256,
  rétention de 30 sauvegardes quotidiennes et 12 mensuelles ;
- `scripts/sauvegarde-auto.ps1` : détecte une clôture de caisse non encore
  sauvegardée et lance la copie ; secours à 23 h 30 ;
- `scripts/installer-outils-postgres.ps1` : installe `pg_dump` et `psql` 17 dans
  `.tools` (ignoré par Git), sans administrateur ;
- `scripts/installer-tache-sauvegarde.ps1` : enregistre la tâche Windows qui
  contrôle les clôtures toutes les 30 minutes, de 8 h à 23 h 30 ;
- [docs/sauvegardes.md](docs/sauvegardes.md) : installation, vérification, restauration
  dans un projet vide et suivi trimestriel.

Aucun mot de passe de base n’est stocké : le CLI Supabase fournit un rôle temporaire,
valable deux heures, le temps du dump. Les fichiers contiennent des données
personnelles et des empreintes de mots de passe : destination chiffrée ou protégée,
jamais dans le dépôt public.

La tâche **Mercerie PDJ - Sauvegarde après clôture** est enregistrée sur l’ordinateur
de la boutique et une première copie vérifiée a été déposée dans
`OneDrive\Sauvegardes-Mercerie-PDJ` le 9 novembre 2026. La restauration doit encore être
testée dans un projet vide.

## Prochaines étapes

1. Test de l’abonnement push sur un vrai appareil.
2. Test de restauration d’une sauvegarde dans un projet Supabase vide.
3. Journal des ventes réel, fiche de préparation du vendeur et gestion des comptes
   depuis l’application.
