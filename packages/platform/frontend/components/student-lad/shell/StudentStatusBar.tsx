'use client';

import { Clock, Database, HardDrive, RefreshCw, ShieldCheck, Wifi } from 'lucide-react';
import type { ExecutionMode } from './StudentTopBar';

function StatusItem({ icon: Icon, label, tone = 'text-slate-600' }: { icon: typeof Wifi; label: string; tone?: string }) {
  return (
    <span className={`inline-flex items-center gap-1.5 ${tone}`}>
      <Icon className="h-3.5 w-3.5" aria-hidden="true" />
      {label}
    </span>
  );
}

export default function StudentStatusBar({
  mode,
  indexedFiles,
  connectedLocations,
}: {
  mode: ExecutionMode;
  indexedFiles: number;
  connectedLocations: number;
}) {
  const modeTone = mode === 'Offline' ? 'text-amber-700' : mode === 'Cloud' ? 'text-sky-700' : 'text-emerald-700';
  return (
    <footer className="hidden h-8 shrink-0 items-center gap-4 border-t border-slate-200 bg-white px-4 text-[11px] text-slate-600 xl:flex">
      <StatusItem icon={Wifi} label={mode} tone={modeTone} />
      <span className="h-3 w-px bg-slate-200" aria-hidden="true" />
      <StatusItem icon={HardDrive} label="Local AI Ready" tone="text-emerald-700" />
      <span className="h-3 w-px bg-slate-200" aria-hidden="true" />
      <StatusItem icon={Database} label={`${indexedFiles} references indexed`} />
      <span className="h-3 w-px bg-slate-200" aria-hidden="true" />
      <StatusItem icon={RefreshCw} label="No pending sync" />
      <span className="h-3 w-px bg-slate-200" aria-hidden="true" />
      <StatusItem icon={Clock} label="Last backup local" />
      <span className="ml-auto inline-flex items-center gap-1.5 font-medium text-slate-800">
        <ShieldCheck className="h-3.5 w-3.5 text-emerald-700" aria-hidden="true" />
        {connectedLocations ? `${connectedLocations} connected location${connectedLocations === 1 ? '' : 's'}` : 'System workspace'}
      </span>
    </footer>
  );
}
