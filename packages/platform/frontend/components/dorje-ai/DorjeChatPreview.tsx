export default function DorjeChatPreview() {
  return (
    <div className="rounded-[2rem] border border-slate-800 bg-slate-950/90 p-6 shadow-2xl shadow-slate-950/40">
      <div className="flex items-center justify-between">
        <div>
          <p className="text-sm font-semibold uppercase tracking-[0.3em] text-teal-300">Agent workspace preview</p>
          <h3 className="mt-2 text-xl font-semibold text-white">Orchestrated advisory conversations</h3>
        </div>
        <div className="rounded-full border border-emerald-400/20 bg-emerald-400/10 px-3 py-1 text-sm text-emerald-200">
          Live routing concept
        </div>
      </div>

      <div className="mt-6 space-y-3">
        <div className="rounded-2xl border border-emerald-400/20 bg-emerald-400/10 p-4 text-sm text-emerald-100">
          <p className="font-semibold">BI Advisor</p>
          <p className="mt-1 text-emerald-50/90">“I have pulled the leading KPI shifts and surfaced the top opportunity window.”</p>
        </div>
        <div className="rounded-2xl border border-slate-800 bg-slate-900/80 p-4 text-sm text-slate-300">
          <p className="font-semibold text-white">RAG Expert</p>
          <p className="mt-1">“The latest policy and delivery notes are available for instant Q&A.”</p>
        </div>
        <div className="rounded-2xl border border-amber-400/20 bg-amber-400/10 p-4 text-sm text-amber-100">
          <p className="font-semibold">Business Consultant</p>
          <p className="mt-1">“I can frame an ROI discussion and recommend the next advisory engagement.”</p>
        </div>
      </div>
    </div>
  );
}
