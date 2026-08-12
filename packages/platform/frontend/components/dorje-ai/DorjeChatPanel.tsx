import DorjeMessage from './DorjeMessage';

type Message = {
  role: 'user' | 'assistant';
  content: string;
};

type DorjeChatPanelProps = {
  messages: Message[];
  input: string;
  onInputChange: (value: string) => void;
  onSubmit: (event: React.FormEvent<HTMLFormElement>) => void;
  loading: boolean;
  error: string;
  onSummarizeInput: () => void;
  onExplainInput: () => void;
};

export default function DorjeChatPanel({ messages, input, onInputChange, onSubmit, loading, error, onSummarizeInput, onExplainInput }: DorjeChatPanelProps) {
  return (
    <div className="flex h-full flex-col rounded-[2rem] border border-slate-800 bg-slate-900/70 p-4 shadow-xl shadow-slate-950/30">
      <div className="mb-4 flex items-center justify-between gap-3 border-b border-slate-800 pb-4">
        <div>
          <p className="text-sm font-semibold uppercase tracking-[0.3em] text-emerald-300">DorjeAI</p>
          <h2 className="mt-1 text-xl font-semibold text-white">Context-aware workspace</h2>
        </div>
        <div className="rounded-full border border-emerald-400/20 bg-emerald-500/10 px-3 py-1 text-xs font-medium uppercase tracking-[0.25em] text-emerald-200">
          Qwen3:8B
        </div>
      </div>

      <div className="flex-1 space-y-3 overflow-y-auto rounded-2xl border border-slate-800 bg-slate-950/60 p-4">
        {messages.length === 0 ? (
          <div className="rounded-2xl border border-dashed border-slate-700 bg-slate-900/50 p-4 text-sm leading-7 text-slate-400">
            Start with a business question, a technical design request, or a document review prompt. DorjeAI will use your working context and any uploaded files to respond.
          </div>
        ) : (
          messages.map((message, index) => <DorjeMessage key={`${message.role}-${index}`} role={message.role} content={message.content} />)
        )}

        {loading ? <div className="text-sm text-emerald-200">DorjeAI is thinking…</div> : null}
        {error ? <div className="rounded-2xl border border-rose-500/20 bg-rose-500/10 px-3 py-2 text-sm text-rose-200">{error}</div> : null}
      </div>

      <form onSubmit={onSubmit} className="mt-4 flex flex-col gap-3">
        <textarea
          value={input}
          onChange={(event) => onInputChange(event.target.value)}
          rows={4}
          className="w-full rounded-2xl border border-slate-700 bg-slate-950/80 px-3 py-3 text-sm text-slate-100 outline-none transition focus:border-emerald-400"
          placeholder="Ask DorjeAI to analyze a strategy, review a document, build a report, or outline an implementation plan."
        />
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            onClick={onSummarizeInput}
            disabled={loading || !input.trim()}
            className="rounded-full border border-sky-400/20 bg-sky-500/10 px-3 py-2 text-sm font-semibold text-sky-200 disabled:cursor-not-allowed disabled:opacity-40"
          >
            Summarize Text
          </button>
          <button
            type="button"
            onClick={onExplainInput}
            disabled={loading || !input.trim()}
            className="rounded-full border border-violet-400/20 bg-violet-500/10 px-3 py-2 text-sm font-semibold text-violet-200 disabled:cursor-not-allowed disabled:opacity-40"
          >
            Explain Text
          </button>
        </div>
        <button
          type="submit"
          disabled={loading}
          className="rounded-2xl bg-gradient-to-r from-emerald-500 to-teal-500 px-4 py-3 text-sm font-semibold text-white transition hover:from-emerald-400 hover:to-teal-400 disabled:cursor-not-allowed disabled:opacity-70"
        >
          {loading ? 'Thinking…' : 'Send Message'}
        </button>
      </form>
    </div>
  );
}
