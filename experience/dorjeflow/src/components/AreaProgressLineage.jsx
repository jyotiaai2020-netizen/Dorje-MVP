import { useState } from "react";
import { ChevronDown, ChevronRight, Link2, Check, Circle } from "lucide-react";

export const taskPoints = (t) => (Number(t.points) > 0 ? Number(t.points) : Math.max(1, Math.round((t.duration || 30) / 15)));

export const areaStats = (area, tasks) => {
  const at = (tasks || []).filter((t) => t.area === area.title);
  const total = at.reduce((s, t) => s + taskPoints(t), 0);
  const done = at.filter((t) => t.status === "completed").reduce((s, t) => s + taskPoints(t), 0);
  return { total, done, remaining: total - done, pct: total ? Math.round((done / total) * 100) : 0, tasks: at };
};

export default function AreaProgressLineage({ area, tasks }) {
  const [open, setOpen] = useState(false);
  const st = areaStats(area, tasks);
  const blocked = (t) => t.dependsOn && (tasks || []).some((d) => d.title === t.dependsOn && d.status !== "completed");

  return (
    <div className="area-lineage">
      <div className="lineage-head">
        <span className="lineage-pct">{st.pct}%</span>
        <div className="lineage-bar"><i style={{ width: st.pct + "%" }} /></div>
        <span className="lineage-points">{st.done}/{st.total} pts</span>
        <button className="lineage-toggle" onClick={() => setOpen(!open)} aria-label="Show task lineage">
          {open ? <ChevronDown size={16} /> : <ChevronRight size={16} />}
        </button>
      </div>
      <div className="lineage-summary">
        <span><strong>{st.done}</strong> completed</span>
        <span><strong>{st.remaining}</strong> remaining</span>
        <span><strong>{st.tasks.length}</strong> tasks</span>
      </div>
      {open && (
        <ul className="lineage-list">
          {st.tasks.length === 0 && <li className="lineage-empty">No tasks in this area yet.</li>}
          {st.tasks.map((t) => {
            const isDone = t.status === "completed";
            return (
              <li key={t.id} className={"lineage-item " + (isDone ? "is-done" : "")}>
                <span className="lineage-mark">{isDone ? <Check size={14} /> : <Circle size={14} />}</span>
                <span className="lineage-title">{t.title}</span>
                {blocked(t) && <span className="lineage-dep"><Link2 size={12} /> blocked by {t.dependsOn}</span>}
                <span className="lineage-pts">{taskPoints(t)} pts</span>
                <span className="lineage-status">{isDone ? "done" : "pending"}</span>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}