import { config } from '@/lib/config';

const PSI_URL = 'https://www.googleapis.com/pagespeedonline/v5/runPagespeed';

/** Score performance mobile 0-100 via PageSpeed Insights (feature-flag ENABLE_PAGESPEED). */
export async function getPerformanceScore(url: string): Promise<number | null> {
  if (!config.enablePagespeed || !config.pagespeedApiKey) return null;
  const params = new URLSearchParams({
    url,
    strategy: 'mobile',
    category: 'performance',
    key: config.pagespeedApiKey,
  });
  try {
    const res = await fetch(`${PSI_URL}?${params}`, { signal: AbortSignal.timeout(60000) });
    if (!res.ok) return null;
    const data = (await res.json()) as {
      lighthouseResult?: { categories?: { performance?: { score?: number } } };
    };
    const score = data.lighthouseResult?.categories?.performance?.score;
    return typeof score === 'number' ? Math.round(score * 100) : null;
  } catch {
    return null;
  }
}
