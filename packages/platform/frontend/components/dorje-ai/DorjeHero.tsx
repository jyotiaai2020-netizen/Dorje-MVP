import Link from 'next/link';

export default function DorjeHero() {
  return (
    <section className="overflow-hidden rounded-[2rem] border border-emerald-400/20 bg-gradient-to-br from-slate-950 via-slate-900 to-emerald-950/80 p-8 shadow-2xl shadow-emerald-950/20">
      <div className="flex flex-col gap-8 lg:flex-row lg:items-end lg:justify-between">
        <div className="max-w-2xl">
          <div className="inline-flex items-center rounded-full border border-emerald-400/30 bg-emerald-400/10 px-3 py-1 text-sm font-medium text-emerald-200">
            Separate from Kamal • premium multi-agent concierge
          </div>
          <h1 className="mt-5 text-4xl font-semibold tracking-tight text-white sm:text-5xl">
            DorjeAI brings a deeper layer of advisory intelligence to Lotus & Dorje.
          </h1>
          <p className="mt-4 text-lg leading-8 text-slate-300">
            Kamal remains the friendly site-wide parrot assistant for visitors. DorjeAI is the richer workspace for authenticated users and advisory workflows, routing conversations to specialized agents for analytics, strategy, enterprise search, and delivery.
          </p>
          <div className="mt-6 flex flex-wrap gap-3">
            <Link href="/" className="rounded-full bg-emerald-500 px-4 py-2 text-sm font-semibold text-slate-950 transition hover:bg-emerald-400">
              Back to Dashboard
            </Link>
            <a href="mailto:contact@lotusanddorje.org" className="rounded-full border border-white/15 bg-white/10 px-4 py-2 text-sm font-semibold text-white transition hover:bg-white/20">
              Contact the team
            </a>
          </div>
        </div>

        <div className="rounded-3xl border border-white/10 bg-slate-900/70 p-5 backdrop-blur">
          <p className="text-sm font-semibold uppercase tracking-[0.3em] text-teal-300">Planned intelligence stack</p>
          <div className="mt-4 space-y-2 text-sm text-slate-300">
            <div className="rounded-2xl border border-white/10 bg-white/5 px-3 py-2">Qwen3:8B orchestration</div>
            <div className="rounded-2xl border border-white/10 bg-white/5 px-3 py-2">RAG + enterprise knowledge search</div>
            <div className="rounded-2xl border border-white/10 bg-white/5 px-3 py-2">BI-CASA, CEDA, ROI calculator, reporting</div>
          </div>
        </div>
      </div>
    </section>
  );
}
