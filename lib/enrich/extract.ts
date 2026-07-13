import type { CheerioAPI } from 'cheerio';

// --- JSON-LD -----------------------------------------------------------------

export interface JsonLdBusiness {
  name: string | null;
  type: string | null;
  description: string | null;
  telephone: string | null;
  email: string | null;
  address: string | null;
  /** fondateur / dirigeant déclaré dans le schema.org */
  founder: string | null;
}

interface LdNode {
  '@type'?: string | string[];
  '@graph'?: LdNode[];
  name?: string;
  description?: string;
  telephone?: string;
  email?: string;
  founder?: string | { name?: string } | Array<string | { name?: string }>;
  address?:
    | string
    | { streetAddress?: string; postalCode?: string; addressLocality?: string };
  [key: string]: unknown;
}

function founderName(founder: LdNode['founder']): string | null {
  const first = Array.isArray(founder) ? founder[0] : founder;
  if (!first) return null;
  if (typeof first === 'string') return first.trim() || null;
  return first.name?.trim() || null;
}

const BUSINESS_TYPES = /LocalBusiness|Organization|Store|Restaurant|Dentist|Physician|Attorney|Plumber|Electrician|HairSalon|Bakery|AutoRepair|RoofingContractor|GeneralContractor|HomeAndConstructionBusiness|FoodEstablishment|MedicalBusiness|LegalService|RealEstateAgent|Florist|Hotel|LodgingBusiness|ProfessionalService/i;

function collectNodes(node: LdNode, out: LdNode[]) {
  if (!node || typeof node !== 'object') return;
  out.push(node);
  if (Array.isArray(node['@graph'])) {
    for (const child of node['@graph']) collectNodes(child, out);
  }
}

/** Cherche un nœud LocalBusiness/Organization dans les scripts JSON-LD. */
export function extractJsonLd($: CheerioAPI): JsonLdBusiness | null {
  const nodes: LdNode[] = [];
  $('script[type="application/ld+json"]').each((_, el) => {
    const raw = $(el).text();
    if (!raw.trim()) return;
    try {
      const parsed = JSON.parse(raw);
      for (const item of Array.isArray(parsed) ? parsed : [parsed]) {
        collectNodes(item as LdNode, nodes);
      }
    } catch {
      // JSON-LD malformé, fréquent — on ignore
    }
  });

  const business = nodes.find((n) => {
    const types = Array.isArray(n['@type']) ? n['@type'] : [n['@type'] ?? ''];
    return types.some((t) => typeof t === 'string' && BUSINESS_TYPES.test(t));
  });
  if (!business) return null;

  const rawType = Array.isArray(business['@type']) ? business['@type'][0] : business['@type'];
  let address: string | null = null;
  if (typeof business.address === 'string') {
    address = business.address;
  } else if (business.address && typeof business.address === 'object') {
    const a = business.address;
    const parts: string[] = [];
    if (a.streetAddress) parts.push(a.streetAddress);
    const cityLine = [a.postalCode, a.addressLocality].filter(Boolean).join(' ');
    // évite "17 Rue X, 44270 La Marne, 44270 La Marne" quand streetAddress contient déjà CP+ville
    if (cityLine && (!a.postalCode || !(a.streetAddress ?? '').includes(a.postalCode))) {
      parts.push(cityLine);
    }
    address = parts.join(', ') || null;
  }

  const founder = founderName(business.founder);
  return {
    name: business.name ? decodeEntities(business.name) : null,
    type: rawType ?? null,
    description: business.description ? decodeEntities(business.description) : null,
    telephone: business.telephone ?? null,
    email: business.email ?? null,
    address: address ? decodeEntities(address) : null,
    founder: founder ? decodeEntities(founder) : null,
  };
}

/** Traduit un @type schema.org en libellé métier français. */
const TYPE_LABELS: Record<string, string> = {
  Plumber: 'Plombier',
  Electrician: 'Électricien',
  HairSalon: 'Salon de coiffure',
  Bakery: 'Boulangerie',
  Restaurant: 'Restaurant',
  Dentist: 'Dentiste',
  Physician: 'Médecin',
  Attorney: 'Avocat',
  LegalService: 'Service juridique',
  AutoRepair: 'Garage automobile',
  RoofingContractor: 'Couvreur',
  GeneralContractor: 'Entreprise de bâtiment',
  HomeAndConstructionBusiness: 'Bâtiment / construction',
  RealEstateAgent: 'Agence immobilière',
  Florist: 'Fleuriste',
  Hotel: 'Hôtel',
  FoodEstablishment: 'Restauration',
  Store: 'Commerce',
};

export function businessTypeLabel(ldType: string | null): string | null {
  if (!ldType) return null;
  if (TYPE_LABELS[ldType]) return TYPE_LABELS[ldType];
  if (/LocalBusiness|Organization|ProfessionalService/i.test(ldType)) return null;
  return ldType;
}

/** Secteur déduit du type métier (grosses mailles pour le CRM). */
export function deduceCategory(businessType: string | null): string | null {
  if (!businessType) return null;
  const t = businessType.toLowerCase();
  if (/plombier|électricien|couvreur|bâtiment|construction|maçon|menuis|peintre|chauffag/.test(t))
    return 'Artisanat / BTP';
  if (/restaurant|boulangerie|restauration|traiteur|café|brasserie/.test(t)) return 'Restauration';
  if (/coiffure|beauté|esthétique|bien-être|massage/.test(t)) return 'Beauté / bien-être';
  if (/dentiste|médecin|santé|kiné|ostéo|infirmi/.test(t)) return 'Santé';
  if (/avocat|juridique|notaire|comptab/.test(t)) return 'Juridique / conseil';
  if (/immobili/.test(t)) return 'Immobilier';
  if (/garage|auto/.test(t)) return 'Automobile';
  if (/commerce|fleuriste|boutique|magasin/.test(t)) return 'Commerce';
  if (/hôtel|gîte|camping|tourisme/.test(t)) return 'Tourisme / hébergement';
  return null;
}

// --- Identité / description ---------------------------------------------------

// titres parasites : bandeau cookies, pages légales, placeholders (fréquents sur les sites local.fr)
const JUNK_NAME_RE =
  /rgpd|cookies?|mentions?\s+l[ée]gales|l[ée]gislation|confidentialit|politique|donn[ée]es personnelles|accueil$|^welcome\s*!?$|^bienvenue\s*!?$|^home$/i;

/** Décode les entités HTML résiduelles (sites qui double-encodent : "L&#039;OSTERIA"). */
function decodeEntities(s: string): string {
  return s
    .replace(/&#0?39;|&apos;|&#x27;/gi, "'")
    .replace(/&quot;/gi, '"')
    .replace(/&amp;/gi, '&')
    .replace(/&nbsp;/gi, ' ')
    .replace(/&eacute;/gi, 'é')
    .replace(/&egrave;/gi, 'è')
    .replace(/&agrave;/gi, 'à');
}

export function extractSiteName($: CheerioAPI): { value: string; source: string } | null {
  const og = decodeEntities($('meta[property="og:site_name"]').attr('content')?.trim() ?? '');
  if (og && !JUNK_NAME_RE.test(og)) return { value: og, source: 'og:site_name' };
  const title = decodeEntities($('title').first().text().trim());
  if (title) {
    // coupe les suffixes type " - Accueil" / " | Plombier Lyon"
    const cleaned = title.split(/\s*[|–-]\s*/)[0].trim();
    if (cleaned && !JUNK_NAME_RE.test(cleaned)) return { value: cleaned, source: 'title' };
  }
  const h1 = decodeEntities($('h1').first().text().trim());
  if (h1 && h1.length <= 80 && !JUNK_NAME_RE.test(h1)) return { value: h1, source: 'h1' };
  return null;
}

export function extractDescription($: CheerioAPI): { value: string; source: string } | null {
  const meta =
    $('meta[name="description"]').attr('content')?.trim() ||
    $('meta[property="og:description"]').attr('content')?.trim();
  if (meta) return { value: meta.slice(0, 500), source: 'meta:description' };
  let found: string | null = null;
  $('p').each((_, el) => {
    if (found) return;
    const text = $('body').find(el).text().trim().replace(/\s+/g, ' ');
    if (text.length >= 80) found = text.slice(0, 500);
  });
  return found ? { value: found, source: 'homepage:p' } : null;
}

// --- Images ---------------------------------------------------------------------

/** Nombre approximatif d'images sur la page (src uniques, lazy-loading inclus, icônes exclues). */
export function countImages($: CheerioAPI): number {
  const seen = new Set<string>();
  let anonymous = 0;
  $('img, source[srcset], [style*="background-image"]').each((_, el) => {
    const $el = $(el);
    const src =
      $el.attr('src') ||
      $el.attr('data-src') ||
      $el.attr('data-lazy-src') ||
      $el.attr('srcset')?.split(/[\s,]/)[0] ||
      $el.attr('style')?.match(/background-image\s*:\s*url\(['"]?([^'")]+)/i)?.[1] ||
      '';
    if (/\.svg|icon|logo-?small|pixel|spacer|1x1/i.test(src)) return;
    if (src) seen.add(src.trim());
    else if (el.tagName === 'img') anonymous++;
  });
  return seen.size + anonymous;
}

// --- Emails --------------------------------------------------------------------

const EMAIL_RE = /[a-z0-9._%+\-]+@[a-z0-9.\-]+\.[a-z]{2,}/gi;
const EMAIL_VALID_RE = /^[a-z0-9._%+\-]+@[a-z0-9.\-]+\.[a-z]{2,}$/i;
const EMAIL_BLACKLIST =
  /noreply|no-reply|sentry|wixpress|example\.|@2x|\.(png|jpe?g|gif|webp|svg|ico|css|js)$|@(?:[a-z0-9.\-]+\.)?local\.fr$/i;

/** Décode l'obfuscation Cloudflare data-cfemail. */
function decodeCfEmail(hex: string): string | null {
  if (!/^[0-9a-f]{4,}$/i.test(hex)) return null;
  const key = parseInt(hex.slice(0, 2), 16);
  let out = '';
  for (let i = 2; i < hex.length; i += 2) {
    out += String.fromCharCode(parseInt(hex.slice(i, i + 2), 16) ^ key);
  }
  return out.includes('@') ? out : null;
}

export function extractEmails($: CheerioAPI, html: string): string[] {
  const found: string[] = [];

  // 1. mailto: (prioritaire)
  $('a[href^="mailto:"]').each((_, el) => {
    const raw = ($(el).attr('href') ?? '').replace(/^mailto:/i, '').split('?')[0];
    if (raw) found.push(decodeURIComponent(raw));
  });

  // 2. Obfuscation Cloudflare
  $('[data-cfemail]').each((_, el) => {
    const decoded = decodeCfEmail($(el).attr('data-cfemail') ?? '');
    if (decoded) found.push(decoded);
  });

  // 3. Texte brut, avec dé-obfuscations courantes ("AT"/"arobase", entités)
  const text = html
    .replace(/&#64;|&commat;/gi, '@')
    .replace(/&#46;|&period;/gi, '.')
    .replace(/\s*[\[(]\s*(?:at|arobase)\s*[\])]\s*/gi, '@')
    .replace(/\s*[\[(]\s*(?:dot|point)\s*[\])]\s*/gi, '.');
  found.push(...(text.match(EMAIL_RE) ?? []));

  const clean = found
    .map((e) => e.trim().toLowerCase().replace(/[.,;]$/, ''))
    .filter((e) => EMAIL_VALID_RE.test(e) && !EMAIL_BLACKLIST.test(e));
  return [...new Set(clean)];
}

// --- Téléphones ------------------------------------------------------------------

const PHONE_FR_RE = /(?:(?:\+|00)33[\s.\-]?(?:\(0\)[\s.\-]?)?|0)[1-9](?:[\s.\-]?\d{2}){4}/g;

/** Normalise un numéro FR en "+33 X XX XX XX XX". Retourne null si invalide. */
export function normalizePhoneFr(raw: string): string | null {
  let digits = raw.replace(/[^\d+]/g, '');
  digits = digits.replace(/^00/, '+');
  if (digits.startsWith('+33')) digits = digits.slice(3);
  digits = digits.replace(/^0/, '');
  // +33(0)X… : retire le 0 résiduel
  if (digits.length === 10 && digits.startsWith('0')) digits = digits.slice(1);
  if (digits.length !== 9 || !/^[1-9]/.test(digits)) return null;
  const pairs = digits.slice(1).match(/\d{2}/g) ?? [];
  return `+33 ${digits[0]} ${pairs.join(' ')}`;
}

// numéros de prestataires qui traînent dans les mentions légales (OVH, AFNIC)
const PHONE_BLACKLIST = new Set(['+33 9 72 10 10 07', '+33 1 43 98 77 00']);

export function extractPhones($: CheerioAPI, html: string): string[] {
  const found: string[] = [];
  // 1. hrefs tel: (prioritaires)
  $('a[href^="tel:"]').each((_, el) => {
    found.push(($(el).attr('href') ?? '').replace(/^tel:/i, ''));
  });
  // 2. Regex FR sur le texte
  const text = $('body').text();
  found.push(...(text.match(PHONE_FR_RE) ?? []), ...(html.match(PHONE_FR_RE) ?? []));

  const normalized = found
    .map(normalizePhoneFr)
    .filter((p): p is string => p !== null && !PHONE_BLACKLIST.has(p));
  return [...new Set(normalized)];
}
