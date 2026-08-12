'use client';

import { X } from 'lucide-react';
import type { ReactNode } from 'react';

export type SmartPanelModel = {
  title: string;
  body: string;
  items: string[];
};

export default function SmartContextPanel({
  panel,
  open,
  onClose,
  onAskKamal,
}: {
  panel: SmartPanelModel;
  open: boolean;
  onClose: () => void;
  onAskKamal: () => void;
}) {
  const content: ReactNode = (
    <div className="space-y-4">
      <section className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
        <div className="flex items-start justify-between gap-3">
          <h2 className="text-base font-semibold text-slate-950">{panel.title}</h2>
          <button type="button" onClick={onClose} className="rounded-lg p-1 text-slate-500 hover:bg-slate-100 xl:hidden" aria-label="Close smart panel">
            <X className="h-4 w-4" />
          </button>
        </div>
        <p className="mt-2 text-sm leading-6 text-slate-600">{panel.body}</p>
        <div className="mt-4 space-y-2">
          {panel.items.map((item) => (
            <p key={item} className="rounded-xl bg-slate-50 p-3 text-xs leading-5 text-slate-600">
              {item}
            </p>
          ))}
        </div>
        <button type="button" onClick={onAskKamal} className="mt-4 w-full rounded-xl bg-emerald-700 px-4 py-2.5 text-sm font-semibold text-white hover:bg-emerald-600">
          Ask Kamal
        </button>
      </section>
      <section className="rounded-2xl border border-amber-200 bg-amber-50 p-4">
        <h2 className="text-sm font-semibold text-amber-950">Privacy note</h2>
        <p className="mt-2 text-xs leading-5 text-amber-900">
          Saved information is used only when active, approved, and permission-allowed. Sensitive actions require confirmation.
        </p>
      </section>
    </div>
  );

  return (
    <>
      <aside className="hidden w-[320px] shrink-0 overflow-y-auto border-l border-slate-200 bg-white/80 p-4 xl:block">
        <div className="sticky top-4">{content}</div>
      </aside>
      {open ? (
        <div className="fixed inset-0 z-[70] xl:hidden">
          <button type="button" className="absolute inset-0 bg-slate-950/35" onClick={onClose} aria-label="Close smart panel overlay" />
          <aside className="absolute right-0 top-0 h-full w-full max-w-sm overflow-y-auto bg-slate-50 p-4 shadow-2xl" aria-label="Smart context panel">
            {content}
          </aside>
        </div>
      ) : null}
    </>
  );
}
