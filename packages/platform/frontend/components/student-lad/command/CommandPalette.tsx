'use client';

import { Search, X } from 'lucide-react';

export type CommandPaletteItem = {
  label: string;
  description: string;
  action: () => void;
};

export default function CommandPalette({ items, onClose }: { items: CommandPaletteItem[]; onClose: () => void }) {
  return (
    <div className="fixed inset-0 z-[80] bg-slate-950/40 p-4 backdrop-blur-sm" role="dialog" aria-modal="true" aria-label="Command palette">
      <div className="mx-auto mt-16 max-w-2xl overflow-hidden rounded-[24px] border border-slate-200 bg-white shadow-2xl">
        <div className="flex items-center gap-3 border-b border-slate-200 px-4 py-3">
          <Search className="h-4 w-4 text-slate-500" aria-hidden="true" />
          <input
            autoFocus
            className="min-h-10 flex-1 bg-transparent text-sm text-slate-900 outline-none placeholder:text-slate-400"
            placeholder="Search screens, tasks, files, settings, or commands…"
            aria-label="Search commands"
          />
          <button type="button" onClick={onClose} className="rounded-xl p-2 text-slate-500 hover:bg-slate-100" aria-label="Close command palette">
            <X className="h-4 w-4" />
          </button>
        </div>
        <div className="max-h-[420px] overflow-y-auto p-2">
          {items.map((item) => (
            <button
              key={item.label}
              type="button"
              onClick={() => {
                item.action();
                onClose();
              }}
              className="flex w-full items-start gap-3 rounded-2xl px-3 py-3 text-left transition hover:bg-slate-50 focus-visible:outline focus-visible:outline-2 focus-visible:outline-emerald-500"
            >
              <span className="mt-1 h-2 w-2 rounded-full bg-emerald-500" aria-hidden="true" />
              <span>
                <span className="block text-sm font-semibold text-slate-950">{item.label}</span>
                <span className="mt-0.5 block text-xs leading-5 text-slate-500">{item.description}</span>
              </span>
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
