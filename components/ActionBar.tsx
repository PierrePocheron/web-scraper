'use client';

import { useRef, useState } from 'react';
import { DEFAULT_DORK, type SavedQuery } from '@/lib/types';

interface Props {
  savedQueries: SavedQuery[];
  searching: boolean;
  enriching: boolean;
  selectedCount: number;
  failedCount: number;
  pendingCount: number;
  onSearch: (query: string, pagesMax: number) => void;
  onEnrich: (mode: 'all' | 'selection' | 'retry') => void;
  onImport: (file: File) => void;
  onCopyErpPrompt: () => void;
}

export default function ActionBar({
  savedQueries,
  searching,
  enriching,
  selectedCount,
  failedCount,
  pendingCount,
  onSearch,
  onEnrich,
  onImport,
  onCopyErpPrompt,
}: Props) {
  const [query, setQuery] = useState(DEFAULT_DORK);
  const [pagesMax, setPagesMax] = useState(10);
  const fileRef = useRef<HTMLInputElement>(null);

  return (
    <div className="space-y-3 rounded-lg border border-zinc-200 bg-white p-4 shadow-sm">
      <div className="flex flex-wrap items-end gap-3">
        <label className="grow">
          <span className="mb-1 block text-xs font-medium uppercase text-zinc-500">
            Requête Google (dork)
          </span>
          <input
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            className="w-full rounded border border-zinc-300 px-3 py-2 font-mono text-sm"
            placeholder={DEFAULT_DORK}
          />
        </label>
        <label>
          <span className="mb-1 block text-xs font-medium uppercase text-zinc-500">Pages max</span>
          <input
            type="number"
            min={1}
            max={30}
            value={pagesMax}
            onChange={(e) => setPagesMax(Number(e.target.value))}
            className="w-20 rounded border border-zinc-300 px-3 py-2 text-sm"
          />
        </label>
        <button
          onClick={() => onSearch(query, pagesMax)}
          disabled={searching || query.trim().length < 3}
          className="rounded bg-blue-600 px-4 py-2 text-sm font-semibold text-white hover:bg-blue-700 disabled:opacity-50"
        >
          {searching ? 'Recherche en cours…' : 'Lancer la recherche'}
        </button>
        {savedQueries.length > 0 && (
          <select
            value=""
            onChange={(e) => {
              const q = savedQueries.find((s) => s.id === e.target.value);
              if (q) {
                setQuery(q.query);
                setPagesMax(q.pagesMax);
              }
            }}
            className="rounded border border-zinc-300 px-2 py-2 text-sm"
          >
            <option value="">Requêtes sauvegardées…</option>
            {savedQueries.map((q) => (
              <option key={q.id} value={q.id}>
                {q.query.slice(0, 60)}
              </option>
            ))}
          </select>
        )}
      </div>

      <div className="flex flex-wrap items-center gap-2 border-t border-zinc-100 pt-3">
        <button
          onClick={() => onEnrich('all')}
          disabled={enriching || pendingCount === 0}
          className="rounded bg-emerald-600 px-3 py-1.5 text-sm font-semibold text-white hover:bg-emerald-700 disabled:opacity-50"
        >
          Enrichir tout ({pendingCount})
        </button>
        <button
          onClick={() => onEnrich('selection')}
          disabled={enriching || selectedCount === 0}
          className="rounded bg-emerald-600 px-3 py-1.5 text-sm font-semibold text-white hover:bg-emerald-700 disabled:opacity-50"
        >
          Enrichir la sélection ({selectedCount})
        </button>
        <button
          onClick={() => onEnrich('retry')}
          disabled={enriching || failedCount === 0}
          className="rounded bg-amber-600 px-3 py-1.5 text-sm font-semibold text-white hover:bg-amber-700 disabled:opacity-50"
        >
          Réessayer les échecs ({failedCount})
        </button>
        <div className="grow" />
        <a
          href="/api/export/csv"
          className="rounded border border-zinc-300 px-3 py-1.5 text-sm hover:bg-zinc-100"
        >
          Export CSV
        </a>
        <a
          href="/api/export/json"
          className="rounded border border-zinc-300 px-3 py-1.5 text-sm hover:bg-zinc-100"
        >
          Export JSON
        </a>
        <button
          onClick={() => fileRef.current?.click()}
          className="rounded border border-zinc-300 px-3 py-1.5 text-sm hover:bg-zinc-100"
        >
          Importer CSV/JSON
        </button>
        <input
          ref={fileRef}
          type="file"
          accept=".csv,.json"
          className="hidden"
          onChange={(e) => {
            const f = e.target.files?.[0];
            if (f) onImport(f);
            e.target.value = '';
          }}
        />
        <button
          onClick={onCopyErpPrompt}
          className="rounded border border-indigo-300 bg-indigo-50 px-3 py-1.5 text-sm font-medium text-indigo-700 hover:bg-indigo-100"
        >
          Copier le prompt d&apos;import ERP
        </button>
      </div>
    </div>
  );
}
