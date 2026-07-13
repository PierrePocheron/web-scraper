import * as cheerio from 'cheerio';
import type { prospects } from '@/lib/db/schema';
import type { Confidence, FieldSource } from '@/lib/types';
import {
  businessTypeLabel,
  deduceCategory,
  extractDescription,
  extractEmails,
  extractJsonLd,
  extractPhones,
  extractSiteName,
  normalizePhoneFr,
} from './extract';
import { detectCms, detectLocalFr, detectSiteType } from './detect';
import { fetchPage } from './fetcher';
import { fetchLegalPage, splitPersonName } from './legal';
import { getPerformanceScore } from './pagespeed';
import { estimatePageCount, internalLinks } from './sitemap';
import { isSpaShell, renderWithPlaywright } from './spa';

type ProspectRow = typeof prospects.$inferSelect;
export type ProspectUpdates = Partial<ProspectRow>;

const CONTACT_LINK_RE = /contact/i;

/**
 * Pipeline 2 pour un site : home (fast-path Cheerio, fallback Playwright si SPA),
 * mentions légales, page contact, sitemap, détection CMS/type.
 * Chaque champ rempli est tracé dans fieldSources (source + confiance).
 */
export async function enrichProspect(
  prospect: Pick<ProspectRow, 'id' | 'domain' | 'url'>,
  onStep: (step: 'fetch' | 'parsing') => void
): Promise<ProspectUpdates> {
  const fieldSources: Record<string, FieldSource> = {};
  const updates: ProspectUpdates = { fieldSources };
  const set = <K extends keyof ProspectRow>(
    field: K,
    value: ProspectRow[K],
    source: string,
    confidence: Confidence
  ) => {
    updates[field] = value;
    fieldSources[field as string] = { source, confidence };
  };

  // --- 1. Home (fast-path) — depuis la racine : la SERP pointe souvent une page profonde ---
  const rootUrl = new URL(prospect.url).origin + '/';
  onStep('fetch');
  const home = await fetchPage(rootUrl);
  if (!home.ok) throw new Error(`HTTP ${home.status} sur la page d'accueil`);
  let html = home.html;
  let $ = cheerio.load(html);

  // Fallback Playwright si coquille SPA
  if (isSpaShell($, html)) {
    const rendered = await renderWithPlaywright(home.finalUrl);
    if (rendered) {
      html = rendered;
      $ = cheerio.load(html);
    }
  }

  updates.isHttps = home.finalUrl.startsWith('https://');
  fieldSources.isHttps = { source: 'url-finale', confidence: 'high' };

  // --- 2. Identité business ---
  onStep('parsing');
  const ld = extractJsonLd($);
  if (ld?.name) {
    set('businessName', ld.name, 'jsonld', 'high');
  } else {
    const siteName = extractSiteName($);
    if (siteName) set('businessName', siteName.value, siteName.source, 'medium');
  }

  const typeLabel = businessTypeLabel(ld?.type ?? null);
  if (typeLabel) set('businessType', typeLabel, 'jsonld', 'high');

  const category = deduceCategory(typeLabel);
  if (category) set('category', category, 'déduction businessType', 'medium');

  if (ld?.description) {
    set('businessDescription', ld.description.slice(0, 500), 'jsonld', 'high');
  } else {
    const desc = extractDescription($);
    if (desc) set('businessDescription', desc.value, desc.source, 'medium');
  }

  if (ld?.address) set('address', ld.address, 'jsonld', 'high');

  // --- 3. Mentions légales ---
  const legal = await fetchLegalPage($, home.finalUrl);
  if (legal.legalNoticeUrl) {
    set('legalNoticeUrl', legal.legalNoticeUrl, 'lien home / chemin usuel', 'high');
  }
  if (legal.publicationManager) {
    set('publicationManager', legal.publicationManager, 'mentions-legales', 'medium');
  }
  const dirigeant = legal.gerant ?? legal.publicationManager;
  if (dirigeant) {
    const { firstName, lastName } = splitPersonName(dirigeant);
    if (firstName) set('contactFirstName', firstName, 'mentions-legales', 'medium');
    if (lastName) set('contactLastName', lastName, 'mentions-legales', 'medium');
  }
  if (legal.siret) set('siret', legal.siret, 'mentions-legales', 'high');
  if (!updates.address && legal.address) {
    set('address', legal.address, 'mentions-legales', 'medium');
  }

  // --- 4. Page contact (source riche pour emails/téléphones) ---
  let $contact: cheerio.CheerioAPI | null = null;
  let contactHtml = '';
  const contactHref = $('a[href]')
    .toArray()
    .map((el) => $(el).attr('href') ?? '')
    .find((href) => CONTACT_LINK_RE.test(href));
  if (contactHref) {
    try {
      const contactUrl = new URL(contactHref, home.finalUrl).href;
      if (contactUrl !== legal.legalNoticeUrl) {
        const res = await fetchPage(contactUrl);
        if (res.ok) {
          contactHtml = res.html;
          $contact = cheerio.load(res.html);
        }
      }
    } catch {
      // page contact injoignable : non bloquant
    }
  }

  // --- 5. Emails / téléphones (priorité : jsonld > mentions légales > contact > home) ---
  const emailPool: { email: string; source: string }[] = [];
  if (ld?.email) emailPool.push({ email: ld.email.toLowerCase(), source: 'jsonld' });
  if (legal.$legal && legal.legalHtml) {
    for (const e of extractEmails(legal.$legal, legal.legalHtml))
      emailPool.push({ email: e, source: 'mentions-legales' });
  }
  if ($contact) {
    for (const e of extractEmails($contact, contactHtml))
      emailPool.push({ email: e, source: 'page-contact' });
  }
  for (const e of extractEmails($, html)) emailPool.push({ email: e, source: 'homepage' });

  const emails: string[] = [];
  const emailSeen = new Set<string>();
  let emailSource: string | null = null;
  for (const { email, source } of emailPool) {
    if (emailSeen.has(email)) continue;
    emailSeen.add(email);
    emails.push(email);
    emailSource ??= source;
  }
  if (emails.length > 0) {
    set('emails', emails, emailSource!, emailSource === 'homepage' ? 'medium' : 'high');
  }

  const phonePool: { phone: string; source: string }[] = [];
  const ldPhone = ld?.telephone ? normalizePhoneFr(ld.telephone) : null;
  if (ldPhone) phonePool.push({ phone: ldPhone, source: 'jsonld' });
  if (legal.$legal && legal.legalHtml) {
    for (const p of extractPhones(legal.$legal, legal.legalHtml))
      phonePool.push({ phone: p, source: 'mentions-legales' });
  }
  if ($contact) {
    for (const p of extractPhones($contact, contactHtml))
      phonePool.push({ phone: p, source: 'page-contact' });
  }
  for (const p of extractPhones($, html)) phonePool.push({ phone: p, source: 'homepage' });

  const phones: string[] = [];
  const phoneSeen = new Set<string>();
  let phoneSource: string | null = null;
  for (const { phone, source } of phonePool) {
    if (phoneSeen.has(phone)) continue;
    phoneSeen.add(phone);
    phones.push(phone);
    phoneSource ??= source;
  }
  if (phones.length > 0) {
    set('phones', phones, phoneSource!, phoneSource === 'homepage' ? 'medium' : 'high');
  }

  // --- 6. Sitemap / nombre de pages ---
  const pages = await estimatePageCount(home.finalUrl, $);
  updates.hasSitemap = pages.hasSitemap;
  fieldSources.hasSitemap = { source: pages.source, confidence: 'high' };
  if (pages.count !== null) {
    set('pageCountEstimate', pages.count, pages.source, pages.hasSitemap ? 'high' : 'low');
  }

  // --- 7. CMS + type de site ---
  const cmsDetection = detectCms($, html, home.headers);
  if (cmsDetection.cms) {
    set('cms', cmsDetection.cms, 'empreintes html/headers', 'high');
  } else if (legal.$legal && detectLocalFr(legal.$legal('body').text())) {
    // la mention « Créé par Local.fr » vit souvent sur la page mentions légales
    set('cms', 'local.fr / Solocal', 'mentions-legales', 'high');
  }
  const linkCount = internalLinks($, home.finalUrl).length;
  const siteType = detectSiteType($, html, cmsDetection.ecommerceHint, linkCount);
  set('siteType', siteType, 'signaux home', siteType === 'vitrine' ? 'medium' : 'high');

  // --- 8. PageSpeed (optionnel) ---
  const perf = await getPerformanceScore(home.finalUrl);
  if (perf !== null) set('performanceScore', perf, 'pagespeed-mobile', 'high');

  return updates;
}
