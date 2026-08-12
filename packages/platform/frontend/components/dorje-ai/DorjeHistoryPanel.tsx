type DorjeHistoryPanelProps = {
  history: Array<{ role: 'user' | 'assistant'; content: string }>;
  onSelect: (index: number) => void;
  onClear: () => void;
  onNewChat: () => void;
};

export default function DorjeHistoryPanel({ history, onSelect, onClear, onNewChat }: DorjeHistoryPanelProps) {
  return (
    <div className="rounded-3xl border border-slate-800 bg-slate-900/70 p-4 shadow-xl shadow-slate-950/30">
      <div className="flex items-center justify-between gap-3">
        <div>
          <p className="text-sm font-semibold uppercase tracking-[0.25em] text-emerald-300">History</p>
          <p className="mt-1 text-sm text-slate-400">Resume recent sessions.</p>
        </div>
        <div className="flex gap-2">
          <button type="button" onClick={onNewChat} className="rounded-full border border-slate-700 px-3 py-2 text-sm text-slate-300 transition hover:border-emerald-400/30 hover:text-emerald-200">
            New Chat
          </button>
          <button type="button" onClick={onClear} className="rounded-full border border-rose-500/20 bg-rose-500/10 px-3 py-2 text-sm text-rose-200 transition hover:bg-rose-500/20">
            Clear
          </button>
        </div>
      </div>

      <div className="mt-4 space-y-2">
        {history.length === 0 ? (
          <p className="text-sm text-slate-500">No history yet.</p>
        ) : (
          history.slice(-4).map((entry, index) => (
            <button
              key={`${entry.role}-${index}`}
              type="button"
              onClick={() => onSelect(index)}
              className="w-full rounded-2xl border border-slate-800 bg-slate-950/70 px-3 py-2 text-left text-sm text-slate-300 transition hover:border-emerald-400/20 hover:text-emerald-200"
            >
              <div className="text-[11px] uppercase tracking-[0.25em] text-slate-500">{entry.role}</div>
              <div className="mt-1 line-clamp-2">{entry.content}</div>
            </button>
          ))
        )}
      </div>
    </div>
  );
}
