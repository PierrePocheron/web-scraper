import { randomUUID } from 'node:crypto';
import Papa from 'papaparse';
import { eq } from 'drizzle-orm';
import { db } from '@/lib/db';
import { prospects } from '@/lib/db/schema';
import { normalizeDomain } from '@/lib/domain';
import {
  ENRICHMENT_STATUSES,
  OUTREACH_STATUSES,
  SITE_TYPES,
  type EnrichmentStatus,
  type FieldSource,
  type OutreachStatus,
  type SiteType,
} from '@/lib/types';

export interface ImportRecap {
  created: number;
  updated: number;
  ignored: number;
  errors: string[];
}

type ProspectRow = typeof prospects.$inferSelect;
type RawRecord = Record<string, unknown>;

/** Import CSV ou JSON → upsert par domaine, sans écraser notes/outreachStatus ni les champs déjà remplis. */
export function importContent(content: string, format: 'csv' | 'json'): ImportRecap {
  const recap: ImportRecap = { created: 0, updated: 0, ignored: 0, errors: [] };
  let records: RawRecord[];

  if (format === 'json') {
    try {
      const parsed = JSON.parse(content);
      records = Array.isArray(parsed) ? parsed : [parsed];
    } catch {
      recap.errors.push('JSON invalide');
      return recap;
    }
  } else {
    const parsed = Papa.parse<RawRecord>(content, { header: true, skipEmptyLines: true });
    records = parsed.data;
    for (const err of parsed.errors.slice(0, 5)) {
      recap.errors.push(`CSV ligne ${err.row} : ${err.message}`);
    }
  }

  const seenInFile = new Set<string>();
  const now = new Date().toISOString();

  for (const [index, raw] of records.entries()) {
    const candidate = normalizeRecord(raw);
    const domain = normalizeDomain(
      str(candidate.domain) || str(candidate.url) || ''
    );
    if (!domain) {
      recap.ignored++;
      recap.errors.push(`Ligne ${index + 1} : domaine/url manquant`);
      continue;
    }
    if (seenInFile.has(domain)) {
      recap.ignored++;
      continue;
    }
    seenInFile.add(domain);

    const existing = db.select().from(prospects).where(eq(prospects.domain, domain)).get();
    if (existing) {
      const changes = fillEmptyFields(existing, candidate);
      if (Object.keys(changes).length > 0) {
        db.update(prospects).set(changes).where(eq(prospects.id, existing.id)).run();
        recap.updated++;
      } else {
        recap.ignored++;
      }
    } else {
      db.insert(prospects)
        .values({
          id: randomUUID(),
          domain,
          url: str(candidate.url) || `https://${domain}`,
          sourceQuery: str(candidate.sourceQuery) || 'import',
          discoveredAt: str(candidate.discoveredAt) || now,
          lastEnrichedAt: str(candidate.lastEnrichedAt) || null,
          enrichmentStatus: candidate.enrichmentStatus ?? (candidate.lastEnrichedAt ? 'done' : 'pending'),
          businessName: str(candidate.businessName) || null,
          businessType: str(candidate.businessType) || null,
          businessDescription: str(candidate.businessDescription) || null,
          category: str(candidate.category) || null,
          contactFirstName: str(candidate.contactFirstName) || null,
          contactLastName: str(candidate.contactLastName) || null,
          publicationManager: str(candidate.publicationManager) || null,
          emails: candidate.emails ?? [],
          phones: candidate.phones ?? [],
          address: str(candidate.address) || null,
          siret: str(candidate.siret) || null,
          legalNoticeUrl: str(candidate.legalNoticeUrl) || null,
          siteType: candidate.siteType ?? 'inconnu',
          cms: str(candidate.cms) || null,
          domainCreatedAt: str(candidate.domainCreatedAt) || null,
          imageCountEstimate: candidate.imageCountEstimate ?? null,
          pageCountEstimate: candidate.pageCountEstimate ?? null,
          hasSitemap: candidate.hasSitemap ?? false,
          isHttps: candidate.isHttps ?? false,
          performanceScore: candidate.performanceScore ?? null,
          fieldSources: candidate.fieldSources ?? {},
          outreachStatus: candidate.outreachStatus ?? 'nouveau',
          notes: str(candidate.notes) || null,
        })
        .run();
      recap.created++;
    }
  }

  return recap;
}

interface Candidate {
  domain?: string;
  url?: string;
  sourceQuery?: string;
  discoveredAt?: string;
  lastEnrichedAt?: string;
  enrichmentStatus?: EnrichmentStatus;
  businessName?: string;
  businessType?: string;
  businessDescription?: string;
  category?: string;
  contactFirstName?: string;
  contactLastName?: string;
  publicationManager?: string;
  emails?: string[];
  phones?: string[];
  address?: string;
  siret?: string;
  legalNoticeUrl?: string;
  siteType?: SiteType;
  cms?: string;
  domainCreatedAt?: string;
  imageCountEstimate?: number;
  pageCountEstimate?: number;
  hasSitemap?: boolean;
  isHttps?: boolean;
  performanceScore?: number;
  fieldSources?: Record<string, FieldSource>;
  outreachStatus?: OutreachStatus;
  notes?: string;
}

function str(v: unknown): string {
  return typeof v === 'string' ? v.trim() : '';
}

function toList(v: unknown): string[] | undefined {
  if (Array.isArray(v)) return v.filter((x): x is string => typeof x === 'string' && x.length > 0);
  if (typeof v === 'string' && v.trim()) {
    return v.split(';').map((s) => s.trim()).filter(Boolean);
  }
  return undefined;
}

function toBool(v: unknown): boolean | undefined {
  if (typeof v === 'boolean') return v;
  if (typeof v === 'string') {
    if (/^(true|1|oui)$/i.test(v.trim())) return true;
    if (/^(false|0|non)$/i.test(v.trim())) return false;
  }
  return undefined;
}

function toNum(v: unknown): number | undefined {
  if (typeof v === 'number' && Number.isFinite(v)) return v;
  if (typeof v === 'string' && v.trim()) {
    const n = Number(v);
    if (Number.isFinite(n)) return n;
  }
  return undefined;
}

function toEnum<T extends string>(v: unknown, values: readonly T[]): T | undefined {
  return typeof v === 'string' && (values as readonly string[]).includes(v) ? (v as T) : undefined;
}

function toFieldSources(v: unknown): Record<string, FieldSource> | undefined {
  if (v && typeof v === 'object' && !Array.isArray(v)) return v as Record<string, FieldSource>;
  if (typeof v === 'string' && v.trim().startsWith('{')) {
    try {
      return JSON.parse(v) as Record<string, FieldSource>;
    } catch {
      return undefined;
    }
  }
  return undefined;
}

/** Convertit un enregistrement brut (CSV strings ou JSON) en candidat typé. */
function normalizeRecord(raw: RawRecord): Candidate {
  return {
    domain: str(raw.domain) || undefined,
    url: str(raw.url) || undefined,
    sourceQuery: str(raw.sourceQuery) || undefined,
    discoveredAt: str(raw.discoveredAt) || undefined,
    lastEnrichedAt: str(raw.lastEnrichedAt) || undefined,
    enrichmentStatus: toEnum(raw.enrichmentStatus, ENRICHMENT_STATUSES),
    businessName: str(raw.businessName) || undefined,
    businessType: str(raw.businessType) || undefined,
    businessDescription: str(raw.businessDescription) || undefined,
    category: str(raw.category) || undefined,
    contactFirstName: str(raw.contactFirstName) || undefined,
    contactLastName: str(raw.contactLastName) || undefined,
    publicationManager: str(raw.publicationManager) || undefined,
    emails: toList(raw.emails),
    phones: toList(raw.phones),
    address: str(raw.address) || undefined,
    siret: str(raw.siret) || undefined,
    legalNoticeUrl: str(raw.legalNoticeUrl) || undefined,
    siteType: toEnum(raw.siteType, SITE_TYPES),
    cms: str(raw.cms) || undefined,
    domainCreatedAt: str(raw.domainCreatedAt) || undefined,
    imageCountEstimate: toNum(raw.imageCountEstimate),
    pageCountEstimate: toNum(raw.pageCountEstimate),
    hasSitemap: toBool(raw.hasSitemap),
    isHttps: toBool(raw.isHttps),
    performanceScore: toNum(raw.performanceScore),
    fieldSources: toFieldSources(raw.fieldSources),
    outreachStatus: toEnum(raw.outreachStatus, OUTREACH_STATUSES),
    notes: str(raw.notes) || undefined,
  };
}

function isEmpty(v: unknown): boolean {
  if (v === null || v === undefined) return true;
  if (typeof v === 'string') return v.trim() === '';
  if (Array.isArray(v)) return v.length === 0;
  if (typeof v === 'object') return Object.keys(v as object).length === 0;
  return false;
}

/** Complète uniquement les champs vides de la fiche existante. Ne touche JAMAIS notes ni outreachStatus. */
function fillEmptyFields(existing: ProspectRow, candidate: Candidate): Partial<ProspectRow> {
  const changes: Partial<ProspectRow> = {};
  const fillable = [
    'businessName',
    'businessType',
    'businessDescription',
    'category',
    'contactFirstName',
    'contactLastName',
    'publicationManager',
    'emails',
    'phones',
    'address',
    'siret',
    'legalNoticeUrl',
    'cms',
    'domainCreatedAt',
    'imageCountEstimate',
    'pageCountEstimate',
    'performanceScore',
    'fieldSources',
  ] as const;

  for (const key of fillable) {
    const incoming = candidate[key];
    if (!isEmpty(incoming) && isEmpty(existing[key])) {
      (changes as Record<string, unknown>)[key] = incoming;
    }
  }
  if (existing.siteType === 'inconnu' && candidate.siteType && candidate.siteType !== 'inconnu') {
    changes.siteType = candidate.siteType;
  }
  return changes;
}
