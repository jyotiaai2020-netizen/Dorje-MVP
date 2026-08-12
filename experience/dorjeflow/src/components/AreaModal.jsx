import { useState, useEffect } from "react";
import { X, Plus, Pencil, ShieldCheck } from "lucide-react";

const TONES = ["teal", "violet", "green", "orange", "blue"];
const STATES = ["Needs attention", "High priority", "On track", "Confirmed", "In progress"];

export default function AreaModal({ open, onClose, onSave, editing }) {
  const [title, setTitle] = useState("");
  const [next, setNext] = useState("");
  const [note, setNote] = useState("");
  const [state, setState] = useState("On track");
  const [progress, setProgress] = useState(0);
  const [tone, setTone] = useState("teal");

  useEffect(() => {
    if (!open) return;
    if (editing) {
      setTitle(editing.title || "");
      setNext(editing.next || "");
      setNote(editing.note || "");
      setState(editing.state || "On track");
      setProgress(editing.progress || 0);
      setTone(editing.tone || "teal");
    } else {
      setTitle(""); setNext(""); setNote(""); setState("On track"); setProgress(0); setTone("teal");
    }
  }, [open, editing]);

  if (!open) return null;
  const submit = () => {
    if (!title.trim()) return;
    onSave({ title: title.trim(), next, note, state, progress: Number(progress), tone });
  };

  return (
    <div className="modal-backdrop" role="presentation" onMouseDown={onClose}>
      <div className="modal" role="dialog" aria-modal="true" onMouseDown={e => e.stopPropagation()}>
        <button className="modal-close" onClick={onClose}><X /></button>
        <div className="round-icon">{editing ? <Pencil /> : <Plus />}</div>
        <h2>{editing ? "Edit area" : "Add area"}</h2>
        <p>{editing ? "Update this area's details." : "Create a new area to manage."}</p>
        <label>Area title<input autoFocus value={title} onChange={e => setTitle(e.target.value)} placeholder="e.g. Science Assignment" /></label>
        <label>Next action<input value={next} onChange={e => setNext(e.target.value)} placeholder="What's next" /></label>
        <label>Note<input value={note} onChange={e => setNote(e.target.value)} placeholder="e.g. Due Oct 24" /></label>
        <label>State<select value={state} onChange={e => setState(e.target.value)}>{STATES.map(s => <option key={s}>{s}</option>)}</select></label>
        <label>Color<select value={tone} onChange={e => setTone(e.target.value)}>{TONES.map(t => <option key={t}>{t}</option>)}</select></label>
        <label>Progress: {progress}%<input type="range" min="0" max="100" value={progress} onChange={e => setProgress(e.target.value)} /></label>
        <div className="modal-readiness"><ShieldCheck /> Saved locally with a reversible audit event.</div>
        <button className="coral-button full" onClick={submit}>{editing ? "Save changes" : "Create area"}</button>
      </div>
    </div>
  );
}