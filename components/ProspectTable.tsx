'use client';

import { useMemo, useState } from 'react';
import {
  createColumnHelper,
  flexRender,
  getCoreRowModel,
  getFilteredRowModel,
  getPaginationRowModel,
  getSortedRowModel,
  useReactTable,
  type Column,
  type ColumnFiltersState,
  type RowSelectionState,
  type SortingState,
} from '@tanstack/react-table';
import {
  OUTREACH_LABELS,
  OUTREACH_STATUSES,
  SITE_TYPES,
  type OutreachStatus,
  type Prospect,
} from '@/lib/types';
import { EnrichmentBadge, NewBadge } from './badges';

interface Props {
  prospects: Prospect[];
  rowSelection: RowSelectionState;
  onRowSelectionChange: (updater: React.SetStateAction<RowSelectionState>) => void;
  onPatch: (id: string, patch: Partial<Prospect>) => void;
  onDelete: (id: string) => void;
  onReenrich: (id: string) => void;
  onOpenDetail: (id: string) => void;
}

const columnHelper = createColumnHelper<Prospect>();

function TextFilter({ column }: { column: Column<Prospect, unknown> }) {
  return (
    <input
      type="text"
      value={(column.getFilterValue() as string) ?? ''}
      onChange={(e) => column.setFilterValue(e.target.value || undefined)}
      placeholder="Filtrer…"
      className="w-full rounded border border-zinc-200 px-1 py-0.5 text-xs font-normal"
      onClick={(e) => e.stopPropagation()}
    />
  );
}

function SelectFilter({
  column,
  options,
  labels,
}: {
  column: Column<Prospect, unknown>;
  options: readonly string[];
  labels?: Record<string, string>;
}) {
  return (
    <select
      value={(column.getFilterValue() as string) ?? ''}
      onChange={(e) => column.setFilterValue(e.target.value || undefined)}
      className="w-full rounded border border-zinc-200 px-1 py-0.5 text-xs font-normal"
      onClick={(e) => e.stopPropagation()}
    >
      <option value="">Tous</option>
      {options.map((o) => (
        <option key={o} value={o}>
          {labels?.[o] ?? o}
        </option>
      ))}
    </select>
  );
}

export default function ProspectTable({
  prospects,
  rowSelection,
  onRowSelectionChange,
  onPatch,
  onDelete,
  onReenrich,
  onOpenDetail,
}: Props) {
  const [sorting, setSorting] = useState<SortingState>([]);
  const [columnFilters, setColumnFilters] = useState<ColumnFiltersState>([]);
  const [globalFilter, setGlobalFilter] = useState('');

  const columns = useMemo(
    () => [
      columnHelper.display({
        id: 'num',
        header: '#',
        cell: ({ row, table }) => {
          const pageRows = table.getRowModel().rows;
          const idx = pageRows.findIndex((r) => r.id === row.id);
          const { pageIndex, pageSize } = table.getState().pagination;
          return (
            <span className="tabular-nums text-zinc-400">{pageIndex * pageSize + idx + 1}</span>
          );
        },
        size: 40,
      }),
      columnHelper.display({
        id: 'select',
        header: ({ table }) => (
          <input
            type="checkbox"
            checked={table.getIsAllRowsSelected()}
            onChange={table.getToggleAllRowsSelectedHandler()}
          />
        ),
        cell: ({ row }) => (
          <input
            type="checkbox"
            checked={row.getIsSelected()}
            onChange={row.getToggleSelectedHandler()}
          />
        ),
        size: 32,
      }),
      columnHelper.accessor('domain', {
        header: 'Domaine',
        cell: (info) => (
          <div className="flex items-center gap-1.5">
            <a
              href={info.row.original.url}
              target="_blank"
              rel="noopener noreferrer"
              className="font-medium text-blue-700 hover:underline"
            >
              {info.getValue()}
            </a>
            {info.row.original.outreachStatus === 'nouveau' && <NewBadge />}
          </div>
        ),
        meta: { filter: 'text' },
      }),
      columnHelper.accessor('businessName', {
        header: 'Entreprise',
        cell: (info) => info.getValue() ?? '—',
        meta: { filter: 'text' },
      }),
      columnHelper.accessor('businessType', {
        header: 'Activité',
        cell: (info) => info.getValue() ?? '—',
        meta: { filter: 'text' },
      }),
      columnHelper.accessor((p) => p.emails[0] ?? '', {
        id: 'email',
        header: 'Email',
        cell: (info) =>
          info.getValue() ? (
            <a href={`mailto:${info.getValue()}`} className="text-blue-700 hover:underline">
              {info.getValue()}
            </a>
          ) : (
            '—'
          ),
        meta: { filter: 'text' },
      }),
      columnHelper.accessor((p) => p.phones[0] ?? '', {
        id: 'phone',
        header: 'Téléphone',
        cell: (info) => info.getValue() || '—',
      }),
      columnHelper.accessor('siteType', {
        header: 'Type',
        cell: (info) => info.getValue(),
        filterFn: 'equalsString',
        meta: { filter: 'select', options: SITE_TYPES },
      }),
      columnHelper.accessor('cms', {
        header: 'CMS',
        cell: (info) => info.getValue() ?? '—',
        meta: { filter: 'text' },
      }),
      columnHelper.accessor('domainCreatedAt', {
        header: 'Domaine créé',
        cell: (info) => {
          const v = info.getValue();
          return v ? new Date(v).getFullYear() : '—';
        },
      }),
      columnHelper.accessor('pageCountEstimate', {
        header: 'Pages',
        cell: (info) => info.getValue() ?? '—',
      }),
      columnHelper.accessor('imageCountEstimate', {
        header: 'Images',
        cell: (info) => info.getValue() ?? '—',
      }),
      columnHelper.accessor('performanceScore', {
        header: 'Perf',
        cell: (info) => {
          const v = info.getValue();
          if (v === null) return '—';
          const cls = v < 50 ? 'text-red-600' : v < 90 ? 'text-amber-600' : 'text-emerald-600';
          return <span className={`font-semibold ${cls}`}>{v}</span>;
        },
      }),
      columnHelper.accessor('outreachStatus', {
        header: 'Statut commercial',
        cell: (info) => (
          <select
            value={info.getValue()}
            onChange={(e) =>
              onPatch(info.row.original.id, {
                outreachStatus: e.target.value as OutreachStatus,
              })
            }
            className="rounded border border-zinc-200 bg-white px-1 py-0.5 text-xs"
          >
            {OUTREACH_STATUSES.map((s) => (
              <option key={s} value={s}>
                {OUTREACH_LABELS[s]}
              </option>
            ))}
          </select>
        ),
        filterFn: 'equalsString',
        meta: { filter: 'select', options: OUTREACH_STATUSES, labels: OUTREACH_LABELS },
      }),
      columnHelper.accessor('enrichmentStatus', {
        header: 'Enrichissement',
        cell: (info) => (
          <span title={info.row.original.enrichmentError ?? undefined}>
            <EnrichmentBadge status={info.getValue()} />
          </span>
        ),
        filterFn: 'equalsString',
        meta: { filter: 'select', options: ['pending', 'running', 'done', 'failed'] },
      }),
      columnHelper.display({
        id: 'actions',
        header: '',
        cell: ({ row }) => (
          <div className="flex gap-1">
            <button
              onClick={() => onOpenDetail(row.original.id)}
              title="Détail / éditer"
              className="rounded px-1.5 py-0.5 text-sm hover:bg-zinc-200"
            >
              ✎
            </button>
            <button
              onClick={() => onReenrich(row.original.id)}
              title="Ré-enrichir (forcer)"
              className="rounded px-1.5 py-0.5 text-sm hover:bg-zinc-200"
            >
              ↻
            </button>
            <button
              onClick={() => {
                if (confirm(`Supprimer ${row.original.domain} ?`)) onDelete(row.original.id);
              }}
              title="Supprimer"
              className="rounded px-1.5 py-0.5 text-sm text-red-600 hover:bg-red-100"
            >
              ✕
            </button>
          </div>
        ),
      }),
    ],
    [onPatch, onDelete, onReenrich, onOpenDetail]
  );

  const table = useReactTable({
    data: prospects,
    columns,
    state: { sorting, columnFilters, globalFilter, rowSelection },
    onSortingChange: setSorting,
    onColumnFiltersChange: setColumnFilters,
    onGlobalFilterChange: setGlobalFilter,
    onRowSelectionChange,
    getRowId: (row) => row.id,
    globalFilterFn: 'includesString',
    getCoreRowModel: getCoreRowModel(),
    getSortedRowModel: getSortedRowModel(),
    getFilteredRowModel: getFilteredRowModel(),
    getPaginationRowModel: getPaginationRowModel(),
    initialState: { pagination: { pageSize: 25 } },
  });

  return (
    <div className="rounded-lg border border-zinc-200 bg-white shadow-sm">
      <div className="flex items-center justify-between gap-3 border-b border-zinc-200 p-3">
        <input
          type="text"
          value={globalFilter}
          onChange={(e) => setGlobalFilter(e.target.value)}
          placeholder="Recherche plein texte…"
          className="w-72 rounded border border-zinc-300 px-2 py-1 text-sm"
        />
        <div className="text-sm text-zinc-500">
          {table.getFilteredRowModel().rows.length} prospect(s)
          {Object.keys(rowSelection).length > 0 && ` — ${Object.keys(rowSelection).length} sélectionné(s)`}
        </div>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="bg-zinc-50 text-left text-xs uppercase text-zinc-500">
            {table.getHeaderGroups().map((hg) => (
              <tr key={hg.id}>
                {hg.headers.map((header) => (
                  <th key={header.id} className="px-2 py-2 align-top">
                    {header.isPlaceholder ? null : (
                      <div>
                        <div
                          className={
                            header.column.getCanSort() ? 'cursor-pointer select-none' : ''
                          }
                          onClick={header.column.getToggleSortingHandler()}
                        >
                          {flexRender(header.column.columnDef.header, header.getContext())}
                          {{ asc: ' ↑', desc: ' ↓' }[header.column.getIsSorted() as string] ?? ''}
                        </div>
                        {(() => {
                          const meta = header.column.columnDef.meta as
                            | {
                                filter?: 'text' | 'select';
                                options?: readonly string[];
                                labels?: Record<string, string>;
                              }
                            | undefined;
                          if (meta?.filter === 'text') return <TextFilter column={header.column} />;
                          if (meta?.filter === 'select' && meta.options)
                            return (
                              <SelectFilter
                                column={header.column}
                                options={meta.options}
                                labels={meta.labels}
                              />
                            );
                          return null;
                        })()}
                      </div>
                    )}
                  </th>
                ))}
              </tr>
            ))}
          </thead>
          <tbody>
            {table.getRowModel().rows.map((row) => (
              <tr
                key={row.id}
                className={`border-t border-zinc-100 hover:bg-zinc-50 ${
                  row.original.enrichmentStatus === 'failed' ? 'bg-red-50' : ''
                }`}
              >
                {row.getVisibleCells().map((cell) => (
                  <td key={cell.id} className="px-2 py-1.5">
                    {flexRender(cell.column.columnDef.cell, cell.getContext())}
                  </td>
                ))}
              </tr>
            ))}
            {table.getRowModel().rows.length === 0 && (
              <tr>
                <td colSpan={columns.length} className="px-3 py-8 text-center text-zinc-400">
                  Aucun prospect. Lance une recherche pour commencer.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
      <div className="flex items-center justify-between border-t border-zinc-200 p-3 text-sm">
        <div className="flex items-center gap-2">
          <button
            onClick={() => table.previousPage()}
            disabled={!table.getCanPreviousPage()}
            className="rounded border border-zinc-300 px-2 py-1 disabled:opacity-40"
          >
            ← Précédent
          </button>
          <button
            onClick={() => table.nextPage()}
            disabled={!table.getCanNextPage()}
            className="rounded border border-zinc-300 px-2 py-1 disabled:opacity-40"
          >
            Suivant →
          </button>
        </div>
        <div className="text-zinc-500">
          Page {table.getState().pagination.pageIndex + 1} / {Math.max(1, table.getPageCount())}
        </div>
        <select
          value={table.getState().pagination.pageSize}
          onChange={(e) => table.setPageSize(Number(e.target.value))}
          className="rounded border border-zinc-300 px-2 py-1"
        >
          {[10, 25, 50, 100].map((n) => (
            <option key={n} value={n}>
              {n} / page
            </option>
          ))}
        </select>
      </div>
    </div>
  );
}
