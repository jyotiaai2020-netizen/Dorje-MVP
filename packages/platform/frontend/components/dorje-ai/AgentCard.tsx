type AgentCardProps = {
  name: string;
  focus: string;
  description: string;
  accent: string;
};

export default function AgentCard({ name, focus, description, accent }: AgentCardProps) {
  return (
    <div className="rounded-3xl border border-slate-800 bg-slate-900/80 p-5 shadow-lg shadow-slate-950/30 backdrop-blur">
      <div className={`inline-flex h-10 w-10 items-center justify-center rounded-2xl ${accent}`}>
        <span className="text-lg font-semibold text-slate-950">✦</span>
      </div>
      <h3 className="mt-4 text-lg font-semibold text-white">{name}</h3>
      <p className="mt-2 text-sm font-medium uppercase tracking-[0.24em] text-emerald-300">{focus}</p>
      <p className="mt-3 text-sm leading-7 text-slate-400">{description}</p>
    </div>
  );
}
