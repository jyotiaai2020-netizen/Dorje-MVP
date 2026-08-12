'use client';

import { useMemo, useState } from 'react';
import { API_BASE_URL, authenticatedFetch, authorizationHeaders } from '@/lib/api';
import { getExportPreferences } from '@/lib/exportPreferences';
import StatisticsChart from './StatisticsChart';

export type ChartAssetData = { chart_id: string; title: string; chart_type: string; dataset_id: string; source_label: string; source_message_id?: string; x_axis_field: string; y_axis_fields: string[]; grouping_field?: string; aggregation_method?: string; statistical_method?: string; generated_at: string; model_used: string; library_used: string; image_data_url: string; png_url: string; svg_url: string; csv_url: string; metadata_url: string; interpretation?: string; validation_status?: 'passed' | 'failed'; source_row_count?: number; source_columns?: string[]; exact_source_rows?: string[][]; source_data_hash?: string };
export type StructuredTableData = { title: string; columns: string[]; rows: string[][]; explanation?: string; model_used?: string; generated_at?: string; dataset_id?: string; source_columns?: string[]; aggregation_method?: string; filters_applied?: string[]; source_message_id?: string; source_file_id?: string; validation_status?: string; locked?: boolean; chart_asset?: ChartAssetData };
type Props = { table: StructuredTableData; initialShowChart?: boolean; onUseInPrompt?: (content: string) => void; onUseInEmail?: (content: string) => void; onUseInSocial?: (content: string) => void };

function escapeHtml(value: string) { return value.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#039;'); }
function csvCell(value: string) { return `"${String(value).replace(/"/g, '""')}"`; }
export function tableAsTsv(table: StructuredTableData) { return [table.columns, ...table.rows].map((row) => row.map((cell) => String(cell).replace(/\t/g, ' ').replace(/\r?\n/g, ' ')).join('\t')).join('\n'); }
export function tableAsCsv(table: StructuredTableData) { return [table.columns, ...table.rows].map((row) => row.map((cell) => csvCell(cell || '')).join(',')).join('\r\n'); }
export function tableAsMarkdown(table: StructuredTableData) { const header = `| ${table.columns.join(' | ')} |`; const separator = `| ${table.columns.map(() => '---').join(' | ')} |`; return [header, separator, ...table.rows.map((row) => `| ${table.columns.map((_, index) => String(row[index] || '').replace(/\|/g, '\\|')).join(' | ')} |`)].join('\n'); }
export function tableAsHtml(table: StructuredTableData) { const header = `<tr>${table.columns.map((cell) => `<th style="border:1px solid #64748b;padding:8px;font-weight:700;background:#059669;color:#fff;text-align:left">${escapeHtml(String(cell)).replace(/\r?\n/g, '<br>')}</th>`).join('')}</tr>`; const body = table.rows.map((row) => `<tr>${table.columns.map((_, index) => `<td style="border:1px solid #94a3b8;padding:8px;vertical-align:top">${escapeHtml(String(row[index] || '')).replace(/\r?\n/g, '<br>')}</td>`).join('')}</tr>`).join(''); return `<table style="border-collapse:collapse;font-family:Arial,sans-serif;font-size:12px"><caption style="font-weight:700;text-align:left;padding:0 0 8px">${escapeHtml(table.title)}</caption><thead>${header}</thead><tbody>${body}</tbody></table>`; }

export default function StructuredTableView({ table, initialShowChart = false, onUseInPrompt, onUseInEmail, onUseInSocial }: Props) {
  const [workingTable, setWorkingTable] = useState(table); const [copied, setCopied] = useState(''); const [editing, setEditing] = useState(false); const [showChart, setShowChart] = useState(initialShowChart);
  const markdown = useMemo(() => tableAsMarkdown(workingTable), [workingTable]);
  function markCopied(label: string) { setCopied(label); window.setTimeout(() => setCopied(''), 1600); }
  async function copyRich() {
    const html = tableAsHtml(workingTable); const tsv = tableAsTsv(workingTable);
    try { await navigator.clipboard.write([new ClipboardItem({ 'text/html': new Blob([html], { type: 'text/html' }), 'text/plain': new Blob([tsv], { type: 'text/plain' }) })]); }
    catch { await navigator.clipboard.writeText(tsv); }
    markCopied('Rich table copied');
  }
  async function copyFormat(format: 'markdown' | 'csv' | 'tsv' | 'html') { const values = { markdown, csv: tableAsCsv(workingTable), tsv: tableAsTsv(workingTable), html: tableAsHtml(workingTable) }; await navigator.clipboard.writeText(values[format]); markCopied(`${format.toUpperCase()} copied`); }
  function safeFilename() { return (getExportPreferences().tableFilename || workingTable.title || 'dorje-ai-table').replace(/[^a-z0-9-_]/gi, '-'); }
  function downloadText(content: string, extension: string, type: string) { const url = URL.createObjectURL(new Blob([content], { type })); const anchor = document.createElement('a'); anchor.href = url; anchor.download = `${safeFilename()}.${extension}`; anchor.click(); window.setTimeout(() => URL.revokeObjectURL(url), 1000); }
  async function downloadServer(format: 'xlsx' | 'pdf' | 'png') { const response = await authenticatedFetch(`${API_BASE_URL}/api/v1/dorje-ai/table/${format}`, { method: 'POST', headers: { 'Content-Type': 'application/json', ...authorizationHeaders() }, body: JSON.stringify(workingTable) }); if (!response.ok) return; const url = URL.createObjectURL(await response.blob()); const anchor = document.createElement('a'); anchor.href = url; anchor.download = `${safeFilename()}.${format}`; anchor.click(); window.setTimeout(() => URL.revokeObjectURL(url), 1000); }
  function updateCell(rowIndex: number, columnIndex: number, value: string) { setWorkingTable((current) => ({ ...current, rows: current.rows.map((row, index) => index === rowIndex ? current.columns.map((_, cellIndex) => cellIndex === columnIndex ? value : row[cellIndex] || '') : row) })); }
  const actionClass = 'flex h-8 w-8 items-center justify-center rounded-lg border border-slate-600 text-sm transition hover:-translate-y-0.5 hover:bg-slate-800';
  return (
    <div className="mt-3 overflow-hidden rounded-xl border border-emerald-400/20 bg-slate-950/70">
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-700 px-3 py-2"><div><strong className="text-xs text-emerald-200">{workingTable.title}</strong>{copied ? <span className="ml-2 text-[10px] text-emerald-300">✓ {copied}</span> : null}</div><div className="flex flex-wrap gap-1.5">
        <button type="button" title="Copy rich table" aria-label="Copy rich table" onClick={() => void copyRich()} className={actionClass}>📋</button>
        <button type="button" title="Export XLSX" aria-label="Export XLSX" onClick={() => void downloadServer('xlsx')} className={actionClass}>📊</button>
        <button type="button" title="Export PDF" aria-label="Export PDF" onClick={() => void downloadServer('pdf')} className={actionClass}>📄</button>
        <button type="button" title="Export PNG" aria-label="Export PNG" onClick={() => void downloadServer('png')} className={actionClass}>🖼️</button>
        <button type="button" title="Edit table" aria-label="Edit table" onClick={() => setEditing((value) => !value)} className={actionClass}>✏️</button>
        <button type="button" title="Create chart" aria-label="Create chart" onClick={() => setShowChart((value) => !value)} className={actionClass}>📈</button>
        <button type="button" title="Use in prompt" aria-label="Use in prompt" onClick={() => onUseInPrompt?.(markdown)} className={actionClass}>🔗</button>
        <button type="button" title="Use in email" aria-label="Use in email" onClick={() => onUseInEmail?.(markdown)} className={actionClass}>✉️</button>
        <button type="button" title="Use in social post" aria-label="Use in social post" onClick={() => onUseInSocial?.(markdown)} className={actionClass}>📣</button>
      </div></div>
      <div className="border-b border-slate-800 bg-slate-900/50 px-3 py-2"><details><summary className="cursor-pointer text-[11px] text-slate-400">Copy or download another format</summary><div className="mt-2 flex flex-wrap gap-2">{(['markdown', 'csv', 'tsv', 'html'] as const).map((format) => <button key={format} type="button" onClick={() => void copyFormat(format)} className="rounded-lg border border-slate-700 px-2 py-1 text-[11px] text-slate-300">Copy {format.toUpperCase()}</button>)}<button type="button" onClick={() => downloadText(`\uFEFF${tableAsCsv(workingTable)}`, 'csv', 'text/csv;charset=utf-8')} className="rounded-lg border border-slate-700 px-2 py-1 text-[11px] text-slate-300">Download CSV</button></div></details></div>
      <div className="overflow-x-auto"><table className="min-w-full border-collapse text-left text-xs"><caption className="sr-only">{workingTable.title}</caption><thead><tr>{workingTable.columns.map((column) => <th key={column} scope="col" className="border-b border-r border-slate-700 bg-emerald-500/10 px-3 py-2 font-semibold text-emerald-100">{column}</th>)}</tr></thead><tbody>{workingTable.rows.map((row, rowIndex) => <tr key={rowIndex} className="odd:bg-slate-900/50">{workingTable.columns.map((_, columnIndex) => <td key={columnIndex} className="border-b border-r border-slate-800 p-0 align-top">{editing ? <input value={row[columnIndex] || ''} onChange={(event) => updateCell(rowIndex, columnIndex, event.target.value)} className="min-w-32 bg-transparent px-3 py-2 outline-none focus:bg-emerald-500/10" /> : <span className="block min-w-24 whitespace-pre-wrap px-3 py-2">{row[columnIndex] || ''}</span>}</td>)}</tr>)}</tbody></table></div>
      {workingTable.explanation ? <p className="border-t border-slate-800 p-3 text-xs leading-5 text-slate-400">{workingTable.explanation}</p> : null}
      {showChart ? <StatisticsChart table={workingTable} onUseInPrompt={onUseInPrompt} onUseInEmail={onUseInEmail} onUseInSocial={onUseInSocial} /> : null}
    </div>
  );
}
