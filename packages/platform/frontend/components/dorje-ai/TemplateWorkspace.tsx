'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { API_BASE_URL, authorizationHeaders } from '@/lib/api';
import { logout } from '@/lib/auth';
import { DEFAULT_EXPORT_PREFERENCES, getExportPreferences, saveExportPreferences, type ExportPreferences } from '@/lib/exportPreferences';
import DorjeSidebar from './DorjeSidebar';

const presets: Array<{ name: string; description: string; preferences: ExportPreferences }> = [
  { name: 'Executive package', description: 'PDF chat transcript and formatted Excel workbook.', preferences: { ...DEFAULT_EXPORT_PREFERENCES } },
  { name: 'Spreadsheet handoff', description: 'PDF transcript with CSV-compatible table downloads.', preferences: { ...DEFAULT_EXPORT_PREFERENCES, tableFormat: 'csv' } },
  { name: 'Plain-text archive', description: 'Portable TXT transcript with Excel workbook tables.', preferences: { ...DEFAULT_EXPORT_PREFERENCES, chatFormat: 'txt' } },
];

export default function TemplateWorkspace() {
  const router = useRouter(); const [preferences, setPreferences] = useState(DEFAULT_EXPORT_PREFERENCES); const [saved, setSaved] = useState(false);
  useEffect(() => { const timer = window.setTimeout(() => setPreferences(getExportPreferences()), 0); return () => window.clearTimeout(timer); }, []);
  function save() { saveExportPreferences(preferences); setSaved(true); window.setTimeout(() => setSaved(false), 1500); }
  async function handleLogout() { try { await fetch(`${API_BASE_URL}/api/v1/auth/logout`, { method: 'POST', credentials: 'include', headers: authorizationHeaders() }); } finally { logout(); router.replace('/login'); } }
  return (
    <div className="dorje-workspace h-dvh min-h-[560px] overflow-hidden text-slate-100 lg:p-3 2xl:p-4"><div className="dorje-surface mx-auto flex h-full min-h-0 max-w-7xl flex-col overflow-hidden border-slate-800 bg-slate-950/70 lg:flex-row lg:rounded-2xl lg:border"><DorjeSidebar active="templates" onNewChat={() => router.push('/dorje-ai')} onLogout={() => void handleLogout()} /><main className="dorje-content-panel min-h-0 flex-1 overflow-y-auto p-4 sm:p-6 lg:p-8"><div className="flex flex-wrap items-center justify-between gap-3"><div><p className="text-xs font-semibold uppercase tracking-[0.25em] text-emerald-300">Templates</p><h1 className="mt-1 text-2xl font-semibold">Download formats</h1><p className="mt-2 text-sm text-slate-400">Choose how DorjeAI exports chat transcripts and structured tables.</p></div><button type="button" onClick={() => router.push('/dorje-ai')} className="rounded-xl border border-emerald-400/30 px-3 py-2 text-sm text-emerald-200">← Back to chat</button></div>
      <div className="mt-6 grid gap-3 md:grid-cols-3">{presets.map((preset) => <button key={preset.name} type="button" onClick={() => setPreferences(preset.preferences)} className="rounded-2xl border border-slate-800 bg-slate-900 p-4 text-left hover:border-emerald-400/30"><strong>{preset.name}</strong><p className="mt-2 text-xs leading-5 text-slate-400">{preset.description}</p></button>)}</div>
      <div className="mt-6 grid gap-5 rounded-2xl border border-slate-800 bg-slate-900/70 p-5 sm:grid-cols-2"><label className="text-sm">Chat download format<select className="field mt-2" value={preferences.chatFormat} onChange={(event) => setPreferences({ ...preferences, chatFormat: event.target.value as ExportPreferences['chatFormat'] })}><option value="pdf">PDF document</option><option value="txt">Plain text</option></select></label><label className="text-sm">Table download format<select className="field mt-2" value={preferences.tableFormat} onChange={(event) => setPreferences({ ...preferences, tableFormat: event.target.value as ExportPreferences['tableFormat'] })}><option value="xlsx">Excel workbook (.xlsx)</option><option value="csv">CSV spreadsheet</option></select></label><label className="text-sm">Chat filename<input className="field mt-2" value={preferences.chatFilename} onChange={(event) => setPreferences({ ...preferences, chatFilename: event.target.value })} /></label><label className="text-sm">Table filename<input className="field mt-2" value={preferences.tableFilename} onChange={(event) => setPreferences({ ...preferences, tableFilename: event.target.value })} /></label><div className="flex gap-2 sm:col-span-2"><button type="button" onClick={save} className="action-primary">{saved ? 'Saved ✓' : 'Save template'}</button><button type="button" onClick={() => setPreferences(DEFAULT_EXPORT_PREFERENCES)} className="action-secondary">Reset defaults</button></div></div>
    </main></div></div>
  );
}
