# Prospect Finder — Pedro Dev

App locale mono-utilisateur de prospection : trouve des sites créés par des agences low-cost (local.fr…) via une recherche Google (Serper.dev), enrichit chaque site en fiche prospect exploitable (identité, contacts, mentions légales, CMS, **score SEO**, nombre de pages/images, date de création du domaine…), gère tout dans un tableau avec anti-doublon, et exporte un JSON propre pour import dans l'ERP FreelanceOS.

C'est la brique **amont** de la skill `prospect-refonte` (audit + refonte Astro).

## Prérequis

- **Node.js ≥ 20** (le projet est développé avec Node 22 — `brew install node@22` ou nvm, cf. `.nvmrc`)
- Une clé API [Serper.dev](https://serper.dev) (requis)
- Une clé [PageSpeed Insights](https://developers.google.com/speed/docs/insights/v5/get-started) (optionnel)

## Installation

```bash
npm install
cp .env.example .env      # puis renseigner SERPER_API_KEY
npm run db:push           # crée prospects.db (SQLite)
npm run dev               # http://localhost:3000
```

> Node 22 requis. Si `node -v` affiche une version plus ancienne :
> `export PATH=/opt/homebrew/opt/node@22/bin:$PATH` (ou `nvm use`).

## Configuration (.env)

| Variable | Défaut | Rôle |
|---|---|---|
| `SERPER_API_KEY` | — | **Requis.** Clé Serper.dev pour la SERP Google |
| `PAGESPEED_API_KEY` | — | Clé PageSpeed Insights (si `ENABLE_PAGESPEED=true`) |
| `ENRICH_CONCURRENCY` | 5 | Sites enrichis en parallèle |
| `ENRICH_TTL_DAYS` | 7 | Ne pas ré-enrichir un domaine plus récent que N jours (sauf « forcer ») |
| `REQUEST_TIMEOUT_MS` | 15000 | Timeout par requête HTTP |
| `ENABLE_PLAYWRIGHT` | false | Fallback headless pour les SPA (`npm i playwright && npx playwright install chromium`) |
| `ENABLE_PAGESPEED` | false | Score performance mobile pendant l'enrichissement (~30 s/site) |

## Utilisation

### 1. Rechercher des prospects
Le champ de requête est prérempli avec le dork preset :
```
"Créé par Local.fr" "Mettre à jour mon site internet" -site:local.fr
```
Choisis le nombre de pages (10 par défaut, ~10 résultats/page) puis **Lancer la recherche**. Les URLs sont dédupliquées par domaine enregistrable (`UNIQUE(domain)`), et un récap s'affiche : *N trouvés, X nouveaux, Y déjà connus*. Relancer la même recherche plus tard n'ajoute **que les nouveaux domaines** — idéal pour repasser régulièrement voir ce qu'il reste à démarcher. Les requêtes sont mémorisées (menu déroulant).

### 2. Enrichir
Trois boutons : **Enrichir tout** (les `pending`), **Enrichir la sélection** (cases cochées), **Réessayer les échecs**. Chaque site passe `en attente → fetch → parsing → ok/échec` avec une **barre de progression temps réel** (SSE). Un site en échec n'interrompt jamais le lot.

- **Incrémental** : pas besoin de tout faire d'un coup. Enrichis par lots quand tu veux ; tout est sauvegardé en base au fur et à mesure. Ferme et relance l'app sans rien perdre.
- **Anti-re-scraping** : un domaine enrichi il y a moins de `ENRICH_TTL_DAYS` (7 j) n'est pas ré-enrichi. Le bouton **↻ (forcer)** sur une ligne ignore ce délai.

### 3. Trier / filtrer / travailler la base
Le tableau est numéroté à gauche. Tri par colonne, filtre par colonne, recherche plein texte, pagination réglable (10 → 300 ou **Tout**). Le **statut commercial** est éditable en ligne (nouveau → à contacter → contacté → relance → RDV → client / pas intéressé). Le crayon **✎** ouvre le drawer détail (toutes les données, sources d'extraction, problèmes SEO, notes éditables). La croix **✕** supprime réellement la fiche (droit à l'effacement RGPD).

### 4. Exporter / handoff ERP
- **Export CSV** / **Export JSON** (toutes colonnes).
- **Import CSV/JSON** en upsert par domaine : complète les champs vides **sans écraser** tes notes ni ton statut.
- **Copier le prompt d'import ERP** : génère le prompt + le JSON des prospects (sélectionnés, ou tous) prêt à coller dans l'ERP FreelanceOS.

## Données collectées par prospect

| Catégorie | Champs |
|---|---|
| Identité | raison sociale, type d'activité, secteur, description |
| Contact | prénom/nom du dirigeant (fondateur JSON-LD prioritaire), responsable de publication, emails, téléphones (FR normalisés), adresse, SIRET |
| Site | type (vitrine/ecommerce/blog/landing), CMS (dont **local.fr/Solocal**), HTTPS, sitemap, nb de pages, **nb d'images**, **date de création du domaine** (RDAP) |
| Qualité | **score SEO on-page 0-100** + liste des problèmes détectés (argumentaire de refonte), score performance mobile (PageSpeed, optionnel) |
| Pipeline | statut commercial, notes |
| Traçabilité | pour chaque champ : source + niveau de confiance (`high`/`medium`/`low`) |

Le **score SEO** est calculé gratuitement depuis le HTML de la home (15 critères : titre, meta description, H1, viewport, HTTPS, canonical, Open Graph, données structurées, couverture des `alt`, sitemap, indexabilité…). Aucun appel réseau supplémentaire.

## Scripts

| Script | Rôle |
|---|---|
| `npm run dev` | Dev server (Turbopack) |
| `npm run build` / `npm start` | Build + serveur de prod local |
| `npm run db:push` | Applique le schéma Drizzle sur `prospects.db` |
| `npm run db:studio` | Explorateur de base Drizzle Studio |
| `npm run typecheck` | `tsc --noEmit` |
| `npm run test:smoke` | Smoke test des extracteurs + pipeline complet |
| `npm run test:import` | Test de l'upsert import/export (notes/statut préservés) |
| `npx tsx scripts/e2e-live.ts [--no-search] [--force]` | E2E réel (consomme des crédits Serper) |

## Branches & contribution

- `main` : branche stable (releases).
- `dev` : développement des évolutions. Travailler sur `dev`, puis merger dans `main` pour une release.

## Architecture

- **Next.js 15 (App Router)** en local — UI React + Route Handlers, pas de déploiement cloud.
- **SQLite via Drizzle** (`prospects.db`), clé d'unicité = domaine enregistrable normalisé.
- **Serper.dev** derrière l'interface `SerpProvider` (`lib/serp/`) — switchable vers SerpAPI.
- **Enrichissement** (`lib/enrich/`) : file `p-queue` (cap 5), respect de `robots.txt`, ~1 s de délai par host, timeout, 2 retries backoff, `User-Agent` identifiable. Playwright uniquement en fallback SPA.
- **Politesse & RGPD** : données professionnelles B2B uniquement, suppression réelle (droit à l'effacement), rate-limiting poli, opt-out à prévoir dans les messages de démarchage.

## Structure

```
app/            pages + routes API (search, enrich, enrich/stream SSE, prospects, import, export)
components/     Dashboard, ActionBar, ProspectTable (TanStack), DetailDrawer, ProgressPanel
lib/
  db/           schéma Drizzle + client SQLite
  serp/         interface SerpProvider + implémentation Serper
  enrich/       fetcher poli, extracteurs (JSON-LD, emails, téléphones), mentions légales,
                sitemap, détection CMS/type, runner p-queue, événements SSE
  importer.ts   import CSV/JSON en upsert
  exporter.ts   export CSV/JSON
  erp-prompt.ts prompt d'import ERP
```
