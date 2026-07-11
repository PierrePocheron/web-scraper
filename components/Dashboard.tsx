'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import type { RowSelectionState } from '@tanstack/react-table';
import type { Prospect, SavedQuery } from '@/lib/types';
import { buildErpPrompt } from '@/lib/erp-prompt';
import ActionBar from './ActionBar';
import ProspectTable from './ProspectTable';
import DetailDrawer from './DetailDrawer';
import ProgressPanel, { type RunProgress, type SiteProgress } from './ProgressPanel';

interface Banner {
  kind: 'info' | 'error';
  text: string;
}

export default function Dashboard() {
  const [prospects, setProspects] = useState<Prospect[]>([]);
  const [savedQueries, setSavedQueries] = useState<SavedQuery[]>([]);
  const [rowSelection, setRowSelection] = useState<RowSelectionState>({});
  const [searching, setSearching] = useState(false);
  const [enriching, setEnriching] = useState(false);
  const [banner, setBanner] = useState<Banner | null>(null);
  const [detailId, setDetailId] = useState<string | null>(null);
  const [progress, setProgress] = useState<RunProgress | null>(null);
  const eventSourceRef = useRef<EventSource | null>(null);

  const refresh = useCallback(async () => {
    const [pRes, qRes] = await Promise.all([fetch('/api/prospects'), fetch('/api/queries')]);
    if (pRes.ok) setProspects(await pRes.json());
    if (qRes.ok) setSavedQueries(await qRes.json());
  }, []);

  const attachStream = useCallback(() => {
    if (eventSourceRef.current) return;
    const es = new EventSource('/api/enrich/stream');
    eventSourceRef.current = es;
    es.onmessage = (msg) => {
      const ev = JSON.parse(msg.data);
      if (ev.type === 'run-start') {
        setEnriching(true);
        setProgress({ active: true, total: ev.total, done: 0, failed: 0, sites: {} });
      } else if (ev.type === 'site') {
        setProgress((prev) => {
          if (!prev) return prev;
          const site: SiteProgress = { step: ev.step, error: ev.error };
          return { ...prev, sites: { ...prev.sites, [ev.domain]: site } };
        });
        if (ev.step === 'ok' || ev.step === 'échec') {
          setProspects((prev) =>
            prev.map((p) =>
              p.domain === ev.domain
                ? { ...p, enrichmentStatus: ev.step === 'ok' ? 'done' : 'failed' }
                : p
            )
          );
        } else {
          setProspects((prev) =>
            prev.map((p) => (p.domain === ev.domain ? { ...p, enrichmentStatus: 'running' } : p))
          );
        }
      } else if (ev.type === 'run-progress') {
        setProgress((prev) =>
          prev ? { ...prev, done: ev.done, failed: ev.failed, total: ev.total } : prev
        );
      } else if (ev.type === 'run-end') {
        setProgress((prev) =>
          prev
            ? { ...prev, active: false, done: ev.done, failed: ev.failed, total: ev.total }
            : prev
        );
        setEnriching(false);
        es.close();
        eventSourceRef.current = null;
        refresh();
      }
    };
    es.onerror = () => {
      es.close();
      eventSourceRef.current = null;
      setEnriching(false);
    };
  }, [refresh]);

  useEffect(() => {
    refresh();
    // reprend le flux si un run est déjà actif (rechargement de page pendant un run)
    fetch('/api/enrich')
      .then((r) => (r.ok ? r.json() : null))
      .then((status) => {
        if (status?.active) attachStream();
      })
      .catch(() => {});
    return () => eventSourceRef.current?.close();
  }, [refresh, attachStream]);

  const handleSearch = async (query: string, pagesMax: number) => {
    setSearching(true);
    setBanner(null);
    try {
      const res = await fetch('/api/search', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ query, pagesMax }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? 'Erreur inconnue');
      setBanner({
        kind: 'info',
        text: `Recherche terminée : ${data.totalResults} résultats, ${data.created} nouveaux, ${data.known} déjà en base (${data.pagesFetched} page(s)).`,
      });
      await refresh();
    } catch (err) {
      setBanner({ kind: 'error', text: `Recherche échouée : ${(err as Error).message}` });
    } finally {
      setSearching(false);
    }
  };

  const startEnrich = async (body: { mode?: string; ids?: string[]; force?: boolean }) => {
    setBanner(null);
    try {
      const res = await fetch('/api/enrich', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? 'Erreur inconnue');
      if (data.queued === 0) {
        setBanner({
          kind: 'info',
          text: `Rien à enrichir${data.skippedFresh ? ` (${data.skippedFresh} fiche(s) encore fraîche(s), TTL)` : ''}.`,
        });
        return;
      }
      if (data.skippedFresh > 0) {
        setBanner({
          kind: 'info',
          text: `${data.queued} site(s) en file — ${data.skippedFresh} ignoré(s) car enrichi(s) récemment (TTL).`,
        });
      }
      attachStream();
    } catch (err) {
      setBanner({ kind: 'error', text: `Enrichissement : ${(err as Error).message}` });
    }
  };

  const handleEnrich = (mode: 'all' | 'selection' | 'retry') => {
    if (mode === 'selection') {
      startEnrich({ ids: Object.keys(rowSelection) });
    } else {
      startEnrich({ mode });
    }
  };

  const handleReenrich = (id: string) => startEnrich({ ids: [id], force: true });

  const handlePatch = async (id: string, patch: Partial<Prospect>) => {
    setProspects((prev) => prev.map((p) => (p.id === id ? { ...p, ...patch } : p)));
    const res = await fetch(`/api/prospects/${id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(patch),
    });
    if (!res.ok) {
      setBanner({ kind: 'error', text: 'La mise à jour a échoué.' });
      refresh();
    }
  };

  const handleDelete = async (id: string) => {
    const res = await fetch(`/api/prospects/${id}`, { method: 'DELETE' });
    if (res.ok) {
      setProspects((prev) => prev.filter((p) => p.id !== id));
      setRowSelection((prev) => {
        const next = { ...prev };
        delete next[id];
        return next;
      });
    }
  };

  const handleImport = async (file: File) => {
    const content = await file.text();
    const format = file.name.toLowerCase().endsWith('.json') ? 'json' : 'csv';
    const res = await fetch('/api/import', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ format, content }),
    });
    const data = await res.json();
    if (!res.ok) {
      setBanner({ kind: 'error', text: `Import échoué : ${data.error ?? '?'}` });
      return;
    }
    const errText = data.errors.length > 0 ? ` — erreurs : ${data.errors.slice(0, 3).join(' ; ')}` : '';
    setBanner({
      kind: 'info',
      text: `Import terminé : ${data.created} créé(s), ${data.updated} mis à jour, ${data.ignored} ignoré(s)${errText}`,
    });
    await refresh();
  };

  const handleCopyErpPrompt = async () => {
    const selectedIds = Object.keys(rowSelection);
    const subset =
      selectedIds.length > 0 ? prospects.filter((p) => selectedIds.includes(p.id)) : prospects;
    if (subset.length === 0) {
      setBanner({ kind: 'error', text: 'Aucun prospect à exporter.' });
      return;
    }
    await navigator.clipboard.writeText(buildErpPrompt(subset));
    setBanner({
      kind: 'info',
      text: `Prompt d'import ERP copié dans le presse-papier (${subset.length} prospect(s)).`,
    });
  };

  const detail = detailId ? prospects.find((p) => p.id === detailId) : null;
  const failedCount = prospects.filter((p) => p.enrichmentStatus === 'failed').length;
  const pendingCount = prospects.filter(
    (p) => p.enrichmentStatus === 'pending' || p.enrichmentStatus === 'failed'
  ).length;

  return (
    <div className="mx-auto max-w-screen-2xl space-y-4 p-6">
      <header className="flex items-baseline gap-3">
        <h1 className="text-2xl font-bold">Prospect Finder</h1>
        <span className="text-sm text-zinc-500">Pedro Dev — prospection refonte de sites</span>
      </header>

      <ActionBar
        savedQueries={savedQueries}
        searching={searching}
        enriching={enriching}
        selectedCount={Object.keys(rowSelection).length}
        failedCount={failedCount}
        pendingCount={pendingCount}
        onSearch={handleSearch}
        onEnrich={handleEnrich}
        onImport={handleImport}
        onCopyErpPrompt={handleCopyErpPrompt}
      />

      {banner && (
        <div
          className={`rounded-lg border p-3 text-sm ${
            banner.kind === 'error'
              ? 'border-red-200 bg-red-50 text-red-700'
              : 'border-blue-200 bg-blue-50 text-blue-800'
          }`}
        >
          {banner.text}
          <button onClick={() => setBanner(null)} className="float-right font-bold">
            ✕
          </button>
        </div>
      )}

      {progress && <ProgressPanel progress={progress} />}

      <ProspectTable
        prospects={prospects}
        rowSelection={rowSelection}
        onRowSelectionChange={setRowSelection}
        onPatch={handlePatch}
        onDelete={handleDelete}
        onReenrich={handleReenrich}
        onOpenDetail={setDetailId}
      />

      {detail && (
        <DetailDrawer
          prospect={detail}
          onClose={() => setDetailId(null)}
          onPatch={handlePatch}
          onDelete={handleDelete}
          onReenrich={handleReenrich}
        />
      )}
    </div>
  );
}
