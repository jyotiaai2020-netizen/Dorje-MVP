'use client';

import { CheckCircle2, Info, X } from 'lucide-react';

export type CedaSuggestion = {
  id: string;
  label: string;
  editable_instruction: string;
  action_type: string;
  reason: string;
  evidence_refs: string[];
  confidence: number;
  requires_confirmation: boolean;
  required_connector?: string | null;
  status: string;
};

type Props = {
  greeting?: string;
  suggestions: CedaSuggestion[];
  loading?: boolean;
  selectedId?: string;
  compact?: boolean;
  onCopyToComposer: (suggestion: CedaSuggestion) => void;
  onDismiss: (suggestion: CedaSuggestion) => void;
};

export default function CedaSuggestionButtons({ greeting, suggestions, loading = false, selectedId, compact = false, onCopyToComposer, onDismiss }: Props) {
  if (loading) {
    return <div className={`grid gap-2 ${compact ? '' : 'sm:grid-cols-3'}`} aria-label="CEDA suggestions loading">{[0, 1, 2].map((item) => <div key={item} className="h-16 animate-pulse rounded-2xl border border-emerald-400/10 bg-emerald-500/5" />)}</div>;
  }
  if (!suggestions.length) return null;
  return (
    <section className={`rounded-2xl border ${compact ? 'border-sky-100 bg-white p-2' : 'border-emerald-400/15 bg-slate-950/80 p-3'} shadow-sm`} aria-label="CEDA next best actions">
      {greeting ? <p className={`${compact ? 'text-[11px] text-slate-600' : 'text-xs text-emerald-100/80'} mb-2`}>{greeting}</p> : null}
      <div className={`grid gap-2 ${compact ? '' : 'sm:grid-cols-3'}`}>
        {suggestions.slice(0, 3).map((suggestion) => {
          const selected = selectedId === suggestion.id;
          return (
            <div key={suggestion.id} className={`group rounded-2xl border p-2.5 transition ${selected ? 'border-emerald-300 bg-emerald-500/15' : compact ? 'border-slate-200 bg-slate-50 hover:border-sky-200' : 'border-slate-800 bg-slate-900/70 hover:border-emerald-400/30'}`}>
              <button type="button" onClick={() => onCopyToComposer(suggestion)} className="block w-full text-left" aria-label={`Copy suggestion ${suggestion.label} to composer`}>
                <span className={`flex items-center gap-1.5 text-xs font-semibold ${compact ? 'text-slate-800' : 'text-white'}`}><CheckCircle2 size={13} className={selected ? 'text-emerald-300' : 'text-slate-400'} />{suggestion.label}</span>
                <span className={`mt-1 block text-[11px] leading-4 ${compact ? 'text-slate-500' : 'text-slate-400'}`}>Copy to composer. Edit before sending.</span>
                <span className={`mt-1 block text-[10px] ${suggestion.requires_confirmation ? 'text-amber-500' : compact ? 'text-emerald-700' : 'text-emerald-300'}`}>{suggestion.requires_confirmation ? 'Confirmation required' : 'Draft only'}</span>
              </button>
              <details className={`mt-2 rounded-xl px-2 py-1 ${compact ? 'bg-white text-slate-500' : 'bg-slate-950/40 text-slate-400'}`}>
                <summary className="flex cursor-pointer list-none items-center gap-1 text-[10px] font-semibold uppercase tracking-[0.16em]"><Info size={11} /> Why</summary>
                <p className="mt-1 text-[11px] leading-4">{suggestion.reason}</p>
                <p className="mt-1 text-[10px]">Confidence {Math.round(suggestion.confidence * 100)}% · Evidence {suggestion.evidence_refs.slice(0, 2).join(', ') || 'current context'}</p>
              </details>
              <div className="mt-2 flex justify-end gap-1 opacity-80 transition group-hover:opacity-100">
                <button type="button" onClick={() => onDismiss(suggestion)} className="rounded-full p-1 text-slate-400 hover:bg-rose-500/10 hover:text-rose-400" title="Dismiss" aria-label={`Dismiss ${suggestion.label}`}><X size={12} /></button>
              </div>
            </div>
          );
        })}
      </div>
    </section>
  );
}
