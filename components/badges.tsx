import type { Confidence, EnrichmentStatus } from '@/lib/types';

const ENRICHMENT_STYLES: Record<EnrichmentStatus, { label: string; cls: string }> = {
  pending: { label: 'En attente', cls: 'bg-zinc-200 text-zinc-700' },
  running: { label: 'En cours…', cls: 'bg-blue-100 text-blue-700 animate-pulse' },
  done: { label: 'OK', cls: 'bg-emerald-100 text-emerald-700' },
  failed: { label: 'Échec', cls: 'bg-red-100 text-red-700' },
};

export function EnrichmentBadge({ status }: { status: EnrichmentStatus }) {
  const s = ENRICHMENT_STYLES[status];
  return (
    <span className={`inline-block rounded-full px-2 py-0.5 text-xs font-medium ${s.cls}`}>
      {s.label}
    </span>
  );
}

const CONFIDENCE_STYLES: Record<Confidence, string> = {
  high: 'bg-emerald-100 text-emerald-700',
  medium: 'bg-amber-100 text-amber-700',
  low: 'bg-red-100 text-red-700',
};

const CONFIDENCE_LABELS: Record<Confidence, string> = {
  high: 'fiable',
  medium: 'moyen',
  low: 'faible',
};

export function ConfidenceBadge({ confidence }: { confidence: Confidence }) {
  return (
    <span
      className={`inline-block rounded-full px-2 py-0.5 text-xs font-medium ${CONFIDENCE_STYLES[confidence]}`}
    >
      {CONFIDENCE_LABELS[confidence]}
    </span>
  );
}

export function NewBadge() {
  return (
    <span className="inline-block rounded-full bg-indigo-100 px-2 py-0.5 text-xs font-medium text-indigo-700">
      nouveau
    </span>
  );
}
