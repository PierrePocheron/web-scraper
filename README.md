# Prospect Finder — Pedro Dev

App locale mono-utilisateur de prospection : trouve des sites créés par des agences low-cost (local.fr…) via une recherche Google (Serper.dev), enrichit chaque site en fiche prospect exploitable (identité, contacts, mentions légales, CMS, nombre de pages…), gère tout dans un tableau avec anti-doublon, et exporte un JSON propre pour import dans l'ERP FreelanceOS.

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

## Workflow

1. **Recherche** : lancer le dork preset (`"Créé par Local.fr" "Mettre à jour mon site internet" -site:local.fr`) — les URLs sont dédupliquées par domaine enregistrable (`UNIQUE(domain)` en base). Relancer la même recherche plus tard n'ajoute que les nouveaux domaines et affiche le diff.
2. **Enrichissement** : « Enrichir tout / la sélection / réessayer les échecs ». Fast-path `fetch + Cheerio` (JSON-LD, mentions légales → dirigeant/SIRET, emails/téléphones dé-obfusqués, sitemap → nombre de pages, détection CMS dont local.fr/Solocal). Progression temps réel (SSE). Chaque champ est tracé avec sa source et sa confiance.
3. **Pipeline commercial** : statut éditable en ligne (nouveau → à contacter → contacté → relance → RDV → client / pas intéressé), notes dans le drawer détail.
4. **Handoff** : export CSV/JSON, import CSV/JSON en upsert (ne jamais écraser notes ni statut), bouton « Copier le prompt d'import ERP » (prospects sélectionnés, ou tous).

## Scripts

| Script | Rôle |
|---|---|
| `npm run dev` | Dev server (Turbopack) |
| `npm run build` / `npm start` | Build + serveur de prod local |
| `npm run db:push` | Applique le schéma Drizzle sur `prospects.db` |
| `npm run db:studio` | Explorateur de base Drizzle Studio |
| `npm run typecheck` | `tsc --noEmit` |
| `npx tsx scripts/smoke-test.ts` | Smoke test des extracteurs + pipeline complet |

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
