import type { CheerioAPI } from 'cheerio';
import { config } from '@/lib/config';

/** Détecte une coquille SPA : body quasi vide + marqueurs React/Vue/Next. */
export function isSpaShell($: CheerioAPI, html: string): boolean {
  const bodyText = $('body').text().replace(/\s+/g, ' ').trim();
  if (bodyText.length >= 200) return false;
  return (
    $('#root:empty, #app:empty, [data-reactroot]:empty').length > 0 ||
    html.includes('__NEXT_DATA__') ||
    /new Vue\(|createApp\(|data-v-app/.test(html) ||
    $('script[src]').length > 0
  );
}

/**
 * Fallback Playwright (feature-flag ENABLE_PLAYWRIGHT) : rend la page en headless
 * et retourne le HTML hydraté. Retourne null si Playwright n'est pas installé.
 * Installation : npm i playwright && npx playwright install chromium
 */
interface PlaywrightModule {
  chromium: {
    launch(opts: { headless: boolean }): Promise<{
      newPage(opts: { userAgent: string }): Promise<{
        goto(url: string, opts: { waitUntil: string; timeout: number }): Promise<unknown>;
        content(): Promise<string>;
      }>;
      close(): Promise<void>;
    }>;
  };
}

export async function renderWithPlaywright(url: string): Promise<string | null> {
  if (!config.enablePlaywright) return null;
  let chromium: PlaywrightModule['chromium'];
  try {
    // import dynamique via variable : dépendance optionnelle, non résolue au build
    const moduleName = 'playwright';
    ({ chromium } = (await import(moduleName)) as PlaywrightModule);
  } catch {
    console.warn('[enrich] ENABLE_PLAYWRIGHT=true mais playwright n’est pas installé');
    return null;
  }
  const browser = await chromium.launch({ headless: true });
  try {
    const page = await browser.newPage({ userAgent: config.userAgent });
    await page.goto(url, { waitUntil: 'networkidle', timeout: config.requestTimeoutMs * 2 });
    return await page.content();
  } finally {
    await browser.close();
  }
}
