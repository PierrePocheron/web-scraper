import { EventEmitter } from 'node:events';

export type SiteStep = 'en attente' | 'fetch' | 'parsing' | 'ok' | 'échec';

export type EnrichEvent =
  | { type: 'run-start'; total: number }
  | { type: 'site'; domain: string; step: SiteStep; error?: string; durationMs?: number }
  | { type: 'run-progress'; done: number; failed: number; total: number }
  | { type: 'run-end'; done: number; failed: number; total: number };

// Singleton global : survit aux rechargements de modules du dev server.
const g = globalThis as unknown as { __pfEnrichEvents?: EventEmitter };
export const enrichEvents = (g.__pfEnrichEvents ??= (() => {
  const e = new EventEmitter();
  e.setMaxListeners(50);
  return e;
})());

export function emitEnrich(event: EnrichEvent) {
  enrichEvents.emit('event', event);
}
