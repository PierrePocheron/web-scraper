import { sqliteTable, text, integer } from 'drizzle-orm/sqlite-core';
import type { FieldSource } from '@/lib/types';

export const prospects = sqliteTable('prospects', {
  id: text('id').primaryKey(),
  domain: text('domain').notNull().unique(),
  url: text('url').notNull(),
  // Provenance
  sourceQuery: text('source_query').notNull().default(''),
  discoveredAt: text('discovered_at').notNull(),
  lastEnrichedAt: text('last_enriched_at'),
  enrichmentStatus: text('enrichment_status').notNull().default('pending'),
  enrichmentError: text('enrichment_error'),
  // Business
  businessName: text('business_name'),
  businessType: text('business_type'),
  businessDescription: text('business_description'),
  category: text('category'),
  // Contact
  contactFirstName: text('contact_first_name'),
  contactLastName: text('contact_last_name'),
  publicationManager: text('publication_manager'),
  emails: text('emails', { mode: 'json' }).$type<string[]>().notNull().default([]),
  phones: text('phones', { mode: 'json' }).$type<string[]>().notNull().default([]),
  address: text('address'),
  siret: text('siret'),
  legalNoticeUrl: text('legal_notice_url'),
  // Site
  siteType: text('site_type').notNull().default('inconnu'),
  cms: text('cms'),
  pageCountEstimate: integer('page_count_estimate'),
  hasSitemap: integer('has_sitemap', { mode: 'boolean' }).notNull().default(false),
  isHttps: integer('is_https', { mode: 'boolean' }).notNull().default(false),
  performanceScore: integer('performance_score'),
  // Traçabilité
  fieldSources: text('field_sources', { mode: 'json' })
    .$type<Record<string, FieldSource>>()
    .notNull()
    .default({}),
  // Pipeline commercial
  outreachStatus: text('outreach_status').notNull().default('nouveau'),
  notes: text('notes'),
});

export const savedQueries = sqliteTable('saved_queries', {
  id: text('id').primaryKey(),
  query: text('query').notNull().unique(),
  pagesMax: integer('pages_max').notNull().default(10),
  createdAt: text('created_at').notNull(),
  lastRunAt: text('last_run_at'),
});
