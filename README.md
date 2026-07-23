# CLUTCH

Application mobile de tutorat peer-to-peer : les tuteurs sont des étudiants du supérieur qui aident collégiens et lycéens (via leurs parents).

CLUTCH met en relation des parents qui cherchent de l’aide et des tuteurs étudiants via un flux type swipe, une messagerie temps réel, des paiements intégrés au chat et un système d’avis.

---

## Tech stack

| Couche | Technologies |
| --- | --- |
| Mobile | **Expo** (SDK 54) · **React Native** · React Navigation |
| Auth | **Clerk** (`@clerk/clerk-expo`) |
| Backend / data | **Supabase** (PostgreSQL, RLS, Realtime, triggers / `pg_net`) |
| Paiements | **Stripe** (Checkout test + serveur local ; base pour Connect) |
| Notifications | **Expo Notifications** + push Expo |

---

## Fonctionnalités clés

- **Swipe & Match** — découverte des tuteurs, like / pass, création de demandes de cours
- **Messagerie temps réel** — historique + écoute `postgres_changes` sur `messages`
- **Double rôle Parent / Tuteur** — onboarding « Qui êtes-vous ? » + switch de rôle pour les tests
- **Profil tuteur éditable** — spécialités, bio, tarif (€/h), année d’étude (visible dans le swipe)
- **Paiement dans le chat** — demande d’heures, validation wallet, litiges (`is_frozen`) et annulations
- **Notation & avis** — modal après paiement, moyenne dynamique sur le swipe
- **Portefeuille** — recharge Stripe (mode test) côté parent, retrait simulé côté tuteur
- **Push notifications** — token Expo enregistré ; notifs match / nouveau message via triggers Supabase

---

## Prérequis

- Node.js 18+
- Compte [Expo](https://expo.dev), [Clerk](https://clerk.com), [Supabase](https://supabase.com), [Stripe](https://stripe.com) (mode test)
- App **Expo Go** sur un téléphone physique (recommandé pour push & auth)

---

## Installation & lancement

### 1. Cloner et installer

```bash
git clone https://github.com/MaxKlingner/Clutchapp.git
cd Clutchapp
npm install --legacy-peer-deps
```

### 2. Configurer l’environnement

Copie `.env.example` vers `.env` et renseigne les clés :

```bash
cp .env.example .env
```

| Variable | Rôle |
| --- | --- |
| `EXPO_PUBLIC_CLERK_PUBLISHABLE_KEY` | Auth Clerk |
| `EXPO_PUBLIC_SUPABASE_URL` | Projet Supabase |
| `EXPO_PUBLIC_SUPABASE_ANON_KEY` | Clé anon Supabase |
| `SUPABASE_ACCESS_TOKEN` | Token Management API (scripts SQL) |
| `EXPO_PUBLIC_STRIPE_PUBLISHABLE_KEY` | Stripe publishable (test) |
| `STRIPE_SECRET_KEY` | Stripe secret (**serveur uniquement**) |
| `EXPO_PUBLIC_STRIPE_BACKEND_URL` | Backend Stripe HTTPS (Edge Function) ; en local seulement `http://127.0.0.1:4242` |

> Ne committe jamais `.env`. Les schémas SQL sont dans `supabase/` et s’appliquent via les scripts `scripts/apply-*.mjs`.

### 3. Backend Stripe

**Local (dev) :**

```bash
npm run stripe:server
# EXPO_PUBLIC_STRIPE_BACKEND_URL=http://127.0.0.1:4242
```

**TestFlight / store :** le téléphone ne peut pas joindre `localhost` / `192.168.x.x`. Utilise l’Edge Function :

1. Secrets Supabase : `STRIPE_SECRET_KEY`, `EXPO_PUBLIC_STRIPE_PUBLISHABLE_KEY`
2. Deploy : `npx supabase functions deploy stripe --project-ref <ref>`
3. EAS env `preview` / `production` :
   `EXPO_PUBLIC_STRIPE_BACKEND_URL=https://<ref>.supabase.co/functions/v1/stripe`

### 4. Lancer Expo

Dans un autre terminal :

```bash
npx expo start
```

Options utiles :

```bash
npx expo start --tunnel    # accès hors réseau local
npx expo start --clear     # cache Metro vidé
```

Scanne le QR code avec Expo Go (iOS / Android).

---

## Structure du projet

```
CLUTCH_APP/
├── App.js                 # Navigation, auth Clerk, rôles, push setup
├── index.js
├── app.json               # Config Expo
├── .env.example           # Modèle de variables d’environnement
├── screens/               # Écrans UI
│   ├── SwipeScreen.js
│   ├── MessagesScreen.js
│   ├── ChatScreen.js
│   ├── ProfileScreen.js
│   ├── OnboardingScreen.js
│   ├── TutorHomeScreen.js
│   ├── TutorProfileEditor.js
│   ├── SignInScreen.js
│   └── SignUpScreen.js
├── lib/                   # Clients & helpers
│   ├── supabase.js        # API data (matches, messages, wallets, avis…)
│   ├── clerk.js
│   ├── roles.js
│   ├── RoleContext.js
│   ├── tutorConstants.js
│   └── env.js
├── services/              # Intégrations externes
│   ├── stripe.ts
│   └── notifications.js
├── server/                # Backend local Stripe Checkout
│   └── stripe-server.mjs
├── supabase/              # Schémas & migrations SQL
│   ├── seed_profiles.sql
│   ├── user_profiles.sql
│   ├── messages_realtime.sql
│   ├── chat_payments.sql
│   ├── disputes_cancellations.sql
│   ├── reviews.sql
│   └── push_notifications.sql
├── scripts/               # Apply SQL via Management API
│   └── apply-*.mjs
└── assets/                # Icônes & images
```

---

## Scripts utiles

| Commande | Description |
| --- | --- |
| `npm start` / `npx expo start` | Metro + Expo |
| `npm run stripe:server` | Serveur Checkout Stripe (test) |
| `node scripts/apply-*.mjs` | Appliquer un schéma SQL sur Supabase |

---

## Notes de développement

- **Auth** : l’app est gated par Clerk ; les données métier vivent dans Supabase.
- **Rôles** : stockés dans `user_profiles` (`parent` \| `tutor`) + cache SecureStore.
- **Realtime** : table `messages` dans la publication Supabase Realtime.
- **Push** : nécessite un appareil physique et l’autorisation utilisateur au premier login.
- **Stripe** : mode test uniquement ; aucun débit réel si tu utilises des clés `pk_test` / `sk_test`.

---

## Déploiement & Builds (EAS)

CLUTCH utilise **Expo Application Services (EAS)** pour générer des builds natifs (dev client et preview).

### Prérequis

1. Compte [Expo](https://expo.dev)
2. CLI EAS (déjà en `devDependency`, ou en global) :

```bash
npm install -g eas-cli
# ou via le projet :
npx eas-cli --version
```

3. Connexion Expo :

```bash
eas login
```

4. Lier le projet (génère `extra.eas.projectId` dans `app.json`) :

```bash
eas build:configure
# équivalent npm :
npm run eas:configure
```

Le fichier `eas.json` définit déjà les profils :

| Profil | Usage |
| --- | --- |
| `development` | Dev Client (`developmentClient: true`) — debug / hot reload |
| `preview` | Build interne de test (TestFlight / APK interne) |
| `production` | Build store |

### Lancer un build de développement

**iOS**

```bash
eas build --profile development --platform ios
# ou
npm run build:dev:ios
```

**Android**

```bash
eas build --profile development --platform android
# ou
npm run build:dev:android
```

### Lancer un build preview

```bash
eas build --profile preview --platform ios
eas build --profile preview --platform android
```

### Après le build

1. Installe le build sur l’appareil (lien Expo / QR fourni en fin de build).
2. Relance Metro en mode dev client :

```bash
npx expo start --dev-client
```

> **Note iOS** : un compte Apple Developer est requis pour les builds device (hors simulateur).  
> **Note Android** : le profil `development` / `preview` produit une **APK** pour installation interne.

---

## Licence

Projet privé — usage interne / académique.
