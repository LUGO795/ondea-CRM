# Ondea CRM — Gestion des Clients

> **Gestion intelligente de la relation client.**
> Fiches clients, contacts, achats, devis, factures, interactions, fidélité, notes internes et documents.
> 100 % autonome : aucun serveur, aucune installation, aucune dépendance externe.

![Version](https://img.shields.io/badge/version-1.0-c9a24b)
![Stack](https://img.shields.io/badge/stack-HTML%20%C2%B7%20CSS%20%C2%B7%20JavaScript-0b0d10)
![Hors--ligne](https://img.shields.io/badge/hors--ligne-100%25-5aa87a)
![Données](https://img.shields.io/badge/donn%C3%A9es-IndexedDB-86b6d4)

Application de la gamme **Ondea Studio**, construite sur le même design system « Obsidienne & Or », la même architecture et les mêmes composants qu'**Ondea Stock Intelligence**.

---

## Sommaire

1. [Démarrage en 30 secondes](#démarrage-en-30-secondes)
2. [Fonctionnement général](#fonctionnement-général)
3. [Les rubriques](#les-rubriques)
4. [Arborescence et architecture](#arborescence-et-architecture)
5. [Stockage local : localStorage et IndexedDB](#stockage-local--localstorage-et-indexeddb)
6. [Sauvegarde et restauration](#sauvegarde-et-restauration)
7. [Données de démonstration](#données-de-démonstration)
8. [Cohérence des données](#cohérence-des-données)
9. [Rôles des opérateurs](#rôles-des-opérateurs)
10. [Accessibilité et confort](#accessibilité-et-confort)
11. [Tests réalisés](#tests-réalisés)
12. [Limitations et dépannage](#limitations-et-dépannage)

---

## Démarrage en 30 secondes

1. Extrayez l'archive dans un dossier (par exemple `Documents\Ondea-CRM`).
   **Ne lancez pas l'application depuis l'intérieur du ZIP** : Windows ne donnerait accès qu'à `index.html`, sans les dossiers `css` et `js`.
2. Double-cliquez sur **`index.html`** (ou sur `Lancer Ondea CRM.bat`). Google Chrome ou Microsoft Edge récents sont recommandés.
3. Au premier lancement, indiquez le nom de votre entreprise et votre nom (code PIN facultatif), puis choisissez :
   - **Démarrer avec une base vide** ;
   - **Explorer avec des données de démonstration** : 24 clients fictifs sur 18 mois, supprimables en un clic sans toucher à vos propres données.

Vous avez déjà une sauvegarde ? Le lien « Restaurer un fichier JSON » de l'écran d'accueil la recharge directement.

> Les données sont enregistrées **dans le navigateur utilisé** (IndexedDB). Un autre navigateur ou un autre ordinateur ne les voit pas : utilisez la sauvegarde JSON pour les transférer.

---

## Fonctionnement général

- **Une seule page (SPA)** : la navigation se fait par l'adresse (`#/clients`, `#/client?id=…`, `#/devis`…) sans aucun rechargement. Les boutons Précédent / Suivant du navigateur fonctionnent.
- **Recherche globale** (barre du haut, raccourci clavier <kbd>/</kbd>) : nom, prénom, entreprise, e-mail, téléphone (même partiel), n° client, n° de devis, de facture ou de commande. Flèches ↑ ↓ puis <kbd>Entrée</kbd>.
- **Cloche** : nombre de relances dues aujourd'hui ou en retard + factures en retard ; un clic ouvre la liste « À faire ».
- **Badges du menu** : devis en attente de réponse, factures en retard, relances à faire, notes urgentes.
- **Tout est enregistré immédiatement** : chaque action est écrite dans IndexedDB en une transaction, puis l'interface entière se met à jour (tableau de bord, badges, fiche ouverte, autres onglets du navigateur).

---

## Les rubriques

| Rubrique | Ce qu'elle permet |
|---|---|
| **Tableau de bord** | 9 indicateurs (clients, nouveaux, actifs, inactifs, CA TTC, panier moyen, devis en attente, factures impayées, points de fidélité), évolution de l'activité commerciale (CA / devis émis ou nouveaux clients), clients par statut, activité récente, **clients à relancer** avec leurs raisons, dernières interactions, derniers clients / devis / factures. Période : 30 j, 90 j, 12 mois, année, tout, personnalisée. |
| **Clients** | Liste en tableau ou en cartes, tri, pagination, recherche instantanée, **filtres avancés mémorisés** (statut, catégorie, ville, commercial, dates de création, dernière activité, montant dépensé min/max, niveau de fidélité, actif/inactif, à relancer), réinitialisation. Bouton œil : archiver / réafficher (avec confirmation) et fenêtre « Clients archivés ». Export CSV. |
| **Fiche client** | En-tête (photo ou logo, statut, catégorie, niveau, coordonnées cliquables, actions rapides, changement de statut) et 11 onglets : Vue générale, Informations, Contacts, Achats, Devis, Factures, Fidélité, Interactions, Notes internes, Documents, Statistiques. Impression d'une fiche de synthèse (sans notes internes). |
| **Contacts** | Plusieurs interlocuteurs par client, **un seul contact principal**, historique des modifications de chaque contact et de ses interactions. |
| **Historique des achats** | Date, n° de commande (`CMD-2026-0001`), produits, quantités, HT / TVA / TTC, moyen de paiement, statut (payé, en attente, remboursé, annulé), vendeur, commentaire. Total, nombre, panier moyen, premier et dernier achat. Génération de la facture correspondante. |
| **Devis** | Création, modification, **duplication**, consultation, suppression, statuts Brouillon → Envoyé → Accepté / Refusé / Expiré (expiration automatique à la date de validité), **transformation en facture**, impression A4 / PDF. Lignes avec quantité, prix unitaire, remise %, TVA par ligne. |
| **Factures** | Statuts Brouillon, Émise, Partiellement payée, Payée, **En retard** (calculé à l'échéance), Annulée. Règlements partiels, « Marquer payée », relance de paiement planifiée en un clic, impression A4 avec IBAN et mentions légales. Une facture soldée enregistre automatiquement l'achat et les points de fidélité. |
| **Suivi commercial** | **Timeline** de toutes les interactions (appel, e-mail, rendez-vous, message, devis, achat, facture, relance, autre) regroupées par jour, filtres (type, client, utilisateur, période, statut). Vue **À faire** : en retard / aujourd'hui / à venir, « Marquer comme fait ». |
| **Fidélité** | Points disponibles, gagnés, utilisés ; niveaux **Bronze, Argent, Or, Platine** ; règles modifiables (points par euro TTC ou HT, seuils, récompenses), recalcul, bonus et ajustements tracés, historique complet. |
| **Notes internes** | Date, auteur, titre, contenu, priorité (faible, normale, importante, urgente), statut (ouverte, en cours, traitée), épinglage. Marquées « Interne » partout et **jamais imprimées** sur un document client. |
| **Documents** | Contrat, devis, facture, justificatif, document administratif, autre. Glisser-déposer, fichiers stockés dans IndexedDB (25 Mo max par fichier), aperçu des images, ouverture, téléchargement, renommage, suppression confirmée. |
| **Statistiques** | Évolution du nombre de clients, nouveaux clients, CA et panier moyen par période, CA par client, clients les plus actifs, clients inactifs, répartitions par statut / catégorie (nombre ou CA) / niveau de fidélité, devis acceptés / refusés / expirés, factures payées / impayées, taux de transformation, délai moyen de paiement. Chaque graphique a une vue **Tableau**. |
| **Rapports et exports** | CSV (Excel FR), JSON et impression pour clients, contacts, achats, devis, factures, interactions, fidélité, notes ; liste imprimable des impayés ; sauvegarde complète. |
| **Paramètres** | Entreprise et logo, SIRET, TVA intracommunautaire, IBAN, devise, format de date, taux de TVA, validité des devis, échéance des factures, délai d'inactivité, mentions imprimées, moyens de paiement, sources, **catégories personnalisables**, opérateurs, affichage, sauvegardes, démonstration, réinitialisation. |

---

## Arborescence et architecture

```
Ondea-CRM/
├── index.html                    Page unique (SPA) — ordre de chargement des scripts
├── Lancer Ondea CRM.bat          Raccourci Windows (ouvre index.html)
├── README.md                     Ce document
├── css/
│   ├── fonts.css                 Polices embarquées en base64 (Playfair Display, Atkinson Hyperlegible, JetBrains Mono)
│   ├── ondea-core.css            Design system « Obsidienne & Or » (copie fidèle de la référence)
│   ├── ondea-premium.css         Icônes animées en fond, effet « WHAOU », animations
│   ├── ondea-crm.css             Composants CRM (timeline, niveaux, fiche, notes, documents…) + AAA, responsive, impression A4
│   ├── etiquettes-lisibles.css   Étiquettes de statut lisibles sur les images des cartes
│   └── ondea-prestige-2026.css   Couche « Prestige 2026 » (bordures dorées, transitions)
├── js/
│   ├── core/
│   │   ├── utils.js              Sélecteurs, dates, montants, icônes SVG, validations
│   │   ├── db.js                 IndexedDB : magasins, index, versions et migrations, transactions, repli mémoire
│   │   ├── store.js              État central + règles métier (clients, contacts, achats, devis, factures…)
│   │   └── engine.js             Calculs : indicateurs par client, actifs/inactifs, relances, séries statistiques (avec cache)
│   ├── ui/
│   │   ├── ui.js                 Toasts, modales 2 niveaux, panneau latéral, focus, pagination, champs, sélecteur de client
│   │   ├── charts.js             Graphiques SVG faits maison (courbe, barres, anneau) accessibles au clavier
│   │   └── lines-editor.js       Éditeur de lignes (devis, factures, achats) avec totaux par taux de TVA
│   ├── io/exports.js             CSV, JSON, sauvegarde / restauration, documents A4
│   ├── views/                    Une vue par rubrique (dashboard, clients, client-detail, contacts, achats, devis,
│   │                             factures, interactions, fidelite, notes, documents, statistiques, reports, settings)
│   ├── modules/                  Fonctions transverses reprises de la référence :
│   │   ├── pin-login.js          Retour rapide par code PIN, 5 essais puis pause de 30 s
│   │   ├── pin-eye.js            Œil afficher / masquer dans les champs PIN
│   │   ├── logo-brand.js         Le logo de l'entreprise remplace le ◆ (accueil, barre latérale)
│   │   ├── image-zoom.js         Loupe d'accessibilité au survol / au clavier / appui long
│   │   └── clients-images.js     Images clients : import groupé (association par nom de fichier), ZIP, téléchargement
│   ├── demo.js                   Données de démonstration (chargement, suppression, restauration)
│   └── app.js                    Démarrage, accueil, structure, routeur, recherche globale, thème, horloge
└── ressources/
    ├── images/
    │   ├── images-clients/            24 images (photo / logo) des clients de démonstration, 1024 × 1024 JPG,
    │   │                              nommées « n° client-nom.jpg » (ex. CLI-000001-hotel-le-belvedere.jpg)
    │   └── apercu-24-images-clients.jpg  Planche d'aperçu des 24 images
    ├── exemple-sauvegarde-demo.json   Sauvegarde complète du jeu de démonstration (pour tester la restauration)
    ├── ondea-crm-logo.svg             Logo de l'application
    └── RAPPORT-DE-TESTS.md            Résultats des parcours testés
```

**Principes (identiques à Ondea Stock Intelligence)**

- Scripts classiques chargés dans l'ordre (aucun module ES) : l'application fonctionne en double-clic (`file://`).
- **État central `S`** chargé depuis IndexedDB au démarrage. Chaque service (ex. `saveDevis`) vérifie les règles, prépare des copies, écrit **une transaction** via `commit()`, puis met à jour la mémoire et déclenche `emitChange` : la vue courante et la fiche ouverte se redessinent en conservant le défilement.
- Calculs mis en cache par numéro de version des données (`VERSION`) : aucun recalcul inutile, rendu ciblé, pagination → l'application reste fluide avec plusieurs centaines de clients (test : 824 clients, 3 300 achats et 3 500 interactions : chaque vue est calculée et affichée en 100 à 160 ms, recherche instantanée en moins de 15 ms).
- Synchronisation entre onglets (`BroadcastChannel`) : un onglet resté ouvert ne peut pas écraser des données plus récentes.

---

## Stockage local : localStorage et IndexedDB

| | Contenu |
|---|---|
| **IndexedDB** (`OndeaCRMDB`, version 2) | Magasins `clients`, `contacts`, `achats`, `devis`, `factures`, `interactions`, `notes`, `fidelite`, `documents`, `categories`, `journal`, `media` (fichiers binaires : logos, photos, documents) et `kv` (réglages, opérateurs, compteurs de numérotation). |
| **Index** | `clientId` sur tous les magasins liés, `number`, `email`, `status`, `categoryId`, `city`, `date`, `dueDate`, `type`, `priority`, `kind`… La suppression d'un client lit ses données liées **par index** pour n'en oublier aucune. |
| **Migrations** | `MIGRATIONS[1]` crée les magasins, `MIGRATIONS[2]` ajoute les index. Une base d'une version antérieure est mise à niveau sans perte (testé). |
| **localStorage** | Uniquement des informations légères : thème (`ondea_theme`), contraste, taille du texte, pause des animations, son, session et dernier opérateur, date de la dernière sauvegarde, état de la démonstration, **filtres et vues mémorisés** (`ocrm_ui_*`). Aucun fichier binaire. |

Si IndexedDB est indisponible (navigation privée stricte…), un stockage en mémoire prend le relais et un message prévient que les données ne seront pas conservées.

---

## Sauvegarde et restauration

**Exporter** : Paramètres → « Sauvegarde complète » (ou Rapports et exports). Un fichier `ondea-crm-sauvegarde-AAAA-MM-JJ.json` contient toutes les données, les réglages, les opérateurs, les compteurs et **tous les fichiers** (logos, documents) encodés en base64.

**Importer** : Paramètres → « Restaurer… » (ou depuis l'écran d'accueil). Avant toute modification, l'application :

1. vérifie que le fichier est un JSON valide **et** une sauvegarde Ondea CRM (format et version de base compatibles) ;
2. contrôle l'intégrité (identifiants, numéros, statuts, lignes, références vers des clients absents, fichiers manquants) ;
3. affiche un **résumé** (nombre de clients, contacts, achats, devis, factures, interactions, notes, documents, fichiers) ;
4. propose deux modes, puis demande confirmation :
   - **Fusionner** : n'ajoute que ce qui manque. Un élément déjà présent (même identifiant) est ignoré ; un client reconnu (même e-mail, ou même numéro et même nom) est **rattaché à la fiche existante** au lieu d'être dupliqué ; une catégorie de même nom est réutilisée ; un numéro déjà attribué est renuméroté. Deux fusions successives du même fichier n'ajoutent rien.
   - **Remplacer** : efface tout puis restaure (saisie de `REMPLACER` exigée).

Le fichier `ressources/exemple-sauvegarde-demo.json` permet de tester la restauration immédiatement.

**Exports** : CSV compatibles Excel français (UTF-8 avec BOM, séparateur `;`, virgule décimale, protection contre l'injection de formules), JSON par module, documents A4 (devis, factures, récapitulatifs d'achat, fiche client, listes) via l'impression du navigateur → « Enregistrer au format PDF ».

---

## Images des clients

- **Clients → « Images clients »** : choisissez plusieurs images d'un coup (par exemple tout le dossier `ressources/images/images-clients/`). Chaque fichier est associé automatiquement à son client par son nom (nom du client, ou n° client `CLI-000001`) ; un aperçu indique les correspondances avant validation. Les anciennes images inutilisées sont supprimées.
- **Télécharger toutes les images** : un fichier ZIP « ondea-crm-images-clients-AAAA-MM-JJ.zip » (images nommées « n° client-nom.jpg »).
- **Fiche client → « Télécharger l'image »** : l'image d'un seul client.
- Une image peut aussi être choisie individuellement dans le formulaire du client. Les images sont stockées dans IndexedDB et incluses dans la sauvegarde JSON.

## Données de démonstration

- **24 clients** (particuliers, professionnels, revendeurs, collectivités) avec statuts variés, logos, 37 contacts, ~95 achats, 22 devis (tous statuts, dont certains proches de l'expiration), ~58 factures (payées, partielles, en retard, brouillon, annulée), ~320 interactions dont des **relances planifiées** (en retard, aujourd'hui, à venir), 12 notes internes, points de fidélité à **tous les niveaux**, 6 documents PDF, 2 commerciaux fictifs.
- Tout est marqué « démo » : **Supprimer la démo** (tableau de bord, clients, paramètres) retire uniquement ces éléments. Vos clients restent intacts ; une catégorie fictive que vous avez utilisée est conservée ; les clients réels suivis par un commercial fictif sont simplement désaffectés.
- **Restaurer la démo** recharge l'ensemble à tout moment. Les dates sont toujours recalculées par rapport à aujourd'hui.

---

## Cohérence des données

- Devis, factures, achats, interactions, notes, points et documents référencent le client **par son identifiant** : renommer un client se reflète partout immédiatement.
- **Suppression d'un client** : confirmation détaillée (nombre d'éléments liés, saisie de `SUPPRIMER`) puis suppression en cascade de toutes ses données et de ses fichiers ; les entrées du journal qui le citaient perdent simplement leur lien. L'archivage est proposé pour conserver l'historique.
- Achat payé → points crédités ; achat modifié, annulé ou supprimé → points recalculés ou retirés.
- Devis → facture : lien conservé dans les deux sens. Facture soldée → achat enregistré. Achat payé lié à une facture émise → facture soldée.
- Supprimer un contact principal désigne automatiquement le suivant ; ses interactions sont conservées avec le nom du contact.
- Supprimer une catégorie fait passer ses clients « Sans catégorie ».
- Toutes les opérations destructives demandent une confirmation explicite.

---

## Rôles des opérateurs

| Rôle | Droits |
|---|---|
| **Administrateur** | Tout, y compris paramètres, restauration et réinitialisation. |
| **Responsable commercial** | Tout sauf paramètres de l'entreprise et restauration : suppression de clients, de ventes et de documents, règles de fidélité, catégories, démonstration. |
| **Commercial** | Clients, contacts, achats, devis, factures, interactions, notes, documents, points de fidélité, exports. Pas de suppression de ventes ni de clients. |

Le code PIN protège l'accès sur un poste partagé (5 essais puis 30 s de pause) ; ce n'est pas une sécurité forte, les données étant locales.

---

## Accessibilité et confort

- Contrastes **WCAG AA** vérifiés automatiquement (axe-core) sur toutes les vues, modales et panneaux, en mode clair, sombre et contraste élevé ; textes discrets renforcés à 7:1 en mode clair.
- Lien d'évitement, focus visible, **navigation clavier complète** (onglets aux flèches, graphiques aux flèches, <kbd>Échap</kbd> ferme fenêtres et panneaux, focus piégé dans les modales et rendu à l'élément d'origine).
- Libellés explicites sur tous les champs, `aria-invalid` et messages d'erreur clairs, annonces `aria-live`, rôles ARIA (onglets, listes, combobox de recherche).
- Taille du texte 100 / 112 / 125 / 140 %, mode contraste élevé, thème clair / sombre (instantané, mémorisé, appliqué avant l'affichage), pause des animations, respect de « Réduire les animations ».
- Vue **Tableau** pour chaque graphique : l'information n'est jamais transmise par la seule couleur.
- Cibles tactiles de 44 px sur écrans tactiles ; mise en page testée de 390 px à 1920 px sans débordement horizontal.

---

## Tests réalisés

Les 20 parcours demandés ont été exécutés automatiquement dans Chromium (Playwright) : création, modification, contacts multiples, achat, devis, facture et règlements, interaction, note, fidélité, document, recherche, filtres, persistance après rechargement, export, suppression, restauration (fusion sans doublon et remplacement), thèmes, clavier, affichage mobile — **0 erreur JavaScript en console**. Détail dans `ressources/RAPPORT-DE-TESTS.md`.

---

## Limitations et dépannage

- **Données locales** : elles ne se synchronisent pas entre ordinateurs ou navigateurs → sauvegarde JSON. Vider les données du site efface le CRM : exportez régulièrement (la date de la dernière sauvegarde est affichée dans Paramètres).
- **Firefox** : selon sa configuration, Firefox peut refuser IndexedDB pour les fichiers ouverts en `file://` ; l'application fonctionne alors en mémoire et l'indique. Il suffit de l'ouvrir via un petit serveur local (`python -m http.server` dans le dossier, puis `http://localhost:8000`). Chrome et Edge fonctionnent directement en double-clic.
- **Envoi d'e-mails** : les liens `mailto:` et `tel:` ouvrent votre messagerie ou votre téléphone ; l'application n'envoie rien elle-même (aucun serveur).
- **PDF** : produits par l'impression du navigateur (« Enregistrer au format PDF »).
- **Quota** : les navigateurs réservent généralement plusieurs Go par site ; l'espace utilisé est affiché dans la barre latérale et les Paramètres.
