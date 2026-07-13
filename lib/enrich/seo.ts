import type { CheerioAPI } from 'cheerio';

export interface SeoResult {
  score: number; // 0-100
  issues: string[]; // problèmes détectés (arguments de prospection)
  passed: string[]; // points forts
}

interface SeoCheck {
  weight: number;
  ok: boolean;
  okLabel: string;
  koLabel: string;
}

interface SeoContext {
  isHttps: boolean;
  hasSitemap: boolean;
}

/**
 * Score SEO on-page 0-100 calculé depuis le HTML de la home (aucun appel réseau).
 * Pensé pour la prospection : la liste `issues` sert d'argumentaire de refonte.
 */
export function computeSeoScore($: CheerioAPI, ctx: SeoContext): SeoResult {
  const title = $('title').first().text().trim();
  const metaDesc = $('meta[name="description"]').attr('content')?.trim() ?? '';
  const h1Count = $('h1').length;
  const hasViewport = $('meta[name="viewport"]').length > 0;
  const hasCanonical = $('link[rel="canonical"]').length > 0;
  const htmlLang = $('html').attr('lang')?.trim() ?? '';
  const hasOgTitle = $('meta[property="og:title"]').length > 0;
  const hasOgImage = $('meta[property="og:image"]').length > 0;
  const hasJsonLd = $('script[type="application/ld+json"]').length > 0;
  const hasFavicon = $('link[rel~="icon"]').length > 0;
  const robots = $('meta[name="robots"]').attr('content')?.toLowerCase() ?? '';
  const noindex = /noindex/.test(robots);

  // couverture des attributs alt sur les images de contenu
  const imgs = $('img').toArray();
  const withAlt = imgs.filter((el) => ($(el).attr('alt') ?? '').trim().length > 0).length;
  const altRatio = imgs.length === 0 ? 1 : withAlt / imgs.length;

  const checks: SeoCheck[] = [
    {
      weight: 10,
      ok: title.length > 0,
      okLabel: 'Balise <title> présente',
      koLabel: 'Balise <title> absente',
    },
    {
      weight: 5,
      ok: title.length >= 10 && title.length <= 65,
      okLabel: 'Longueur du titre optimale',
      koLabel:
        title.length === 0
          ? 'Titre absent'
          : title.length < 10
            ? 'Titre trop court'
            : 'Titre trop long (>65 caractères)',
    },
    {
      weight: 10,
      ok: metaDesc.length > 0,
      okLabel: 'Meta description présente',
      koLabel: 'Meta description absente',
    },
    {
      weight: 5,
      ok: metaDesc.length >= 50 && metaDesc.length <= 160,
      okLabel: 'Longueur de la meta description optimale',
      koLabel:
        metaDesc.length === 0
          ? 'Meta description absente'
          : metaDesc.length < 50
            ? 'Meta description trop courte'
            : 'Meta description trop longue (>160 caractères)',
    },
    {
      weight: 8,
      ok: h1Count === 1,
      okLabel: 'Un seul titre H1',
      koLabel: h1Count === 0 ? 'Aucun titre H1' : `Plusieurs H1 (${h1Count})`,
    },
    {
      weight: 10,
      ok: hasViewport,
      okLabel: 'Balise viewport (responsive mobile)',
      koLabel: 'Pas de balise viewport (non responsive)',
    },
    {
      weight: 10,
      ok: ctx.isHttps,
      okLabel: 'HTTPS actif',
      koLabel: 'Pas de HTTPS (site non sécurisé)',
    },
    {
      weight: 6,
      ok: hasCanonical,
      okLabel: 'URL canonique déclarée',
      koLabel: 'Pas d’URL canonique',
    },
    {
      weight: 4,
      ok: htmlLang.length > 0,
      okLabel: 'Langue déclarée (<html lang>)',
      koLabel: 'Langue non déclarée',
    },
    {
      weight: 6,
      ok: hasOgTitle && hasOgImage,
      okLabel: 'Balises Open Graph (partage réseaux sociaux)',
      koLabel: 'Balises Open Graph incomplètes (aperçu réseaux sociaux dégradé)',
    },
    {
      weight: 8,
      ok: hasJsonLd,
      okLabel: 'Données structurées Schema.org',
      koLabel: 'Aucune donnée structurée (pas de rich results Google)',
    },
    {
      weight: 8,
      ok: altRatio >= 0.8,
      okLabel: 'Images correctement décrites (attribut alt)',
      koLabel:
        imgs.length === 0
          ? 'Aucune image'
          : `${Math.round((1 - altRatio) * 100)} % des images sans attribut alt`,
    },
    {
      weight: 5,
      ok: ctx.hasSitemap,
      okLabel: 'Sitemap.xml présent',
      koLabel: 'Pas de sitemap.xml',
    },
    {
      weight: 5,
      ok: !noindex,
      okLabel: 'Page indexable',
      koLabel: 'Page en noindex (exclue de Google)',
    },
    {
      weight: 2,
      ok: hasFavicon,
      okLabel: 'Favicon présent',
      koLabel: 'Pas de favicon',
    },
  ];

  const totalWeight = checks.reduce((sum, c) => sum + c.weight, 0);
  const gained = checks.reduce((sum, c) => sum + (c.ok ? c.weight : 0), 0);
  const score = Math.round((gained / totalWeight) * 100);

  return {
    score,
    issues: checks.filter((c) => !c.ok).map((c) => c.koLabel),
    passed: checks.filter((c) => c.ok).map((c) => c.okLabel),
  };
}
