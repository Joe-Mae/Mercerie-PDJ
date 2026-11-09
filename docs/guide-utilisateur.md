# Guide utilisateur — Mercerie PDJ

**Version** : 9 novembre 2026  
**Public** : direction, caisse, vente  
**Application** : Mercerie PDJ, installable sur tablette, téléphone et ordinateur

> **Les trois règles de la boutique**
>
> 1. **Rien ne se supprime.** Une erreur se corrige par une opération qui laisse une trace.
> 2. **Le stock est un registre de mouvements.** Une quantité ne s’écrase jamais à la main.
> 3. **Toute sortie de stock hors vente exige un motif.** Perte, casse, vol ou correction : le motif est obligatoire.

Ce guide décrit les écrans disponibles aujourd’hui. Deux fonctions sont encore en préparation : la fiche de préparation du vendeur et la gestion des comptes depuis l’application. Elles sont signalées au fil du texte et reprises au chapitre 9.

## Sommaire

1. [Se connecter](#1-se-connecter)
2. [Les trois rôles](#2-les-trois-rôles)
3. [Le tableau de bord](#3-le-tableau-de-bord)
4. [La caisse](#4-la-caisse)
5. [Le stock](#5-le-stock)
6. [Les alertes et les notifications](#6-les-alertes-et-les-notifications)
7. [Hors ligne et synchronisation](#7-hors-ligne-et-synchronisation)
8. [Installer l’application](#8-installer-lapplication)
9. [Journal des ventes, préparation et équipe](#9-journal-des-ventes-préparation-et-équipe)
10. [Sauvegardes (direction)](#10-sauvegardes-direction)
11. [En cas de problème](#11-en-cas-de-problème)
12. [Aide-mémoire caisse](#12-aide-mémoire-caisse)

---

## 1. Se connecter

L’adresse de l’application est fournie par la personne qui a installé le système. Utilise un navigateur récent : Chrome, Edge, Firefox ou Safari 16.4 ou plus.

### 1.1 Connexion avec l’adresse e-mail

1. Ouvre l’adresse de la boutique.
2. Saisis ton **adresse e-mail** et ton **mot de passe**, puis appuie sur **Se connecter**.
3. Le bouton indique **Connexion…** pendant la vérification.

Chaque personne utilise **son propre compte**. Ne partage jamais un mot de passe : les ventes, les remises et les mouvements de stock sont signés par le compte connecté.

| Message affiché                                                                | Ce qu’il faut faire                                                            |
| ------------------------------------------------------------------------------ | ------------------------------------------------------------------------------ |
| « Adresse e-mail ou mot de passe incorrect. »                                  | Vérifie la saisie, majuscules comprises, puis réessaie.                        |
| « Ton adresse e-mail n’est pas encore confirmée. Demande à l’administrateur. » | Préviens la direction : le compte doit être confirmé.                          |
| « Trop de tentatives. Patiente une minute avant de réessayer. »                | Attends une minute avant de recommencer.                                       |
| « Connexion au serveur impossible. Vérifie le réseau puis réessaie. »          | Vérifie le Wi-Fi ou les données mobiles.                                       |
| « Ce compte est désactivé… »                                                   | Le compte a été désactivé par la direction.                                    |
| « Aucun profil n’est associé à ce compte… »                                    | Le compte existe mais n’est pas rattaché à la boutique. Préviens la direction. |

### 1.2 Première connexion : le code à 4 chiffres

À la première connexion sur un appareil, l’application demande de choisir un **code personnel à quatre chiffres**. Ce code verrouille l’application quand tu t’en éloignes.

1. Saisis quatre chiffres sur le pavé, puis appuie sur la flèche de validation.
2. Saisis à nouveau les quatre mêmes chiffres pour confirmer.
3. Si les deux codes sont différents : « Les deux codes ne correspondent pas. Choisis un nouveau code. » ; recommence.
4. Pour renoncer : **Annuler et se déconnecter**.

Conseils :

- Évite `0000`, une date de naissance ou un code connu de toute l’équipe.
- Le code reste **sur cet appareil**. Il n’est pas partagé avec les autres tablettes.
- La direction peut réinitialiser l’accès à tout moment.

### 1.3 Déverrouiller l’application

Quand l’application est rouverte, l’écran **Application verrouillée** demande le code :

1. Saisis ton code à quatre chiffres.
2. En cas d’erreur : « Code incorrect. Il te reste N essais. »
3. Après **cinq codes incorrects**, le code enregistré sur l’appareil est effacé : « Cinq codes incorrects. Pour protéger la boutique, reconnecte-toi avec ton mot de passe. »

Le lien **Utiliser mon mot de passe** permet de revenir à la connexion e-mail / mot de passe. Le code enregistré sur l’appareil est alors effacé.

### 1.4 Se déconnecter

La déconnexion se trouve en bas de la barre latérale. Elle demande confirmation : « Te déconnecter ? Le code à 4 chiffres sera effacé de cet appareil. »

> **Avant de te déconnecter**, vérifie qu’il ne reste pas d’opérations en attente (chapitre 7). Une vente en attente doit être synchronisée avant de quitter l’appareil.

---

## 2. Les trois rôles

Les droits sont vérifiés **dans la base de données**, pas seulement à l’écran. Un bouton masqué ne peut pas être forcé depuis le navigateur.

| Fonction                     | Administrateur |    Caissier     |       Vendeur        |
| ---------------------------- | :------------: | :-------------: | :------------------: |
| Tableau de bord              |      Oui       |       Oui       |         Oui          |
| Alertes                      |     Toutes     | Stock seulement |   Stock seulement    |
| Caisse                       |      Oui       |       Oui       |         Non          |
| Préparer une vente           |      Non       |       Non       | Oui (en préparation) |
| Stock — Niveaux              |      Oui       |       Oui       |         Oui          |
| Stock — Catalogue            |      Oui       |       Non       |         Non          |
| Stock — Mouvements           |      Oui       |       Non       |         Non          |
| Stock — Import Excel         |      Oui       |       Non       |         Non          |
| Journal des ventes           |      Oui       |       Oui       |         Non          |
| Équipe et droits             | Superadmin seul |       Non       |         Non          |
| Remise sur un ticket         | Oui, en ligne  |       Non       |         Non          |
| Prendre en charge une alerte |      Oui       |       Non       |         Non          |
| Notifications push           |      Oui       |       Oui       |         Non          |

Le menu latéral affiche uniquement les pages autorisées. Sur téléphone, la barre du bas propose **Tableau**, **Alertes**, **Caisse**, **Préparer**, **Stock** et **Ventes** selon le rôle.

---

## 3. Le tableau de bord

Le tableau de bord est la première page après la connexion. Il affiche « Bonjour, {prénom}. », la date et le nom de la boutique.

### 3.1 Ce que voit l’administrateur

- **Ventes du jour** : total encaissé aujourd’hui, avec la comparaison par rapport à hier.
- **Bénéfice estimé** : marge brute calculée à partir des prix d’achat connus. Si certains coûts manquent : « Coûts d’achat incomplets ». Ce montant est réservé aux administrateurs.
- **Tickets encaissés** : nombre de tickets et panier moyen.
- **Alertes de stock** : nombre d’alertes et ruptures.
- **Ventes des 7 derniers jours**, **Meilleures ventes**, **Alertes de stock** et **Dernières ventes**.

### 3.2 Ce que voit le caissier

- **Ventes du jour**
- **Encaissé en espèces**, avec le fond de caisse
- **Mobile money** (T-Money et Flooz)
- **Stock faible**, à signaler à la direction

### 3.3 Ce que voit le vendeur

- **Articles suivis**
- **Stock faible**, à signaler avant la vente
- **Ruptures**, articles à commander

Le vendeur ne voit ni le chiffre d’affaires ni le bénéfice.

Un bandeau signale l’état des données : « Chargement des ventes du jour… », « Ventes enregistrées localement : dernière mise à jour disponible hors ligne. » ou un bouton **Réessayer** si le serveur est injoignable.

---

## 4. La caisse

La caisse est réservée à l’administrateur et au caissier.

> **Une session par appareil.** Une caisse ouverte sur une tablette ne peut pas être clôturée depuis une autre tablette. Seule la personne qui a ouvert la session, sur le même appareil, peut la clôturer.

### 4.1 Ouvrir la caisse

1. Ouvre **Caisse** dans le menu.
2. Dans le panneau **Ouvrir une caisse**, saisis le **Fond de caisse (F CFA)** : billets et pièces présents au départ.
   - Laisse vide si aucun fond n’est remis : le fond sera de 0.
   - Le montant doit être un nombre entier de francs, positif ou nul.
3. Appuie sur **Ouvrir la caisse**.

Erreurs possibles :

- « Le fond de caisse doit être un montant entier en francs. »
- « Le fond de caisse doit être un montant entier positif ou nul. »
- « Une caisse est déjà ouverte sur cet appareil. »

Une fois ouverte, l’écran **Encaisser une vente** affiche les **Espèces attendues dans le tiroir** : fond de caisse + ventes encaissées en espèces.

### 4.2 Encaisser une vente

1. **Choisir l’article** : appuie sur un article du catalogue, ou cherche par nom, couleur ou code court dans le champ **Nom, couleur ou code court…**.
2. **Ajuster la mesure** :
   - Choisis l’unité : **mètre**, **centimètre** ou **yard** pour un tissu ; **à l’unité** pour un article vendu à la pièce.
   - Saisis la quantité avec **trois décimales au maximum**.
   - Rappel : **1 yard = 90 cm**.
3. Vérifie le **Ticket en cours** : sous-total, remise éventuelle et **Total à payer**.
4. Choisis le moyen de paiement :
   - **Espèces** : saisis le **Montant reçu (F CFA)**. Laisse vide pour le montant exact. La **Monnaie à rendre** s’affiche automatiquement.
   - **T-Money** ou **Flooz** : saisis la **Référence T-Money/Flooz** (au moins 3 caractères), telle qu’elle apparaît sur le téléphone du client.
   - **Mixte** : saisis la **Part en espèces (F CFA)** et choisis l’opérateur Mobile Money pour le reste. La part en espèces doit être inférieure au total.
5. Appuie sur **Encaisser**.

Le prix est calculé sur la quantité exacte saisie et le prix unitaire. Le stock retire la quantité convertie en centimètres, arrondie au centimètre.

> Si le prix a changé entre l’affichage et l’encaissement, le serveur refuse la vente et affiche un message du type « Le prix de X a changé : N XOF attendu, M reçu. Vérifie le panier. » Actualise le ticket avant de réessayer.

### 4.3 Le ticket de vente

Après l’encaissement, le ticket s’affiche avec :

- la référence **PDJ-XXXX-XXXXXXXXXX** ;
- la date, le caissier, les lignes, le sous-total, la remise et son motif, le total, le total payé et la monnaie rendue ;
- la mention **Ticket synchronisé.** ou **Enregistré sur cet appareil, en attente de synchronisation.**

Boutons : **Imprimer** et **Nouvelle vente**.

Le ticket ne peut pas être supprimé. En cas d’erreur, signale-la à la direction : la correction se fait par une opération tracée, jamais par une suppression.

### 4.4 La remise (administrateur uniquement)

La case **Remise administrateur** n’apparaît que pour un administrateur connecté et en ligne.

1. Coche **Remise administrateur**.
2. Saisis le **Montant (F CFA)** et le **Motif** (au moins 3 caractères).
3. Le montant doit être un entier et ne peut pas dépasser le sous-total.

La remise est enregistrée avec son motif et son auteur. **Hors ligne, les remises sont bloquées** ; l’aide affiche « Les remises sont réservées aux administrateurs connectés. »

### 4.5 Clôturer la caisse

1. Appuie sur **Clôturer la caisse**.
2. Si un ticket est en cours, confirme : « Le ticket en cours sera abandonné. Veux-tu vraiment clôturer la caisse ? »
3. Dans la fenêtre **Clôturer la caisse**, lis **Espèces attendues** et **Tickets de la session**.
4. **Compte les espèces réellement présentes dans le tiroir**, puis saisis le **Montant compté dans le tiroir (F CFA)**.
5. L’**Écart de caisse** s’affiche :
   - « Caisse juste » si le montant compté correspond à l’attendu ;
   - « Manque en caisse » si le tiroir contient moins ;
   - « Excédent en caisse » s’il contient plus.
6. Appuie sur **Confirmer la clôture**.

Un écart est enregistré et signalé. Il crée une alerte **Écart de caisse** ; elle est critique à partir de 5 000 F CFA d’écart.

Si la clôture ne peut pas partir au serveur : « Clôture enregistrée sur l’appareil, en attente de synchronisation. » Elle partira au retour du réseau.

### 4.6 Erreurs fréquentes à la caisse

| Message                                                               | Cause                                                          | Solution                                            |
| --------------------------------------------------------------------- | -------------------------------------------------------------- | --------------------------------------------------- |
| « Ajoute au moins un article avant d’encaisser. »                     | Le ticket est vide.                                            | Choisis un article.                                 |
| « Corrige les quantités signalées avant d’encaisser. »                | Une quantité est invalide.                                     | Corrige la ligne signalée.                          |
| « Cet article se vend à l’unité. »                                    | Tu as choisi une unité de longueur pour un article à la pièce. | Choisis **à l’unité** et un nombre entier.          |
| « Saisis une quantité avec 3 décimales au maximum. »                  | Trop de décimales.                                             | Arrondis la quantité.                               |
| « Saisis la référence Mobile Money (au moins 3 caractères). »         | Référence absente ou trop courte.                              | Recopie la référence du téléphone.                  |
| « Le montant reçu est inférieur au total à payer. »                   | Espèces insuffisantes.                                         | Complète le montant ou change de moyen de paiement. |
| « La caisse n’est plus ouverte. Rouvre une session avant de vendre. » | Session clôturée ou expirée.                                   | Rouvre la caisse.                                   |

---

## 5. Le stock

Le menu **Stock** comporte jusqu’à quatre onglets : **Niveaux**, **Catalogue**, **Mouvements** et **Import Excel**. Le caissier et le vendeur ne voient que **Niveaux**.

### 5.1 Niveaux : l’inventaire

La page **Le stock de la boutique** affiche les quantités, les seuils et les prix.

- Pastilles : **variantes suivies**, **sous le seuil**, **en rupture**.
- Recherche : **Rechercher un article, une couleur, un code…**
- Filtre par catégorie : **Toutes** ou une catégorie précise.
- Colonnes : **Article**, **Code**, **Stock**, **Seuil**, **Prix**, **État**.
- États : **Rupture** (stock à zéro ou négatif), **Faible** (sous le seuil), **OK**.
- L’administrateur voit aussi le prix d’achat (« achat … »).

Rappel : « Le stock est un registre de mouvements : aucune quantité n’est écrasée. Toute sortie hors vente exige un motif. »

### 5.2 Mouvements (administrateur)

La page **Mouvements de stock** enregistre chaque entrée et chaque sortie.

1. Choisis **Article et couleur**.
2. Choisis le **Type de mouvement** :
   - **Entrée** : livraison, retour ou stock initial. La quantité s’ajoute au stock.
   - **Perte** : article abîmé, vol ou casse. La quantité est retirée. **Motif obligatoire.**
   - **Correction** : écart après comptage. Saisis `+` pour ajouter, `-` pour retirer. **Motif obligatoire.**
3. Saisis la **Quantité** dans l’unité de l’article (mètre, yard ou pièce).
4. Saisis le **Motif** (obligatoire pour une perte ou une correction).
5. Vérifie l’aperçu **Stock actuel X → après opération Y**.
6. Appuie sur **Enregistrer le mouvement**.

Le journal **Journal récent** conserve les 80 derniers mouvements de la boutique, avec la date, l’auteur, le type, la quantité signée et le motif.

Exemples :

- Livraison de 10 mètres de wax : type **Entrée**, quantité `10`, motif « Livraison fournisseur ».
- Casse de 0,5 mètre : type **Perte**, quantité `0,5`, motif « Tissu taché ».
- Erreur de 2 mètres en trop après inventaire : type **Correction**, quantité `-2`, motif « Écart d’inventaire ».

Une correction ne supprime rien : elle ajoute un mouvement qui explique l’écart.

### 5.3 Catalogue (administrateur)

La page **Articles, couleurs et prix** permet de créer et de mettre à jour le catalogue.

**Nouvel article** :

- **Catégorie** (ou **Créer une catégorie** si elle manque)
- **Nom de l’article**, **Description** (facultatif)
- **Type de stock** : **Tissu vendu au mètre ou au yard** ou **Article vendu à l’unité**
- **Unité de vente** : **Mètre**, **Yard (90 cm)** ou **Pièce**
- **Couleur**, **Code court**
- **Prix de vente (F CFA)**, **Prix d’achat (F CFA, facultatif)**
- **Seuil d’alerte** : une alerte apparaît sous ce niveau
- **Stock initial** : crée un mouvement de réception « Stock initial »

**Nouvelle couleur** : ajoute une variante à un article existant (couleur, code, unité, prix, seuil, stock initial).

**Modifier** : le nom, la description, la catégorie, le prix, le seuil et l’état actif. Le stock **ne se modifie pas ici** : « Le stock ne se modifie pas ici : utilise un mouvement d’entrée ou de correction. »

**Historique des prix** : chaque changement de prix de vente ou d’achat est daté, avec son auteur.

Une variante inactive porte le badge **Inactif** et n’est plus proposée à la vente. Une erreur de stock se corrige par un mouvement motivé, jamais par une suppression.

### 5.4 Import Excel (administrateur)

1. Appuie sur **Télécharger le modèle**.
2. Remplis le fichier `.xlsx` en conservant la première ligne de titres.
3. Dépose le fichier dans la zone **Dépose ton fichier .xlsx ici**, ou appuie sur **Choisir un fichier**.
4. Vérifie l’**Aperçu avant import** : « N lignes prêtes, N à corriger. »
5. Corrige les lignes en erreur dans le fichier, puis relance l’import.
6. Appuie sur **Importer N lignes**.

Le fichier crée les catégories et les articles manquants, met à jour les prix et ajoute le stock initial. **Une variante déjà connue ne reçoit jamais de stock en double.**

Règles du fichier :

- La dimension vaut `longueur` ou `unite`.
- L’unité de vente vaut `metre`, `yard` ou `piece`.
- Les seuils sont convertis au centimètre.
- **1 yard = 90 cm.**
- Le prix d’achat est facultatif et réservé aux administrateurs.

Si le fichier n’est pas au bon format : « Choisis un fichier Excel au format .xlsx. » ou « Le fichier n’a pas pu être lu. Vérifie le format. » Télécharge le modèle pour repartir d’une base correcte.

### 5.5 Quand une alerte de stock apparaît-elle ?

- **Faible** : la quantité est strictement inférieure au seuil, et le seuil est supérieur à zéro.
- **Rupture** : la quantité est égale à zéro ou négative.

Pour faire disparaître l’alerte, enregistre une **Entrée** (livraison, retour) ou une **Correction** motivée. L’alerte se résout automatiquement quand le stock repasse au-dessus du seuil.

---

## 6. Les alertes et les notifications

### 6.1 Le centre d’alertes

La page **Centre d’alertes** affiche ce qui demande votre attention. Aucune alerte n’est supprimée.

- Pastilles : **à traiter**, **prises en charge**, **résolues**.
- Sections : **À traiter** (les plus graves d’abord), **Prises en charge**, **Résolues** (les 12 résolutions les plus récentes).
- Types courants : **Stock bas**, **Stock négatif**, **Écart de caisse**.
- Gravités : **Information**, **À surveiller**, **Critique**.
- Bouton **Actualiser**.

**Prendre en charge** (administrateur uniquement) : marque l’alerte comme prise en charge et inscrit « Prise en charge par X le … ». La prise en charge nécessite une connexion.

Le caissier et le vendeur ne voient que les alertes de stock. Hors ligne : « Affichage des dernières alertes enregistrées sur cet appareil. La prise en charge nécessite une connexion. »

### 6.2 Les notifications push

Le panneau **Notifications** est visible pour l’administrateur et le caissier. Il permet d’être prévenu des alertes même quand l’application est fermée.

1. Ouvre **Alertes**.
2. Dans le panneau **Notifications**, appuie sur **Activer les notifications**.
3. Accepte la demande du navigateur.

États possibles :

| État                                           | Signification                                                                                   |
| ---------------------------------------------- | ----------------------------------------------------------------------------------------------- |
| « Notifications activées sur cet appareil »    | Tout fonctionne.                                                                                |
| « Notifications désactivées sur cet appareil » | Appuie sur **Activer les notifications**.                                                       |
| « Notifications bloquées par le navigateur »   | Autorise les notifications pour le site dans les réglages du navigateur, puis recharge la page. |
| « Notifications non disponibles »              | Utilise Chrome, Edge, Firefox ou Safari 16.4 ou plus récent.                                    |
| « Installe l’application d’abord »             | Sur iPhone/iPad, installe l’application avant d’activer les notifications.                      |
| « Notifications non configurées »              | Le service n’est pas encore configuré côté serveur. Préviens la direction.                      |

Pour arrêter les notifications sur un appareil, appuie sur **Désactiver**. Sur iPhone/iPad, l’application doit être installée sur l’écran d’accueil pour recevoir des notifications.

---

## 7. Hors ligne et synchronisation

L’application continue de fonctionner quand le réseau tombe. Les opérations sont enregistrées sur l’appareil, puis envoyées au serveur dans l’ordre, une seule fois chacune.

### 7.1 Ce qui reste possible hors ligne

| Fonction                          | Hors ligne                      |
| --------------------------------- | ------------------------------- |
| Vendre et encaisser               | Oui                             |
| Ouvrir et clôturer la caisse      | Oui                             |
| Consulter le stock                | Oui, dernière version mémorisée |
| Consulter les alertes             | Oui, en lecture                 |
| Prendre en charge une alerte      | Non                             |
| Remise                            | Non                             |
| Créer un article ou une variante  | Non                             |
| Enregistrer un mouvement de stock | Non                             |
| Importer un fichier Excel         | Non                             |

### 7.2 Les indicateurs

En haut de l’écran, un bandeau indique l’état :

- **Hors ligne — N opérations en attente** : les ventes restent possibles et partiront au retour du réseau.
- **N opérations en attente** ou **Synchronisation en cours…** : les opérations partent dans l’ordre, une seule fois chacune.
- **Synchronisation bloquée** : une erreur empêche l’envoi. Lis le message, puis appuie sur **Réessayer**.
- **N opérations en attente d’un autre compte sur cet appareil** : une autre personne a utilisé l’appareil. Ne supprime pas les données du navigateur ; reconnecte le compte concerné pour que la file parte.

Le pied de la barre latérale indique **Connecté au serveur** ou **Hors ligne**.

### 7.3 Précautions

- Ne vide jamais les données du navigateur tant que des opérations sont en attente.
- Ne désinstalle pas l’application avec une file non vide.
- Avant de te déconnecter, vérifie qu’il ne reste pas d’opérations en attente.
- Si une synchronisation est bloquée, ne ressaisis pas la vente : la file contient déjà le ticket. Préviens la direction.

---

## 8. Installer l’application

L’application s’installe comme une application à part entière, avec une icône sur l’écran d’accueil. Elle fonctionne ensuite en plein écran et garde l’accès hors ligne.

### 8.1 Android, Windows, macOS, Linux

1. Ouvre l’application dans Chrome ou Edge.
2. Une bannière **Installer l’application** apparaît en bas : « Ouvre-la en plein écran sur cet appareil et garde l’accès hors ligne. »
3. Appuie sur **Installer**, puis confirme.
4. Si la bannière n’apparaît pas, utilise le menu du navigateur : **Installer l’application** ou **Ajouter à l’écran d’accueil**.

### 8.2 iPhone et iPad

1. Ouvre l’application dans **Safari**.
2. Appuie sur le bouton **Partager**.
3. Choisis **Sur l’écran d’accueil**, puis **Ajouter**.
4. Ouvre ensuite l’application depuis son icône.

Les notifications sur iPhone/iPad nécessitent cette installation, avec iOS 16.4 ou plus récent.

> L’installation et le mode hors ligne nécessitent une adresse **HTTPS** ou `localhost`. Si la bannière n’apparaît pas, vérifie avec la direction que le site est bien servi en HTTPS.

---

## 9. Journal des ventes, préparation et équipe

Le journal des ventes est complet. La préparation et la gestion des comptes depuis l’application arrivent dans une prochaine version.

### 9.1 Journal des ventes

Le menu **Journal des ventes** affiche les tickets de la journée de la boutique, les plus récents en premier.

- Chaque ticket indique l’heure, le nombre de lignes, le caissier, le moyen de paiement et le total.
- Les **ventes annulées restent visibles**, marquées « Annulée ». Elles ne comptent pas dans le total encaissé : une annulation laisse une trace.
- Les flèches changent de journée. Le bouton **Aujourd’hui** revient à la journée en cours. Si la journée choisie est vide, le journal indique la date de la dernière vente et propose de l’afficher.
- Le caissier voit les tickets, les espèces, le Mobile Money et son panier moyen. Les **coûts d’achat et le bénéfice sont réservés aux administrateurs**.
- Le bénéfice n’est calculé que si tous les articles de la journée ont un coût d’achat connu ; sinon il s’affiche « — » avec la mention « Coûts d’achat incomplets ».
- La page se rafraîchit toute seule et le bouton **Actualiser** relance la lecture. En cas de message d’erreur, vérifie la connexion puis réessaie : les ventes déjà validées restent conservées sur le serveur.
- **Appuie sur un ticket** pour revoir la vente en détail, comme une facture : les articles vendus avec leur quantité et leur prix, la remise éventuelle, le total et les paiements. Le bouton **Imprimer** sort cet aperçu. Les coûts d’achat n’apparaissent pas dans cet aperçu, même pour un administrateur.

### 9.2 Préparer une vente (vendeur)

La page **Préparer une vente pour le caissier** décrit le parcours, mais le bouton **Commencer une préparation** est encore désactivé. En attendant, le vendeur conseille le client, vérifie la disponibilité dans **Stock** et transmet au caissier.

Le vendeur ne peut ni encaisser, ni accorder une remise, ni annuler une vente.

### 9.3 Équipe et droits (superadmin)

La page **Équipe et droits** n’est visible que pour le **compte superadmin**, c’est-à-dire le compte administrateur marqué comme superadmin (celui qui installe et maintient le système). Les autres administrateurs, dont le propriétaire, ne voient ni le menu ni la page ; une adresse tapée directement retombe sur le tableau de bord.

Le superadmin peut, sans quitter l’application :

- **Créer un compte** en saisissant le nom, l’adresse e-mail et le rôle. Un mot de passe provisoire s’affiche **une seule fois** : il faut le noter ou le copier, puis le remettre à la personne, qui choisira ensuite son PIN à 4 chiffres.
- **Changer le rôle** d’un membre (administrateur, caissier, vendeur).
- **Désactiver** un membre qui quitte la boutique, puis le **réactiver** plus tard. Le compte n’est jamais supprimé : son historique reste rattaché.
- **Réinitialiser le mot de passe** d’un membre qui l’a oublié. Un nouveau mot de passe provisoire s’affiche une seule fois.

Règles appliquées côté serveur :

- Le **compte superadmin** ne peut être ni rétrogradé ni désactivé depuis la page : il reste le seul à pouvoir gérer l’équipe.
- **Un seul superadmin par boutique.**
- **Le dernier administrateur actif ne peut pas être désactivé.**
- Chaque création, changement de rôle, activation ou réinitialisation de mot de passe est inscrit dans le **journal d’audit**. Aucun mot de passe n’y figure.

---

## 10. Sauvegardes (direction)

La base contient l’historique des ventes, des paiements, du stock et de la caisse. Le plan gratuit de l’hébergement ne fournit **aucune sauvegarde automatique** : sans copie, une erreur de manipulation ou un incident chez l’hébergeur peut effacer définitivement cet historique.

### 10.1 Ce qui doit être en place

- Une **sauvegarde automatique après chaque clôture de caisse**, conservée **hors de l’ordinateur de la boutique** (dossier synchronisé ou dépôt privé), avec une copie de secours à 23 h 30 si aucune n’a réussi dans la journée.
- La conservation des **migrations** dans le dépôt du projet : elles permettent de recréer la structure de la base.
- Une **restauration testée** au moins une fois par trimestre, dans une base vide, jamais sur la boutique en production.

### 10.2 Ce que la direction vérifie

- **Chaque mois** : le dossier de sauvegarde contient une copie de moins de 24 heures après un jour de vente.
- **Chaque trimestre** : une restauration est testée et notée (date, personne, résultat).
- **Avant chaque changement important** (import massif, mise à jour) : une sauvegarde manuelle est faite.

### 10.3 En cas de doute

- Aucune sauvegarde récente : **ne continue pas les opérations sensibles** et préviens immédiatement la personne qui administre le système.
- Ne supprime jamais la dernière sauvegarde disponible.
- Conserve au moins une copie sur un support différent (dossier cloud et disque externe, par exemple).

La procédure technique (création, vérification et restauration) est tenue par la personne qui administre le système. Elle est détaillée dans [sauvegardes.md](sauvegardes.md) : installation, sauvegarde manuelle, contrôle des clôtures toutes les 30 minutes avec secours à 23 h 30, rétention et restauration dans un projet vide. La copie automatique est activée sur l’ordinateur de la boutique ; une restauration doit encore être testée avant l’ouverture aux vraies ventes.

---

## 11. En cas de problème

| Problème                                         | Que faire                                                                                                                           |
| ------------------------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------- |
| La connexion échoue                              | Vérifie le réseau, l’adresse e-mail et le mot de passe. Après plusieurs tentatives, attends une minute.                             |
| Code à 4 chiffres oublié                         | Appuie sur **Utiliser mon mot de passe**, reconnecte-toi, puis choisis un nouveau code.                                             |
| Cinq codes incorrects                            | Le code est effacé. Reconnecte-toi avec ton mot de passe.                                                                           |
| Les notifications n’arrivent pas                 | Vérifie l’état dans **Alertes → Notifications**. Autorise les notifications dans le navigateur. Sur iPhone, installe l’application. |
| « Synchronisation bloquée »                      | Lis le message, appuie sur **Réessayer**. Ne ressaisis pas la vente. Si le blocage persiste, préviens la direction.                 |
| « Une caisse est déjà ouverte sur cet appareil » | La session précédente n’a pas été clôturée. Retrouve la personne qui l’a ouverte ou préviens la direction.                          |
| Impossible de clôturer la caisse                 | Seule la personne qui a ouvert la session, sur le même appareil, peut la clôturer.                                                  |
| Le stock semble faux                             | Ne modifie pas la quantité à la main. Enregistre une **Correction** avec un motif, ou préviens la direction.                        |
| Un prix a changé pendant la vente                | Actualise le ticket, vérifie le prix affiché, puis encaisse à nouveau.                                                              |
| L’application ne s’installe pas                  | Vérifie que le site est en HTTPS et utilise Chrome, Edge ou Safari.                                                                 |
| L’écran **Journal des ventes** est vide          | C’est normal dans cette version : utilise le tableau de bord et les tickets imprimés.                                               |

**Dans tous les cas : ne supprime jamais une vente, une alerte, un mouvement de stock ou une sauvegarde pour « réparer » un problème.** Signale l’incident.

---

## 12. Aide-mémoire caisse

### Ouverture

1. Vérifie le réseau et l’indicateur **Connecté au serveur**.
2. Consulte les alertes de stock de la journée.
3. Ouvre **Caisse** et saisis le **Fond de caisse**.
4. Appuie sur **Ouvrir la caisse**.

### Vente

1. Cherche l’article par nom, couleur ou code.
2. Choisis l’unité et saisis la quantité (3 décimales au maximum).
3. Vérifie le total du **Ticket en cours**.
4. Choisis **Espèces**, **T-Money**, **Flooz** ou **Mixte**.
5. Saisis le montant reçu ou la référence Mobile Money.
6. Appuie sur **Encaisser**.
7. Imprime le ticket ou appuie sur **Nouvelle vente**.

### Clôture

1. Vérifie qu’il ne reste pas de ticket en cours.
2. Appuie sur **Clôturer la caisse**.
3. Compte les espèces du tiroir.
4. Saisis le **Montant compté dans le tiroir**.
5. Lis l’écart : **Caisse juste**, **Manque en caisse** ou **Excédent en caisse**.
6. Appuie sur **Confirmer la clôture**.
7. Vérifie qu’il ne reste pas d’opérations en attente.

### Fin de journée (direction)

1. Vérifie le tableau de bord : ventes du jour, tickets, alertes.
2. Vérifie que la caisse est clôturée et que la file de synchronisation est vide.
3. Vérifie la sauvegarde du jour.
4. Conserve les tickets papier de la journée.

---

## Annexes

### Conversions et arrondis

| Saisie    | Équivalent en stock        |
| --------- | -------------------------- |
| 1 mètre   | 100 cm                     |
| 1 yard    | 90 cm                      |
| 0,5 yard  | 45 cm                      |
| 1,25 yard | 112,5 cm, arrondi à 113 cm |

Le prix de la ligne est calculé sur la quantité exacte saisie. Le stock retire la quantité convertie en centimètres, arrondie au centimètre. Les articles à l’unité se saisissent en nombres entiers.

### Référence de ticket

Format : `PDJ-XXXX-XXXXXXXXXX`, où `XXXX` identifie l’appareil et `XXXXXXXXXX` le ticket. La référence est unique par boutique et figure sur le ticket imprimé.

### Petit lexique

- **Variante** : une couleur précise d’un article, avec son code, son prix et son stock.
- **Seuil d’alerte** : quantité en dessous de laquelle l’application signale un stock faible.
- **Rupture** : stock à zéro ou négatif.
- **Session de caisse** : période entre l’ouverture et la clôture d’une caisse sur un appareil.
- **File d’attente** : opérations enregistrées sur l’appareil en attendant le retour du réseau.
- **Synchronisation** : envoi des opérations en attente vers le serveur.
- **PIN** : code personnel à quatre chiffres qui verrouille l’application sur un appareil.
- **PWA** : application web installable sur l’écran d’accueil, qui fonctionne aussi hors ligne.
