import * as cheerio from 'cheerio';
import type { CheerioAPI } from 'cheerio';
import { normalizeDomain } from '@/lib/domain';
import { fetchPage } from './fetcher';

const LOC_RE = /<loc>\s*([^<]+?)\s*<\/loc>/gi;
const MAX_CHILD_SITEMAPS = 5;
const CRAWL_CAP = 100;
const CRAWL_DEPTH1_FETCHES = 5;

export interface PageCountEstimate {
  count: number | null;
  hasSitemap: boolean;
  source: string;
}

function extractLocs(xml: string): string[] {
  return [...xml.matchAll(LOC_RE)].map((m) => m[1]);
}

/** Liens internes (même domaine enregistrable) d'une page, normalisés sans hash/query. */
export function internalLinks($: CheerioAPI, baseUrl: string): string[] {
  const domain = normalizeDomain(baseUrl);
  const links = new Set<string>();
  $('a[href]').each((_, el) => {
    const href = $(el).attr('href') ?? '';
    if (/^(mailto:|tel:|javascript:|#)/i.test(href)) return;
    try {
      const u = new URL(href, baseUrl);
      if (!/^https?:$/.test(u.protocol)) return;
      if (normalizeDomain(u.href) !== domain) return;
      if (/\.(pdf|jpe?g|png|gif|webp|svg|zip|docx?)$/i.test(u.pathname)) return;
      u.hash = '';
      u.search = '';
      links.add(u.href.replace(/\/$/, ''));
    } catch {
      // href invalide
    }
  });
  return [...links];
}

/**
 * Estime le nombre de pages : sitemap.xml (+ index) en priorité,
 * sinon crawl BFS des liens internes (profondeur 1-2, cap 100).
 */
export async function estimatePageCount(
  baseUrl: string,
  $home: CheerioAPI
): Promise<PageCountEstimate> {
  // 1. sitemap.xml / sitemap_index.xml
  for (const path of ['/sitemap.xml', '/sitemap_index.xml']) {
    try {
      const res = await fetchPage(new URL(path, baseUrl).href);
      if (!res.ok || !res.html.includes('<')) continue;
      const locs = extractLocs(res.html);
      if (locs.length === 0) continue;
      if (/<sitemapindex/i.test(res.html)) {
        let total = 0;
        for (const child of locs.slice(0, MAX_CHILD_SITEMAPS)) {
          try {
            const childRes = await fetchPage(child);
            if (childRes.ok) total += extractLocs(childRes.html).length;
          } catch {
            // enfant injoignable
          }
        }
        if (total > 0) return { count: total, hasSitemap: true, source: 'sitemap-index' };
      }
      return { count: locs.length, hasSitemap: true, source: 'sitemap' };
    } catch {
      // essai suivant
    }
  }

  // 2. Fallback : BFS liens internes depuis la home
  const seen = new Set<string>([baseUrl.replace(/\/$/, '')]);
  const level1 = internalLinks($home, baseUrl);
  for (const l of level1) seen.add(l);

  // petite passe de profondeur 2 pour les petits sites
  if (seen.size < CRAWL_CAP) {
    for (const url of level1.slice(0, CRAWL_DEPTH1_FETCHES)) {
      if (seen.size >= CRAWL_CAP) break;
      try {
        const res = await fetchPage(url);
        if (!res.ok) continue;
        const $ = cheerio.load(res.html);
        for (const l of internalLinks($, url)) {
          seen.add(l);
          if (seen.size >= CRAWL_CAP) break;
        }
      } catch {
        // page injoignable
      }
    }
  }

  return { count: Math.min(seen.size, CRAWL_CAP), hasSitemap: false, source: 'crawl' };
}
