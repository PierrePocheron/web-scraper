import * as cheerio from 'cheerio';
import type { CheerioAPI } from 'cheerio';
import { fetchPage } from './fetcher';

const LEGAL_LINK_RE = /mentions[-\s]?l[ée]gales|mentions-legales|\/legal/i;
const PUB_MANAGER_RE =
  /(?:responsable|directeur|directrice)\s+de\s+(?:la\s+)?publication\s*[:\-–]?\s*([A-ZÉÈÀ][\wÀ-ÿ'’\-]+(?:\s+[A-ZÉÈÀ][\wÀ-ÿ'’\-]+){0,3})/i;
const GERANT_RE =
  /g[ée]rant[e]?\s*[:\-–]?\s*([A-ZÉÈÀ][\wÀ-ÿ'’\-]+(?:\s+[A-ZÉÈÀ][\wÀ-ÿ'’\-]+){0,3})/i;
const SIRET_RE = /\b\d{3}\s?\d{3}\s?\d{3}\s?\d{5}\b/;
// "12 rue des Lilas, 69003 Lyon"
const ADDRESS_RE = /\d{1,4}[,]?\s+(?:rue|avenue|av\.|boulevard|bd|chemin|impasse|place|route|allée|quai|cours)\s[^,\n<]{3,60}[,\s]+\d{5}\s+[A-ZÀ-Ÿ][\wÀ-ÿ\-' ]{2,40}/i;

const LEGAL_FALLBACK_PATHS = [
  '/mentions-legales',
  '/mentions-legales/',
  '/mentions-legales.html',
  '/mentions_legales',
  '/legal',
];

export interface LegalInfo {
  legalNoticeUrl: string | null;
  publicationManager: string | null;
  gerant: string | null;
  siret: string | null;
  address: string | null;
  /** le HTML de la page pour alimenter les pools emails/téléphones */
  $legal: CheerioAPI | null;
  legalHtml: string | null;
}

/** Trouve l'URL des mentions légales via les liens de la home, sinon teste les chemins usuels. */
export function findLegalLink($: CheerioAPI, baseUrl: string): string | null {
  let found: string | null = null;
  $('a[href]').each((_, el) => {
    if (found) return;
    const href = $(el).attr('href') ?? '';
    const text = $(el).text();
    if (LEGAL_LINK_RE.test(href) || LEGAL_LINK_RE.test(text)) {
      try {
        found = new URL(href, baseUrl).href;
      } catch {
        // href invalide
      }
    }
  });
  return found;
}

/** Récupère et parse la page mentions légales (source RGPD-obligatoire, riche en infos). */
export async function fetchLegalPage($home: CheerioAPI, baseUrl: string): Promise<LegalInfo> {
  const empty: LegalInfo = {
    legalNoticeUrl: null,
    publicationManager: null,
    gerant: null,
    siret: null,
    address: null,
    $legal: null,
    legalHtml: null,
  };

  const candidates: string[] = [];
  const linked = findLegalLink($home, baseUrl);
  if (linked) candidates.push(linked);
  for (const path of LEGAL_FALLBACK_PATHS) {
    try {
      candidates.push(new URL(path, baseUrl).href);
    } catch {
      // ignore
    }
  }

  for (const url of [...new Set(candidates)]) {
    try {
      const res = await fetchPage(url);
      if (!res.ok || !res.html) continue;
      const $ = cheerio.load(res.html);
      const text = $('body').text().replace(/\s+/g, ' ');
      return {
        legalNoticeUrl: res.finalUrl,
        publicationManager: text.match(PUB_MANAGER_RE)?.[1]?.trim() ?? null,
        gerant: text.match(GERANT_RE)?.[1]?.trim() ?? null,
        siret: text.match(SIRET_RE)?.[0]?.replace(/\s/g, '') ?? null,
        address: text.match(ADDRESS_RE)?.[0]?.trim() ?? null,
        $legal: $,
        legalHtml: res.html,
      };
    } catch {
      // page suivante
    }
  }
  return empty;
}

/** "Jean Dupont" → { firstName: "Jean", lastName: "Dupont" } */
export function splitPersonName(full: string | null): {
  firstName: string | null;
  lastName: string | null;
} {
  if (!full) return { firstName: null, lastName: null };
  const parts = full.trim().split(/\s+/);
  if (parts.length < 2) return { firstName: null, lastName: parts[0] ?? null };
  return { firstName: parts[0], lastName: parts.slice(1).join(' ') };
}
