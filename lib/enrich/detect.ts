import type { CheerioAPI } from 'cheerio';
import type { SiteType } from '@/lib/types';

export interface CmsDetection {
  cms: string | null;
  ecommerceHint: boolean;
}

/** Détection CMS par generator, headers et empreintes d'assets. */
export function detectCms($: CheerioAPI, html: string, headers: Headers): CmsDetection {
  const generator = $('meta[name="generator"]').attr('content')?.toLowerCase() ?? '';
  const h = html.toLowerCase();
  const powered = headers.get('x-powered-by')?.toLowerCase() ?? '';

  // local.fr / Solocal — la cible du dork
  if (/cr[ée]{1,2} par local\.fr|solocal/i.test(html) || generator.includes('local.fr')) {
    return { cms: 'local.fr / Solocal', ecommerceHint: false };
  }
  if (generator.includes('prestashop') || h.includes('powered by prestashop') || h.includes('id_product=')) {
    return { cms: 'PrestaShop', ecommerceHint: true };
  }
  if (h.includes('cdn.shopify.com') || h.includes('shopify.theme')) {
    return { cms: 'Shopify', ecommerceHint: true };
  }
  if (generator.includes('wordpress') || h.includes('wp-content') || h.includes('wp-json')) {
    const woo = h.includes('woocommerce') || h.includes('add-to-cart');
    return { cms: woo ? 'WordPress (WooCommerce)' : 'WordPress', ecommerceHint: woo };
  }
  if (h.includes('wixstatic') || headers.get('x-wix-request-id')) {
    return { cms: 'Wix', ecommerceHint: false };
  }
  if (generator.includes('joomla')) return { cms: 'Joomla', ecommerceHint: false };
  if (generator.includes('drupal') || powered.includes('drupal')) return { cms: 'Drupal', ecommerceHint: false };
  if (h.includes('squarespace')) return { cms: 'Squarespace', ecommerceHint: false };
  if (h.includes('webflow')) return { cms: 'Webflow', ecommerceHint: false };
  if (h.includes('jimdo')) return { cms: 'Jimdo', ecommerceHint: false };
  if (generator) return { cms: $('meta[name="generator"]').attr('content')!.trim(), ecommerceHint: false };
  return { cms: null, ecommerceHint: false };
}

const ECOMMERCE_LINK_RE = /\/(panier|cart|boutique|shop|checkout|commande)\b/i;
const BLOG_LINK_RE = /\/(blog|actualites?|articles?|news)\b/i;

/** Déduit vitrine / ecommerce / blog / landing depuis les signaux de la home. */
export function detectSiteType(
  $: CheerioAPI,
  html: string,
  ecommerceHint: boolean,
  internalLinkCount: number
): SiteType {
  const h = html.toLowerCase();
  const links: string[] = [];
  $('a[href]').each((_, el) => {
    links.push($(el).attr('href') ?? '');
  });

  const ecommerce =
    ecommerceHint ||
    h.includes('add-to-cart') ||
    h.includes('id_product=') ||
    links.some((l) => ECOMMERCE_LINK_RE.test(l));
  if (ecommerce) return 'ecommerce';

  if (internalLinkCount <= 2) return 'landing';

  const blogLinks = links.filter((l) => BLOG_LINK_RE.test(l)).length;
  const articles = $('article').length;
  if (blogLinks >= 3 && (articles >= 3 || blogLinks / Math.max(links.length, 1) > 0.3)) {
    return 'blog';
  }

  return 'vitrine';
}
