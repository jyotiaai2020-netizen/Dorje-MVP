export const modelModes = ['Fast Chat', 'Deep Analysis', 'Statistics Mode', 'Report Mode', 'Social Creator', 'Email Assistant'] as const;
export type ModelMode = (typeof modelModes)[number];

export default function ModelModeSelector({ value, onChange }: { value: ModelMode; onChange: (mode: ModelMode) => void }) {
  return (
    <label className="flex items-center gap-2 text-xs text-slate-400">
      <span className="hidden sm:inline">Mode</span>
      <select value={value} onChange={(event) => onChange(event.target.value as ModelMode)} className="rounded-xl border border-slate-700 bg-slate-900 px-3 py-2 text-sm text-slate-100 outline-none focus:border-emerald-400">
        {modelModes.map((mode) => <option key={mode}>{mode}</option>)}
      </select>
    </label>
  );
}
