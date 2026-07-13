import PQueue from 'p-queue';
import { eq, inArray } from 'drizzle-orm';
import { config } from '@/lib/config';
import { db } from '@/lib/db';
import { prospects } from '@/lib/db/schema';
import { emitEnrich } from './events';
import { enrichProspect } from './enrich';

type ProspectRow = typeof prospects.$inferSelect;

export interface RunState {
  active: boolean;
  total: number;
  done: number;
  failed: number;
}

// État de run global (un seul run à la fois, app mono-utilisateur)
const g = globalThis as unknown as { __pfRunState?: RunState };
const state = (g.__pfRunState ??= { active: false, total: 0, done: 0, failed: 0 });

export function getRunStatus(): RunState {
  return { ...state };
}

export interface StartOptions {
  mode?: 'all' | 'retry';
  ids?: string[];
  force?: boolean;
}

export interface StartResult {
  queued: number;
  skippedFresh: number;
}

export class RunActiveError extends Error {
  constructor() {
    super('Un enrichissement est déjà en cours');
  }
}

/** Lance un run d'enrichissement en arrière-plan. Idempotent vis-à-vis du TTL sauf force. */
export function startEnrichment(opts: StartOptions): StartResult {
  if (state.active) throw new RunActiveError();

  let rows: ProspectRow[];
  if (opts.ids && opts.ids.length > 0) {
    rows = db.select().from(prospects).where(inArray(prospects.id, opts.ids)).all();
  } else if (opts.mode === 'retry') {
    rows = db.select().from(prospects).where(eq(prospects.enrichmentStatus, 'failed')).all();
  } else {
    rows = db.select().from(prospects).all();
  }

  const ttlMs = config.enrichTtlDays * 24 * 60 * 60 * 1000;
  const now = Date.now();
  const isFresh = (r: ProspectRow) =>
    r.enrichmentStatus === 'done' &&
    r.lastEnrichedAt !== null &&
    now - Date.parse(r.lastEnrichedAt) < ttlMs;

  const targets = opts.force ? rows : rows.filter((r) => !isFresh(r));
  const result: StartResult = {
    queued: targets.length,
    skippedFresh: rows.length - targets.length,
  };
  if (targets.length === 0) return result;

  state.active = true;
  state.total = targets.length;
  state.done = 0;
  state.failed = 0;
  emitEnrich({ type: 'run-start', total: targets.length });

  void runBatch(targets).catch((err) => {
    console.error('[enrich] run interrompu :', err);
    state.active = false;
    emitEnrich({ type: 'run-end', done: state.done, failed: state.failed, total: state.total });
  });

  return result;
}

async function runBatch(targets: ProspectRow[]) {
  const queue = new PQueue({ concurrency: config.enrichConcurrency });
  for (const row of targets) {
    emitEnrich({ type: 'site', domain: row.domain, step: 'en attente' });
    void queue.add(() => enrichOne(row));
  }
  await queue.onIdle();
  state.active = false;
  emitEnrich({ type: 'run-end', done: state.done, failed: state.failed, total: state.total });
  console.log(`[enrich] run terminé : ${state.done} ok, ${state.failed} échec(s) / ${state.total}`);
}

// Remise à zéro des champs extraits avant ré-application : évite de garder des valeurs
// obsolètes d'un run précédent. performanceScore exclu (optionnel, on garde le dernier connu).
const EXTRACTION_RESET: Partial<ProspectRow> = {
  businessName: null,
  businessType: null,
  businessDescription: null,
  category: null,
  contactFirstName: null,
  contactLastName: null,
  publicationManager: null,
  emails: [],
  phones: [],
  address: null,
  siret: null,
  legalNoticeUrl: null,
  siteType: 'inconnu',
  cms: null,
  domainCreatedAt: null,
  imageCountEstimate: null,
  pageCountEstimate: null,
  hasSitemap: false,
  fieldSources: {},
};

/** Enrichit un site. Un échec ne bloque jamais le lot. */
async function enrichOne(row: ProspectRow) {
  const startedAt = Date.now();
  db.update(prospects)
    .set({ enrichmentStatus: 'running', enrichmentError: null })
    .where(eq(prospects.id, row.id))
    .run();

  try {
    const updates = await enrichProspect(row, (step) =>
      emitEnrich({ type: 'site', domain: row.domain, step })
    );
    db.update(prospects)
      .set({
        ...EXTRACTION_RESET,
        ...updates,
        enrichmentStatus: 'done',
        enrichmentError: null,
        lastEnrichedAt: new Date().toISOString(),
      })
      .where(eq(prospects.id, row.id))
      .run();
    state.done++;
    const durationMs = Date.now() - startedAt;
    emitEnrich({ type: 'site', domain: row.domain, step: 'ok', durationMs });
    console.log(`[enrich] ${row.domain} : ok en ${durationMs}ms`);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    db.update(prospects)
      .set({ enrichmentStatus: 'failed', enrichmentError: message })
      .where(eq(prospects.id, row.id))
      .run();
    state.failed++;
    const durationMs = Date.now() - startedAt;
    emitEnrich({ type: 'site', domain: row.domain, step: 'échec', error: message, durationMs });
    console.warn(`[enrich] ${row.domain} : échec en ${durationMs}ms — ${message}`);
  }
  emitEnrich({ type: 'run-progress', done: state.done, failed: state.failed, total: state.total });
}
