# LUMIZA

Boutique mono-produit LUMIZA. Les étapes 1 et 2 apportent la landing trilingue. L'étape 3 ajoute une sélection locale, des réservations de stock atomiques dans PostgreSQL, Stripe Embedded Checkout en **mode test**, les webhooks, une confirmation privée et un outil de rapprochement. Aucun paiement réel n'est activé.

## Prérequis

- Node.js 22.12+ ou 24+
- npm 11+

## Installation et démarrage

```bash
npm install
cp .env.example .env.local # facultatif à cette étape
npm run dev
```

Ouvrir ensuite `http://localhost:3000`. La racine redirige vers `/fr`; les routes `/fr`, `/en` et `/de` sont disponibles.

## Commandes

```bash
npm run dev        # serveur de développement
npm run build      # build de production
npm run start      # serveur de production après build
npm run lint       # analyse ESLint
npm run typecheck  # vérification TypeScript stricte
npm run test       # Vitest en mode interactif
npm run test:run   # tests en exécution unique
npm run format     # formatage Prettier
```

## Architecture

- `src/app/[locale]` : routes App Router localisées et métadonnées.
- `src/components` : primitives UI et composants de structure réutilisables.
- `src/components/theme` : fournisseur et sélecteur des thèmes clair, sombre et système.
- `src/features/product` : schémas Zod, types, données, médias et composants du catalogue.
- `src/features/commerce` : panier, calculs, états de commande, dépôt Supabase, orchestration Stripe et UI de paiement.
- `supabase/migrations/202609220001_step3_commerce.sql` : schéma, stock initial et fonctions transactionnelles.
- `src/i18n` et `messages` : configuration de routage et traductions FR/EN/DE.
- `src/lib/supabase` : clients navigateur et serveur explicitement séparés.
- `src/config/env.ts` : validation Zod des variables au moment de l'utilisation.
- `tests` : tests unitaires et composants avec Vitest et Testing Library.

Les Server Components sont utilisés par défaut. Les sélecteurs de langue et de thème sont des Client Components, car ils interagissent avec le routeur et les préférences du navigateur. Le catalogue local typé permet au projet de fonctionner sans Supabase.

## Design system

La palette est centralisée dans `src/styles/globals.css` avec des tokens sémantiques pour les thèmes clair et sombre. Le thème suit le système par défaut et la préférence choisie est mémorisée par `next-themes`.

- Interface et textes courants : DM Sans.
- Titres et éléments forts : Manrope.
- Accent éditorial italique du hero : Cormorant Garamond.
- Couleurs principales : crème `#FFFCF6`, noir `#1C1C1A`, corail `#FF7048` et lime `#DFFF80`.

## Variables d'environnement

Copier `.env.example` vers `.env.local` pour activer la commande de test :

- `NEXT_PUBLIC_SUPABASE_URL` : URL publique du projet.
- `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` : clé publique soumise aux politiques RLS.
- `SUPABASE_SERVICE_ROLE_KEY` : clé privilégiée serveur pour les transactions. Jamais exposée au navigateur.
- `STRIPE_MODE` : `test` ou `live` ; explicite en production, `test` par défaut en développement local. Les deux clés, sessions et événements doivent correspondre au mode.
- `STRIPE_SECRET_KEY` : clé Stripe serveur correspondant au mode.
- `NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY` : clé publique Stripe correspondant au mode.
- `STRIPE_WEBHOOK_SECRET` : secret de signature du webhook du même environnement Stripe ; celui de la CLI locale ne convient pas au webhook LIVE.
- `NEXT_PUBLIC_SITE_URL` : origine publique de l'application, requise pour le retour Stripe et le contrôle d'origine de l'API.
- `CRON_SECRET` : secret `cron_...` facultatif localement, requis en production pour le rapprochement.

Sans ces variables, la landing et le panier restent utilisables ; le paiement affiche un message d'indisponibilité. Aucune simulation de paiement ne remplace Stripe.

## Tester localement l'étape 3

1. Créer un projet Supabase **de test** et appliquer `supabase/migrations/202609220001_step3_commerce.sql` dans son éditeur SQL ou avec la CLI Supabase. La migration crée les tables, active RLS sans politique publique, ajoute 30 lampes et installe les fonctions atomiques. Ne l'appliquer qu'une fois sur une base neuve de validation.
2. Copier `.env.example` dans `.env.local`, remplir l'URL Supabase, les clés de test Stripe et `NEXT_PUBLIC_SITE_URL=http://localhost:3000`. Ne jamais renseigner de clés `sk_live_` ou `pk_live_`.
3. Démarrer `npm run dev`. Ouvrir `/fr`, `/en` ou `/de`, ajouter un pack dans la section offres, puis aller sur `/{locale}/checkout`. Choisir la France ou l'Allemagne avant de créer la session : Stripe limite ensuite l'adresse à ce pays. Les frais sont de 0 € pour la France et 10 € pour l'Allemagne, une fois par commande.
4. Dans Stripe CLI, écouter les événements `checkout.session.completed`, `checkout.session.async_payment_succeeded`, `checkout.session.async_payment_failed`, `checkout.session.expired` et `payment_intent.payment_failed`, et transférer vers `http://localhost:3000/api/stripe/webhook`. Reporter le secret de signature émis par la CLI dans `.env.local`, puis redémarrer le serveur. Effectuer uniquement des paiements avec les cartes de test Stripe.
5. Tester les états payé, refusé, expiration et webhook dupliqué. La page `/{locale}/order/confirmation?token=...` vérifie la commande et la session Stripe côté serveur. Une page visitée ne marque jamais elle-même la commande payée.
6. Pour un rapprochement manuel, définir `CRON_SECRET=cron_<valeur_aléatoire>` et appeler `GET /api/internal/reconcile` avec `Authorization: Bearer cron_<valeur_aléatoire>`. La route traite au plus 50 commandes par appel et répond 503 si une tentative échoue. Aucun cron actif n'est déployé. Un futur Vercel Cron doit être configuré et surveillé séparément, avec une fréquence adaptée à la fenêtre de réservation.

Le panier ne conserve que les choix de packs, de finitions et de quantités dans `localStorage`. Les montants, le pays, les références et les stocks sont recalculés/validés par le serveur et la base. Les champs de carte restent hébergés par Stripe. `payment_events` et le mouvement de stock sont validés dans la même transaction SQL ; une tentative échouée reste retraitable. Une session réseau incertaine conserve le stock réservé et réutilise la même clé d'idempotence Stripe. Le bouton d'annulation expire d'abord la session Stripe et ne libère la réservation qu'après vérification de son état impayé. Le départ du navigateur ne libère pas le stock.

La disponibilité par finition n'est pas confirmée : le stock initial de 30 unités est global au produit. `tax_cents` reste nul, Stripe Tax n'est pas activé et aucune TVA n'est supposée. La cible de livraison de 3 à 5 jours ouvrés est provisoire. Les pays autorisés sont uniquement FR et DE. Les prix sont définis dans `src/features/product/data/product.ts` et semés dans la migration ; avant toute session Stripe, le checkout compare chaque ligne historisée en base au catalogue serveur et refuse une divergence de prix ou de quantité physique.

La protection contre les créations massives de sessions doit être renforcée par une limitation de débit durable avant exposition publique. Les réservations en état incertain au-delà de la rétention de la clé d'idempotence Stripe nécessitent une revue manuelle. L'étape 3 n'inclut ni authentification client, ni outil administratif, ni email transactionnel, ni déploiement.

## Éléments provisoires

- Les prix sont ceux du cahier des charges de l'étape 3 ; la fiscalité et le transporteur doivent être finalisés avant la vente réelle. L'estimation de livraison de 3 à 5 jours ouvrés est confirmée pour FR/BE/DE/CH.
- La landing utilise un catalogue local typé ; les commandes et le stock utilisent Supabase PostgreSQL.
- Les trois photos produit fournies par le propriétaire sont conservées dans `assets/source/product` et optimisées en WebP dans `public/images/product`. Aucune photographie d'une autre lampe n'a été substituée.
- Les six scènes de `public/images/lifestyle` sont des compositions photoréalistes générées à partir de ces photos, encore à valider visuellement avant la production. L'image de référence en collage n'est pas servie au client.
- Tous les chemins, dimensions, textes alternatifs localisés et statuts temporaires des médias sont centralisés dans `src/features/product/data/product-media.ts`. Les scènes pourront être remplacées sans modifier les composants.
- Aucune caractéristique non confirmée (autonomie, durée de recharge, dimensions, étanchéité ou certification) n'est affichée.
- Les cartes d'offres mènent au panier. Le paiement n'est accessible qu'avec les clés Stripe de test et la migration Supabase configurées.
