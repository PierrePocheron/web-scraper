import { randomUUID } from 'node:crypto';
import { eq } from 'drizzle-orm';
import { db } from '@/lib/db';
import { prospects, savedQueries } from '@/lib/db/schema';
import { normalizeDomain } from '@/lib/domain';
import { getSerpProvider } from '@/lib/serp/serper';

export interface SearchRecap {
  query: string;
  pagesFetched: number;
  totalResults: number;
  created: number;
  known: number;
  newDomains: string[];
  knownDomains: string[];
}

/** Pipeline 1 : dork → SERP paginée → dédup vs base → insertion des nouveaux domaines. */
export async function runSearch(query: string, pagesMax: number): Promise<SearchRecap> {
  const provider = getSerpProvider();
  const now = new Date().toISOString();
  const seen = new Set<string>();
  const recap: SearchRecap = {
    query,
    pagesFetched: 0,
    totalResults: 0,
    created: 0,
    known: 0,
    newDomains: [],
    knownDomains: [],
  };

  for (let page = 1; page <= pagesMax; page++) {
    const { results, hasMore } = await provider.search(query, page);
    recap.pagesFetched = page;
    recap.totalResults += results.length;

    for (const result of results) {
      const domain = normalizeDomain(result.url);
      if (!domain || seen.has(domain)) continue;
      seen.add(domain);

      const existing = db
        .select({ id: prospects.id })
        .from(prospects)
        .where(eq(prospects.domain, domain))
        .get();
      if (existing) {
        recap.known++;
        recap.knownDomains.push(domain);
        continue;
      }

      db.insert(prospects)
        .values({
          id: randomUUID(),
          domain,
          url: result.url,
          sourceQuery: query,
          discoveredAt: now,
          enrichmentStatus: 'pending',
          outreachStatus: 'nouveau',
        })
        .run();
      recap.created++;
      recap.newDomains.push(domain);
    }

    if (!hasMore) break;
  }

  saveQuery(query, pagesMax, now);
  return recap;
}

/** Mémorise la requête (upsert) pour pouvoir la relancer plus tard. */
function saveQuery(query: string, pagesMax: number, ranAt: string) {
  const existing = db
    .select({ id: savedQueries.id })
    .from(savedQueries)
    .where(eq(savedQueries.query, query))
    .get();
  if (existing) {
    db.update(savedQueries)
      .set({ lastRunAt: ranAt, pagesMax })
      .where(eq(savedQueries.id, existing.id))
      .run();
  } else {
    db.insert(savedQueries)
      .values({ id: randomUUID(), query, pagesMax, createdAt: ranAt, lastRunAt: ranAt })
      .run();
  }
}
