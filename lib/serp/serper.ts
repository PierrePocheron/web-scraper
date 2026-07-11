import { config } from '@/lib/config';
import type { SerpPage, SerpProvider, SerpResult } from './provider';

const SERPER_URL = 'https://google.serper.dev/search';
const RESULTS_PER_PAGE = 10;

interface SerperOrganic {
  link?: string;
  title?: string;
  snippet?: string;
}

export class SerperProvider implements SerpProvider {
  async search(query: string, page: number): Promise<SerpPage> {
    if (!config.serperApiKey) {
      throw new Error('SERPER_API_KEY manquante dans .env');
    }
    const res = await fetch(SERPER_URL, {
      method: 'POST',
      headers: {
        'X-API-KEY': config.serperApiKey,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        q: query,
        gl: 'fr',
        hl: 'fr',
        num: RESULTS_PER_PAGE,
        page,
      }),
    });
    if (!res.ok) {
      const body = await res.text().catch(() => '');
      throw new Error(`Serper HTTP ${res.status} : ${body.slice(0, 300)}`);
    }
    const data = (await res.json()) as { organic?: SerperOrganic[] };
    const organic = data.organic ?? [];
    const results: SerpResult[] = organic
      .filter((o): o is SerperOrganic & { link: string } =>
        typeof o.link === 'string' && /^https?:\/\//i.test(o.link)
      )
      .map((o) => ({ url: o.link, title: o.title ?? '', snippet: o.snippet ?? '' }));
    return { results, hasMore: organic.length >= RESULTS_PER_PAGE };
  }
}

let provider: SerpProvider | null = null;

export function getSerpProvider(): SerpProvider {
  return (provider ??= new SerperProvider());
}
