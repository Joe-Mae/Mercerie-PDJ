# Sauvegardes et restauration — Mercerie PDJ

**Version** : 9 novembre 2026  
**Public** : direction et personne qui administre le système  
**Guide utilisateur** : [guide-utilisateur.md](guide-utilisateur.md)

## Pourquoi une sauvegarde

La base contient l’historique des ventes, des paiements, du stock, de la caisse et des comptes. L’offre gratuite de l’hébergement ne fournit **aucune sauvegarde automatique**. Sans copie, une suppression de projet, une erreur de manipulation ou un incident chez l’hébergeur efface définitivement ces données.

Une sauvegarde n’est utile que si elle est :

- **récente** : tous les jours, après la fermeture ;
- **hors de l’ordinateur de la boutique** : dossier cloud ou disque externe ;
- **vérifiée** : le fichier existe, il est complet, et une restauration a déjà été testée ;
- **protégée** : elle contient des noms, des ventes et des références de paiement.

## Ce qui est sauvegardé

Chaque sauvegarde est un dossier horodaté, par exemple `2026-11-09_210000`, contenant :

| Fichier         | Contenu                                                                                                                              |
| --------------- | ------------------------------------------------------------------------------------------------------------------------------------ |
| `schema.sql`    | Structure applicative : schémas `public`, `private` et `app_private` — tables, contraintes, fonctions, déclencheurs, politiques RLS. |
| `data.sql`      | Données de la boutique : articles, stock, caisse, ventes, paiements, alertes, journal d’audit.                                       |
| `auth.sql`      | Comptes de connexion (`auth.users` et `auth.identities`), y compris les empreintes de mots de passe.                                 |
| `manifest.json` | Date, projet, versions, tailles, empreintes SHA-256, comptes clés et résultat des vérifications.                                     |

Les schémas gérés par Supabase (`auth`, `storage`, `vault`, `net`, `extensions`) ne sont pas copiés : un nouveau projet les fournit déjà. Les objets de l’application vivent tous dans `public`, `private` et `app_private`.

Ne sont **pas** dans la base et doivent être conservés séparément :

- les secrets Edge `VAPID_KEYS` et `PUSH_CONTACT` ;
- la clé secrète du projet enregistrée dans Vault (`send_push_apikey`) ;
- la clé publiable et l’URL du projet utilisées par l’application web ;
- les clés VAPID publiques et privées.

Sans ces secrets, la restauration des données fonctionne, mais les notifications push doivent être reconfigurées.

## Où sont les sauvegardes

Par défaut :

```text
C:\Users\Adjjo\OneDrive\Sauvegardes-Mercerie-PDJ
```

Le dossier est synchronisé par OneDrive. À côté des dossiers horodatés, il contient `etat-sauvegarde.json` (dernier résultat), `derniere-cloture.txt` (dernière clôture sauvegardée) et `_journaux\sauvegardes.log`. **Ne placez jamais une sauvegarde dans le dépôt Git** : le dépôt actuel est public. Ne l’envoyez pas par e-mail et ne la partagez pas par un lien public.

Pour choisir un autre dossier (disque externe, autre dossier synchronisé) :

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File scripts/sauvegarde.ps1 -Destination "D:\Sauvegardes-Mercerie-PDJ"
```

## Installation

### 1. Vérifier le CLI Supabase

```powershell
supabase --version
supabase projects list
```

Si la commande demande une connexion :

```powershell
supabase login
```

Le CLI crée un rôle temporaire dans la base pour réaliser le dump. Ce rôle expire au bout de deux heures ; aucun mot de passe de base n’est stocké dans le projet.

### 2. Installer pg_dump 17

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File scripts/installer-outils-postgres.ps1
```

Le script télécharge les binaires officiels PostgreSQL pour Windows (environ 340 Mo) dans `.tools\pgsql`. Le dossier `.tools` est ignoré par Git.

### 3. Lancer une première sauvegarde manuelle

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File scripts/sauvegarde.ps1 -Destination "C:\Projects\Mercerie PDJ\backups"
```

Vérifiez ensuite :

```powershell
Get-Content "backups\etat-sauvegarde.json"
Get-ChildItem "backups" | Select-Object Name, LastWriteTime
Get-Content "backups\_journaux\sauvegardes.log" -Tail 20
```

Le fichier `etat-sauvegarde.json` doit indiquer `"statut": "succes"`. Le dossier horodaté doit contenir `schema.sql`, `data.sql`, `auth.sql` et `manifest.json`.

Exemple de première sauvegarde vérifiée le 9 novembre 2026 : `schema.sql` 198 Ko, `data.sql` 54 Ko, `auth.sql` 5 Ko, 28 tables de données, 4 profils et 1 vente.

### 4. Programmer la sauvegarde après la clôture de caisse

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File scripts/installer-tache-sauvegarde.ps1
```

La tâche **Mercerie PDJ - Sauvegarde après clôture** interroge la base toutes les **30 minutes**, de **8 h à 23 h 30**. Dès qu’une session de caisse a été fermée depuis la dernière copie, elle lance la sauvegarde immédiatement. Si aucune sauvegarde n’a réussi dans la journée, une copie de secours part à **23 h 30**.

La détection se fait sur `public.cash_sessions.fermee_at`. La date de la dernière clôture sauvegardée est conservée dans `derniere-cloture.txt`, à côté des copies.

Si l’ordinateur était éteint, la tâche démarre à la prochaine ouverture de session (`StartWhenAvailable`) et rattrape la clôture manquée.

Pour changer la fenêtre de contrôle :

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File scripts/installer-tache-sauvegarde.ps1 -Debut 07:00 -IntervalleMinutes 15
```

La tâche ne fonctionne que si l’ordinateur est allumé, connecté à Internet et si la session Windows est ouverte. Pour une sauvegarde qui ne dépend pas de l’ordinateur, voir la section « Sauvegarde dans le cloud » plus bas.

### 5. Tester la tâche

Dans le Planificateur de tâches Windows :

1. Ouvrez **Planificateur de tâches**.
2. Cherchez **Mercerie PDJ - Sauvegarde après clôture**.
3. Clic droit → **Exécuter**.
4. Vérifiez `etat-sauvegarde.json`, `derniere-cloture.txt` et le journal.
5. Relancez la tâche : elle doit répondre « Aucune nouvelle clôture » sans créer de deuxième copie.

Après une vraie clôture de caisse, la copie part au contrôle suivant (30 minutes au plus).

## Vérification et rétention

Le déclencheur :

- lit la dernière clôture de caisse (`public.cash_sessions.fermee_at`) ;
- compare cette date à `derniere-cloture.txt` ;
- ne lance la sauvegarde que si une clôture plus récente existe, ou en secours à 23 h 30 ;
- ne crée jamais deux copies pour la même clôture.

Le script de sauvegarde :

- refuse de démarrer si `pg_dump` ou le CLI manquent ;
- vérifie que les trois fichiers existent, ne sont pas vides et contiennent les tables clés (`profiles`, `sales`, `stock_movements`, `payments`) ;
- relève le nombre de ventes, mouvements, profils, paiements et alertes ;
- calcule les empreintes SHA-256 ;
- n’écrit le dossier définitif qu’après toutes les vérifications ;
- conserve **30 sauvegardes quotidiennes** et la **première sauvegarde de chacun des 12 derniers mois** ;
- ne supprime que les dossiers correspondant exactement au format `AAAA-MM-JJ_HHMMSS` et contenant un `manifest.json` ; tout autre dossier est conservé ;
- écrit `etat-sauvegarde.json` et `_journaux\sauvegardes.log`.

### Chaque mois

- Vérifiez que le dossier OneDrive contient une sauvegarde de moins de 24 heures.
- Ouvrez le `manifest.json` de la sauvegarde la plus récente et vérifiez la date et les comptes.
- Vérifiez que `etat-sauvegarde.json` indique `succes`.
- Si le statut est `echec`, lisez la fin du journal et corrigez avant de continuer.

### Chaque trimestre

Testez une restauration complète dans un projet **vide**, jamais sur la boutique en production. Voir la procédure ci-dessous et remplissez le tableau de suivi.

## Restauration

> **Ne restaurez jamais dans le projet de production.** Une restauration écrase ou complète des tables existantes. Utilisez un projet Supabase vide, puis basculez l’application seulement après vérification.

### Prérequis

- Une sauvegarde vérifiée (`statut: succes`).
- Un projet Supabase **vide**, gratuit, dans la même région si possible.
- Le mot de passe de la base du projet cible (affiché à la création ; sinon, réinitialisez-le dans **Project Settings → Database**).
- La chaîne de connexion **Session pooler** du projet cible (**Connect** dans le tableau de bord Supabase).
- `psql` 17, fourni par `scripts/installer-outils-postgres.ps1`.
- Les secrets Edge et la clé Vault du projet source, conservés hors de la base.
- Le CLI Supabase connecté (`supabase login`) pour déployer la fonction Edge.

### 1. Vérifier l’intégrité de la sauvegarde

Dans PowerShell :

```powershell
$backup = "C:\Users\Adjjo\OneDrive\Sauvegardes-Mercerie-PDJ\2026-11-09_210000"
Get-Content "$backup\manifest.json"
Get-FileHash "$backup\schema.sql" -Algorithm SHA256
Get-FileHash "$backup\data.sql" -Algorithm SHA256
Get-FileHash "$backup\auth.sql" -Algorithm SHA256
```

Comparez chaque empreinte avec celle du manifeste. Si une empreinte diffère, **ne restaurez pas** : prenez une autre sauvegarde et prévenez la personne qui administre le système.

### 2. Restaurer la structure

Remplacez `<ref>` et `<region>` par ceux du projet cible. `psql` demande le mot de passe de la base ; ne l’écrivez pas dans un fichier.

```powershell
$psql = "C:\Projects\Mercerie PDJ\.tools\pgsql\bin\psql.exe"
$target = "postgresql://postgres.<ref>@aws-1-<region>.pooler.supabase.com:5432/postgres"

& $psql $target -W -v ON_ERROR_STOP=1 --single-transaction -f "$backup\schema.sql"
```

Le dump crée aussi les schémas `private` et `app_private`, qui contiennent les fonctions internes (rôle courant, mouvements de stock, webhook des alertes). Les rôles `anon`, `authenticated` et `service_role` existent déjà dans un projet Supabase : aucun fichier de rôles n’est nécessaire.

### 3. Restaurer les données

`session_replication_role = replica` désactive les déclencheurs métier pendant l’import, pour éviter de recréer des mouvements ou des alertes en double. Les clés étrangères restent vérifiées ; l’ordre du dump pg_dump est prévu pour cela.

```powershell
& $psql $target -W -v ON_ERROR_STOP=1 --single-transaction `
  -c "set session_replication_role = replica;" `
  -f "$backup\data.sql"
```

Restaurez ensuite les comptes de connexion :

```powershell
& $psql $target -W -v ON_ERROR_STOP=1 --single-transaction `
  -c "set session_replication_role = replica;" `
  -f "$backup\auth.sql"
```

### 4. Vérifier les comptes et les données

Dans le **SQL Editor** du projet cible :

```sql
select 'sales' as table, count(*) from public.sales
union all select 'stock_movements', count(*) from public.stock_movements
union all select 'profiles', count(*) from public.profiles
union all select 'payments', count(*) from public.payments
union all select 'alerts', count(*) from public.alerts;
```

Comparez avec la section `comptes` du `manifest.json`.

Vérifiez aussi les comptes :

```sql
select count(*) as comptes from auth.users;
select count(*) as identites from auth.identities;
```

Le champ `verification.comptes_ok` du manifeste confirme que `auth.sql` contient bien les deux tables. Connectez-vous ensuite avec un compte existant : si la connexion échoue, les comptes n’ont pas été restaurés. Ne modifiez jamais les identifiants de profils à la main : les ventes et le journal d’audit y font référence.

### 5. Reconfigurer les notifications

Les secrets ne sont pas dans la base. Sur le projet cible :

1. Déployez la fonction avec les secrets VAPID :

```powershell
npx supabase secrets set --project-ref <ref> VAPID_KEYS='...' PUSH_CONTACT='...'
npx supabase functions deploy send-push --project-ref <ref>
```

2. Enregistrez la clé secrète du **nouveau projet** dans Vault :

```sql
select vault.create_secret('<clé-secrète-du-projet>', 'send_push_apikey', 'Webhook send-push');
```

3. Mettez l’URL du webhook à jour dans la fonction `private.notify_alert_push` : remplacez la référence de l’ancien projet par `<ref>` dans l’appel `net.http_post`, puis exécutez la définition mise à jour dans le SQL Editor. La migration `14_push_webhook` contient le modèle.

4. Réabonnez les appareils depuis **Alertes → Notifications**. Les anciens abonnements restent dans la base mais peuvent être révoqués par le service de push si les clés VAPID ont changé.

### 6. Rebrancher l’application

Mettez à jour les variables du projet cible :

```text
VITE_SUPABASE_URL=https://<ref>.supabase.co
VITE_SUPABASE_PUBLISHABLE_KEY=<clé-publiable-du-projet>
VITE_VAPID_PUBLIC_KEY=<clé-publique-VAPID>
```

Reconstruisez et redéployez l’application web. Ne mettez jamais la clé `service_role` dans le front-end.

### 7. Vérifier le parcours réel

1. Connectez-vous avec un administrateur, puis avec un caissier.
2. Vérifiez le stock, les alertes et le tableau de bord.
3. Ouvrez la caisse avec un petit fond, vendez un article, encaissez et clôturez.
4. Vérifiez la reference du ticket, la synchronisation et l’écart de caisse.
5. Vérifiez qu’un vendeur ne voit ni la caisse ni le bénéfice.
6. Testez une notification push sur un appareil.
7. Consultez les politiques RLS : un caissier ne doit pas pouvoir enregistrer un mouvement de stock ni prendre en charge une alerte.

### 8. Clôturer l’exercice

- Notez la date, la personne, la sauvegarde utilisée et le résultat.
- Supprimez le projet de test dans Supabase (c’est une ressource de test, pas une donnée métier).
- Ne supprimez jamais la sauvegarde utilisée avant d’avoir un test réussi.

## Suivi des tests de restauration

| Date | Sauvegarde testée | Projet cible | Réalisé par | Résultat | Remarques |
| ---- | ----------------- | ------------ | ----------- | -------- | --------- |
|      |                   |              |             |          |           |

Objectif : un test au moins tous les trois mois, et après tout changement important de schéma.

## Sauvegarde dans le cloud (option)

La tâche Windows dépend de l’ordinateur et de la session ouverte. Pour une copie qui tourne même ordinateur éteint, utilisez un **dépôt GitHub privé dédié** et un workflow planifié, ou un autre hébergement de fichiers. Ne réutilisez pas le dépôt public actuel : les sauvegardes contiennent des données personnelles.

Dans ce cas, les secrets `SUPABASE_ACCESS_TOKEN` (jeton à portée limitée) et, si nécessaire, le mot de passe de la base, sont stockés dans les **secrets GitHub**, jamais dans le dépôt.

## Sécurité

- Les sauvegardes contiennent des adresses e-mail, des noms, des ventes, des références Mobile Money et des empreintes de mots de passe.
- Protégez le compte OneDrive par un mot de passe fort et la double authentification.
- Ne partagez jamais le dossier de sauvegarde.
- Pour un disque externe ou une clé USB, utilisez BitLocker ou une archive chiffrée.
- Supprimez les anciennes sauvegardes uniquement par la rétention du script ; ne videz pas le dossier à la main.
- Le dossier `.tools` et le dossier `backups` sont ignorés par Git. Vérifiez avec `git status` avant tout envoi.

## Dépannage

| Symptôme                                     | Cause probable                                                                         | Solution                                                                                                  |
| -------------------------------------------- | -------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------- |
| « La commande supabase est introuvable »     | CLI absent du PATH.                                                                    | Réinstallez le CLI ou ajoutez `%APPDATA%\npm` au PATH.                                                    |
| « Access token not provided »                | Session CLI expirée.                                                                   | `supabase login` puis relancez.                                                                           |
| « pg_dump est introuvable »                  | Outils PostgreSQL absents.                                                             | `scripts/installer-outils-postgres.ps1`.                                                                  |
| Le CLI affiche « docker: command not found » | La commande `supabase db dump` complète passe par Docker.                              | Normal : le script n’utilise que le rôle temporaire et le `pg_dump` local.                                |
| « Le CLI n’a pas fourni PGPASSWORD »         | Session CLI expirée ou projet non lié.                                                 | `supabase login`, puis relancez.                                                                          |
| Connexion à la base impossible               | Le projet est en IPv6 seul et le réseau ne le supporte pas, ou le projet est en pause. | Utilisez la chaîne Session pooler avec le mot de passe, ou réactivez le projet.                           |
| « Une sauvegarde est déjà en cours »         | Verrou présent.                                                                        | Attendez la fin ; après 6 h, vérifiez qu’aucune sauvegarde ne tourne puis supprimez `.verrou-sauvegarde`. |
| `etat-sauvegarde.json` en `echec`            | Dump incomplet, disque plein, CLI déconnecté.                                          | Lisez `_journaux\sauvegardes.log`, corrigez, relancez à la main.                                          |
| La tâche ne s’exécute pas après une clôture  | Ordinateur éteint, session fermée ou CLI déconnecté.                                   | Elle démarre à la prochaine ouverture de session ; vérifiez l’historique du Planificateur et le journal.  |
| « Aucune nouvelle clôture »                  | La dernière session fermée a déjà été sauvegardée.                                     | Aucune action : la copie partira à la prochaine clôture ou à 23 h 30.                                     |
| Aucune synchronisation OneDrive              | OneDrive arrêté ou compte déconnecté.                                                  | Relancez OneDrive et vérifiez la synchronisation.                                                         |
| Un rôle `cli_login_postgres` apparaît        | Rôle temporaire créé par le CLI.                                                       | Il expire au bout de deux heures. Ne le réutilisez pas.                                                   |
