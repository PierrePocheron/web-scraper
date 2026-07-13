import { z } from 'zod';

export const CONFIDENCES = ['high', 'medium', 'low'] as const;
export type Confidence = (typeof CONFIDENCES)[number];

export const ENRICHMENT_STATUSES = ['pending', 'running', 'done', 'failed'] as const;
export type EnrichmentStatus = (typeof ENRICHMENT_STATUSES)[number];

export const SITE_TYPES = ['vitrine', 'ecommerce', 'blog', 'landing', 'inconnu'] as const;
export type SiteType = (typeof SITE_TYPES)[number];

export const OUTREACH_STATUSES = [
  'nouveau',
  'a_contacter',
  'contacte',
  'relance',
  'rdv',
  'client',
  'pas_interesse',
] as const;
export type OutreachStatus = (typeof OUTREACH_STATUSES)[number];

export const OUTREACH_LABELS: Record<OutreachStatus, string> = {
  nouveau: 'Nouveau',
  a_contacter: 'À contacter',
  contacte: 'Contacté',
  relance: 'Relance',
  rdv: 'RDV',
  client: 'Client',
  pas_interesse: 'Pas intéressé',
};

export const fieldSourceSchema = z.object({
  source: z.string(),
  confidence: z.enum(CONFIDENCES),
});
export type FieldSource = z.infer<typeof fieldSourceSchema>;

export const prospectSchema = z.object({
  id: z.string(),
  domain: z.string().min(1),
  url: z.string().min(1),
  // Provenance
  sourceQuery: z.string(),
  discoveredAt: z.string(),
  lastEnrichedAt: z.string().nullable(),
  enrichmentStatus: z.enum(ENRICHMENT_STATUSES),
  enrichmentError: z.string().nullable(),
  // Business
  businessName: z.string().nullable(),
  businessType: z.string().nullable(),
  businessDescription: z.string().nullable(),
  category: z.string().nullable(),
  // Contact
  contactFirstName: z.string().nullable(),
  contactLastName: z.string().nullable(),
  publicationManager: z.string().nullable(),
  emails: z.array(z.string()),
  phones: z.array(z.string()),
  address: z.string().nullable(),
  siret: z.string().nullable(),
  legalNoticeUrl: z.string().nullable(),
  // Site
  siteType: z.enum(SITE_TYPES),
  cms: z.string().nullable(),
  domainCreatedAt: z.string().nullable(),
  imageCountEstimate: z.number().nullable(),
  pageCountEstimate: z.number().nullable(),
  hasSitemap: z.boolean(),
  isHttps: z.boolean(),
  performanceScore: z.number().nullable(),
  seoScore: z.number().nullable(),
  seoIssues: z.array(z.string()),
  // Traçabilité
  fieldSources: z.record(z.string(), fieldSourceSchema),
  // Pipeline commercial
  outreachStatus: z.enum(OUTREACH_STATUSES),
  notes: z.string().nullable(),
});

export type Prospect = z.infer<typeof prospectSchema>;

export interface SavedQuery {
  id: string;
  query: string;
  pagesMax: number;
  createdAt: string;
  lastRunAt: string | null;
}

export const DEFAULT_DORK = '"Créé par Local.fr" "Mettre à jour mon site internet" -site:local.fr';

/** Schéma tolérant pour l'import : seuls domain/url sont requis, le reste est complété. */
export const prospectImportSchema = prospectSchema.partial().extend({
  domain: z.string().optional(),
  url: z.string().min(1),
});
export type ProspectImport = z.infer<typeof prospectImportSchema>;
