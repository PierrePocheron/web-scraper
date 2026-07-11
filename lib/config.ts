function intEnv(name: string, fallback: number): number {
  const raw = process.env[name];
  const n = raw ? parseInt(raw, 10) : NaN;
  return Number.isFinite(n) ? n : fallback;
}

export const config = {
  serperApiKey: process.env.SERPER_API_KEY ?? '',
  pagespeedApiKey: process.env.PAGESPEED_API_KEY ?? '',
  enrichConcurrency: intEnv('ENRICH_CONCURRENCY', 5),
  enrichTtlDays: intEnv('ENRICH_TTL_DAYS', 7),
  requestTimeoutMs: intEnv('REQUEST_TIMEOUT_MS', 15000),
  /** Fallback Playwright pour les SPA (nécessite `npm i playwright && npx playwright install chromium`) */
  enablePlaywright: process.env.ENABLE_PLAYWRIGHT === 'true',
  /** Score PageSpeed pendant l'enrichissement (lent : ~30s/site) */
  enablePagespeed: process.env.ENABLE_PAGESPEED === 'true',
  userAgent: 'PedroDev-ProspectBot/1.0 (+pierre.pocheron@gmail.com)',
};
