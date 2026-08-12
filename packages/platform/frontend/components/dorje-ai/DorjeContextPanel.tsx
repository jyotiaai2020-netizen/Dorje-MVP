type DorjeContextPanelProps = {
  value: string;
  onChange: (value: string) => void;
  onUpdate: () => void;
  onExplain: () => void;
  onSummarize: () => void;
  loading: boolean;
};

export default function DorjeContextPanel({ value, onChange, onUpdate, onExplain, onSummarize, loading }: DorjeContextPanelProps) {
  return (
    <div className="rounded-3xl border border-slate-800 bg-slate-900/70 p-4 shadow-xl shadow-slate-950/30">
      <div className="flex items-center justify-between gap-3">
        <div>
          <p className="text-sm font-semibold uppercase tracking-[0.25em] text-emerald-300">Working Context</p>
          <p className="mt-1 text-sm text-slate-400">Edit the live context seen by DorjeAI.</p>
        </div>
        <button
          type="button"
          onClick={onUpdate}
          className="rounded-full border border-emerald-400/20 bg-emerald-500/10 px-3 py-2 text-sm font-semibold text-emerald-200 transition hover:bg-emerald-500/20"
        >
          Update Context
        </button>
      </div>

      <textarea
        value={value}
        onChange={(event) => onChange(event.target.value)}
        className="mt-4 min-h-40 w-full rounded-2xl border border-slate-700 bg-slate-950/80 px-3 py-3 text-sm text-slate-100 outline-none transition focus:border-emerald-400"
        placeholder="Paste business context, notes, requirements, or a summary of uploaded files."
      />

      <div className="mt-2 text-right text-xs text-slate-500">{value.length} characters</div>

      <div className="mt-3 flex flex-wrap gap-2">
        <button
          type="button"
          onClick={onSummarize}
          disabled={loading || !value.trim()}
          className="rounded-full border border-sky-400/20 bg-sky-500/10 px-3 py-2 text-sm font-semibold text-sky-200 transition hover:bg-sky-500/20 disabled:cursor-not-allowed disabled:opacity-40"
        >
          Summarize in Chat
        </button>
        <button
          type="button"
          onClick={onExplain}
          disabled={loading || !value.trim()}
          className="rounded-full border border-violet-400/20 bg-violet-500/10 px-3 py-2 text-sm font-semibold text-violet-200 transition hover:bg-violet-500/20 disabled:cursor-not-allowed disabled:opacity-40"
        >
          Explain in Chat
        </button>
      </div>
    </div>
  );
}
