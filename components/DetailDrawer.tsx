'use client';

import { useEffect, useState } from 'react';
import { OUTREACH_LABELS, OUTREACH_STATUSES, type OutreachStatus, type Prospect } from '@/lib/types';
import { ConfidenceBadge, EnrichmentBadge } from './badges';

interface Props {
  prospect: Prospect;
  onClose: () => void;
  onPatch: (id: string, patch: Partial<Prospect>) => void;
  onDelete: (id: string) => void;
  onReenrich: (id: string) => void;
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <div className="text-xs font-medium uppercase text-zinc-400">{label}</div>
      <div className="text-sm">{children ?? '—'}</div>
    </div>
  );
}

export default function DetailDrawer({ prospect, onClose, onPatch, onDelete, onReenrich }: Props) {
  const [notes, setNotes] = useState(prospect.notes ?? '');
  useEffect(() => setNotes(prospect.notes ?? ''), [prospect.id, prospect.notes]);

  const sources = Object.entries(prospect.fieldSources);

  return (
    <>
      <div className="fixed inset-0 z-40 bg-black/30" onClick={onClose} />
      <aside className="fixed inset-y-0 right-0 z-50 w-full max-w-xl overflow-y-auto bg-white p-6 shadow-2xl">
        <div className="mb-4 flex items-start justify-between gap-2">
          <div>
            <h2 className="text-lg font-bold">{prospect.businessName ?? prospect.domain}</h2>
            <a
              href={prospect.url}
              target="_blank"
              rel="noopener noreferrer"
              className="text-sm text-blue-700 hover:underline"
            >
              {prospect.url}
            </a>
          </div>
          <button onClick={onClose} className="rounded px-2 py-1 text-zinc-500 hover:bg-zinc-100">
            ✕
          </button>
        </div>

        <div className="mb-4 flex flex-wrap items-center gap-2">
          <EnrichmentBadge status={prospect.enrichmentStatus} />
          <select
            value={prospect.outreachStatus}
            onChange={(e) =>
              onPatch(prospect.id, { outreachStatus: e.target.value as OutreachStatus })
            }
            className="rounded border border-zinc-300 px-2 py-1 text-sm"
          >
            {OUTREACH_STATUSES.map((s) => (
              <option key={s} value={s}>
                {OUTREACH_LABELS[s]}
              </option>
            ))}
          </select>
          <div className="grow" />
          <button
            onClick={() => onReenrich(prospect.id)}
            className="rounded border border-zinc-300 px-3 py-1 text-sm hover:bg-zinc-100"
          >
            ↻ Ré-enrichir (forcer)
          </button>
          <button
            onClick={() => {
              if (confirm(`Supprimer ${prospect.domain} ?`)) {
                onDelete(prospect.id);
                onClose();
              }
            }}
            className="rounded border border-red-300 px-3 py-1 text-sm text-red-600 hover:bg-red-50"
          >
            Supprimer
          </button>
        </div>

        {prospect.enrichmentError && (
          <div className="mb-4 rounded border border-red-200 bg-red-50 p-3 text-sm text-red-700">
            Erreur d&apos;enrichissement : {prospect.enrichmentError}
          </div>
        )}

        <div className="mb-6 grid grid-cols-2 gap-4">
          <Field label="Domaine">{prospect.domain}</Field>
          <Field label="Activité">{prospect.businessType}</Field>
          <Field label="Secteur">{prospect.category}</Field>
          <Field label="Description">{prospect.businessDescription}</Field>
          <Field label="Contact">
            {[prospect.contactFirstName, prospect.contactLastName].filter(Boolean).join(' ') || null}
          </Field>
          <Field label="Responsable de publication">{prospect.publicationManager}</Field>
          <Field label="Emails">
            {prospect.emails.length > 0
              ? prospect.emails.map((e) => (
                  <div key={e}>
                    <a href={`mailto:${e}`} className="text-blue-700 hover:underline">
                      {e}
                    </a>
                  </div>
                ))
              : null}
          </Field>
          <Field label="Téléphones">
            {prospect.phones.length > 0 ? prospect.phones.join(' / ') : null}
          </Field>
          <Field label="Adresse">{prospect.address}</Field>
          <Field label="SIRET">{prospect.siret}</Field>
          <Field label="Mentions légales">
            {prospect.legalNoticeUrl ? (
              <a
                href={prospect.legalNoticeUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="text-blue-700 hover:underline"
              >
                Ouvrir la page
              </a>
            ) : null}
          </Field>
          <Field label="Type de site">{prospect.siteType}</Field>
          <Field label="CMS">{prospect.cms}</Field>
          <Field label="Domaine créé le">
            {prospect.domainCreatedAt
              ? new Date(prospect.domainCreatedAt).toLocaleDateString('fr-FR')
              : null}
          </Field>
          <Field label="Pages (estim.)">{prospect.pageCountEstimate}</Field>
          <Field label="Images (estim.)">{prospect.imageCountEstimate}</Field>
          <Field label="Sitemap">{prospect.hasSitemap ? 'oui' : 'non'}</Field>
          <Field label="HTTPS">{prospect.isHttps ? 'oui' : 'non'}</Field>
          <Field label="Score perf">{prospect.performanceScore}</Field>
          <Field label="Découvert le">{new Date(prospect.discoveredAt).toLocaleString('fr-FR')}</Field>
          <Field label="Dernier enrichissement">
            {prospect.lastEnrichedAt ? new Date(prospect.lastEnrichedAt).toLocaleString('fr-FR') : null}
          </Field>
          <Field label="Requête source">{prospect.sourceQuery}</Field>
        </div>

        <div className="mb-6">
          <div className="mb-1 text-xs font-medium uppercase text-zinc-400">Notes</div>
          <textarea
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            onBlur={() => {
              const v = notes.trim() || null;
              if (v !== prospect.notes) onPatch(prospect.id, { notes: v });
            }}
            rows={4}
            placeholder="Notes de prospection…"
            className="w-full rounded border border-zinc-300 px-3 py-2 text-sm"
          />
        </div>

        <div>
          <div className="mb-2 text-xs font-medium uppercase text-zinc-400">
            Sources d&apos;extraction ({sources.length})
          </div>
          {sources.length === 0 ? (
            <div className="text-sm text-zinc-400">Aucune donnée extraite pour l&apos;instant.</div>
          ) : (
            <table className="w-full text-sm">
              <thead className="text-left text-xs uppercase text-zinc-400">
                <tr>
                  <th className="py-1">Champ</th>
                  <th className="py-1">Source</th>
                  <th className="py-1">Confiance</th>
                </tr>
              </thead>
              <tbody>
                {sources.map(([field, fs]) => (
                  <tr key={field} className="border-t border-zinc-100">
                    <td className="py-1 font-medium">{field}</td>
                    <td className="py-1 font-mono text-xs">{fs.source}</td>
                    <td className="py-1">
                      <ConfidenceBadge confidence={fs.confidence} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </aside>
    </>
  );
}
