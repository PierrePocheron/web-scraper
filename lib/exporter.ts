import Papa from 'papaparse';
import { desc } from 'drizzle-orm';
import { db } from '@/lib/db';
import { prospects } from '@/lib/db/schema';

type ProspectRow = typeof prospects.$inferSelect;

export function getAllProspects(): ProspectRow[] {
  return db.select().from(prospects).orderBy(desc(prospects.discoveredAt)).all();
}

/** Export CSV : une ligne par prospect, emails/phones joints par ";", fieldSources en JSON. */
export function exportCsv(): string {
  const rows = getAllProspects().map((p) => ({
    ...p,
    emails: p.emails.join(';'),
    phones: p.phones.join(';'),
    fieldSources: JSON.stringify(p.fieldSources),
  }));
  return Papa.unparse(rows, { newline: '\n' });
}

/** Export JSON : schéma Prospect stable (contrat ERP). */
export function exportJson(): string {
  return JSON.stringify(getAllProspects(), null, 2);
}
