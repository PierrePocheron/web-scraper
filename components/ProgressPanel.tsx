'use client';

export interface SiteProgress {
  step: 'en attente' | 'fetch' | 'parsing' | 'ok' | 'échec';
  error?: string;
}

export interface RunProgress {
  active: boolean;
  total: number;
  done: number;
  failed: number;
  sites: Record<string, SiteProgress>;
}

const STEP_STYLES: Record<SiteProgress['step'], string> = {
  'en attente': 'text-zinc-400',
  fetch: 'text-blue-600',
  parsing: 'text-indigo-600',
  ok: 'text-emerald-600',
  'échec': 'text-red-600',
};

export default function ProgressPanel({ progress }: { progress: RunProgress }) {
  const processed = progress.done + progress.failed;
  const pct = progress.total > 0 ? Math.round((processed / progress.total) * 100) : 0;
  const entries = Object.entries(progress.sites);

  return (
    <div className="rounded-lg border border-zinc-200 bg-white p-4 shadow-sm">
      <div className="mb-2 flex items-center justify-between text-sm">
        <span className="font-semibold">
          {progress.active ? 'Enrichissement en cours…' : 'Enrichissement terminé'}
        </span>
        <span className="text-zinc-500">
          {processed} / {progress.total} — {progress.done} ok, {progress.failed} échec(s)
        </span>
      </div>
      <div className="mb-3 h-2 overflow-hidden rounded-full bg-zinc-100">
        <div
          className="h-full rounded-full bg-emerald-500 transition-all"
          style={{ width: `${pct}%` }}
        />
      </div>
      <div className="max-h-40 space-y-0.5 overflow-y-auto font-mono text-xs">
        {entries.map(([domain, s]) => (
          <div key={domain} className="flex justify-between gap-2">
            <span className="truncate">{domain}</span>
            <span className={STEP_STYLES[s.step]} title={s.error}>
              {s.step}
              {s.error ? ` — ${s.error.slice(0, 60)}` : ''}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}
