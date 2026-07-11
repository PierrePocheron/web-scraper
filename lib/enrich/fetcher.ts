import robotsParser from 'robots-parser';
import { config } from '@/lib/config';

export interface FetchResult {
  ok: boolean;
  status: number;
  html: string;
  finalUrl: string;
  headers: Headers;
}

type Robots = ReturnType<typeof robotsParser>;

const HOST_DELAY_MS = 1000;
const RETRY_DELAYS_MS = [1000, 3000];

// État de politesse partagé (délai par host + cache robots.txt).
const g = globalThis as unknown as {
  __pfHostLast?: Map<string, number>;
  __pfRobots?: Map<string, Robots | null>;
};
const hostLast = (g.__pfHostLast ??= new Map());
const robotsCache = (g.__pfRobots ??= new Map());

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/** Attend que le délai de politesse par host soit écoulé. */
async function politeWait(host: string) {
  const last = hostLast.get(host) ?? 0;
  const wait = last + HOST_DELAY_MS - Date.now();
  if (wait > 0) await sleep(wait);
  hostLast.set(host, Date.now());
}

async function getRobots(origin: string): Promise<Robots | null> {
  if (robotsCache.has(origin)) return robotsCache.get(origin) ?? null;
  let robots: Robots | null = null;
  try {
    const res = await fetch(`${origin}/robots.txt`, {
      headers: { 'User-Agent': config.userAgent },
      signal: AbortSignal.timeout(5000),
    });
    if (res.ok) {
      robots = robotsParser(`${origin}/robots.txt`, await res.text());
    }
  } catch {
    // robots.txt injoignable → on considère autorisé
  }
  robotsCache.set(origin, robots);
  return robots;
}

export class RobotsDisallowedError extends Error {
  constructor(url: string) {
    super(`Interdit par robots.txt : ${url}`);
  }
}

/**
 * Fetch poli : robots.txt, ~1s de délai par host, timeout, 2 retries avec backoff,
 * User-Agent identifiable. Lève une erreur si le réseau échoue après retries.
 */
export async function fetchPage(url: string): Promise<FetchResult> {
  const parsed = new URL(url);
  const robots = await getRobots(parsed.origin);
  if (robots && robots.isAllowed(url, config.userAgent) === false) {
    throw new RobotsDisallowedError(url);
  }

  let lastError: unknown;
  for (let attempt = 0; attempt <= RETRY_DELAYS_MS.length; attempt++) {
    if (attempt > 0) await sleep(RETRY_DELAYS_MS[attempt - 1]);
    await politeWait(parsed.host);
    try {
      const res = await fetch(url, {
        headers: {
          'User-Agent': config.userAgent,
          Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
          'Accept-Language': 'fr-FR,fr;q=0.9',
        },
        redirect: 'follow',
        signal: AbortSignal.timeout(config.requestTimeoutMs),
      });
      // 5xx → retry ; 4xx → réponse définitive
      if (res.status >= 500 && attempt < RETRY_DELAYS_MS.length) {
        lastError = new Error(`HTTP ${res.status}`);
        continue;
      }
      const html = await res.text();
      return { ok: res.ok, status: res.status, html, finalUrl: res.url || url, headers: res.headers };
    } catch (err) {
      lastError = err;
    }
  }
  const msg = lastError instanceof Error ? lastError.message : String(lastError);
  throw new Error(`Échec réseau sur ${url} : ${msg}`);
}
