const steps = [
  {
    title: 'Discover',
    description: 'Capture the user’s objective, audience, and urgency before routing to the right specialist.',
  },
  {
    title: 'Reason',
    description: 'Blend model context, analytics signals, and enterprise knowledge into one aligned response.',
  },
  {
    title: 'Recommend',
    description: 'Surface the next best action, whether that is a report, roadmap, ROI discussion, or advisory handoff.',
  },
];

export default function DorjeWorkflow() {
  return (
    <div className="rounded-[2rem] border border-slate-800 bg-slate-900/70 p-6 shadow-xl shadow-slate-950/30">
      <p className="text-sm font-semibold uppercase tracking-[0.3em] text-gold-300">Workflow</p>
      <h3 className="mt-2 text-xl font-semibold text-white">From intake to action in three focused stages</h3>
      <div className="mt-6 grid gap-4 lg:grid-cols-3">
        {steps.map((step, index) => (
          <div key={step.title} className="rounded-2xl border border-white/10 bg-white/5 p-4">
            <div className="flex items-center justify-between">
              <span className="text-sm font-semibold text-teal-300">Step {index + 1}</span>
              <span className="text-sm text-slate-500">0{index + 1}</span>
            </div>
            <h4 className="mt-3 text-lg font-semibold text-white">{step.title}</h4>
            <p className="mt-2 text-sm leading-7 text-slate-400">{step.description}</p>
          </div>
        ))}
      </div>
    </div>
  );
}
