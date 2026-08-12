import { useState, useMemo, useEffect } from "react";
import {
  format, addMonths, subMonths, addWeeks, subWeeks, startOfMonth, endOfMonth,
  startOfWeek, endOfWeek, eachDayOfInterval, isSameMonth, isSameDay, addDays
} from "date-fns";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { ChevronLeft, ChevronRight, Plus, Trash2, AlertTriangle, Clock, Pencil, RefreshCw } from "lucide-react";
import { getCalendarEvents } from "@/functions/getCalendarEvents";

const COLOR_MAP = {
  blue: "bg-blue-100 text-blue-800 border-blue-300",
  teal: "bg-teal-100 text-teal-800 border-teal-300",
  violet: "bg-violet-100 text-violet-800 border-violet-300",
  green: "bg-green-100 text-green-800 border-green-300",
  coral: "bg-rose-100 text-rose-800 border-rose-300",
  orange: "bg-orange-100 text-orange-800 border-orange-300",
};
const DOT_MAP = {
  blue: "bg-blue-500", teal: "bg-teal-500", violet: "bg-violet-500",
  green: "bg-green-500", coral: "bg-rose-500", orange: "bg-orange-500",
};
const COLORS = Object.keys(COLOR_MAP);
const WEEKDAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const HOURS = Array.from({ length: 15 }, (_, i) => i + 7); // 7am – 9pm
const ROW_H = 44; // px per hour

function usePersistedState(key, initial) {
  const [value, setValue] = useState(() => {
    try { const s = localStorage.getItem(key); return s ? JSON.parse(s) : initial; } catch { return initial; }
  });
  useEffect(() => {
    try { localStorage.setItem(key, JSON.stringify(value)); } catch { /* ignore */ }
  }, [key, value]);
  return [value, setValue];
}

const toMin = (hhmm) => { const [h, m] = hhmm.split(":").map(Number); return h * 60 + m; };
const overlap = (a, b) => a.date === b.date && toMin(a.start) < toMin(b.end) && toMin(b.start) < toMin(a.end);
const fmtDate = (d) => format(d, "yyyy-MM-dd");

const resolveDue = (due) => {
  const today = new Date(); today.setHours(0, 0, 0, 0);
  const lower = (due || "").toLowerCase().trim();
  if (!lower) return null;
  if (lower === "today") return today;
  if (lower === "tomorrow") { const t = new Date(today); t.setDate(t.getDate() + 1); return t; }
  const names = ["sunday","monday","tuesday","wednesday","thursday","friday","saturday"];
  const idx = names.indexOf(lower);
  if (idx >= 0) { const t = new Date(today); t.setDate(t.getDate() + ((idx - t.getDay() + 7) % 7)); return t; }
  return null;
};
const to24 = (t) => {
  if (!t) return "09:00";
  const m = String(t).match(/(\d+):(\d+)\s*(AM|PM)/i);
  if (!m) return "09:00";
  let h = parseInt(m[1], 10); const min = m[2]; const ap = m[3].toUpperCase();
  if (ap === "PM" && h !== 12) h += 12;
  if (ap === "AM" && h === 12) h = 0;
  return `${String(h).padStart(2, "0")}:${min}`;
};
const addMin = (hhmm, mins) => {
  const [h, m] = hhmm.split(":").map(Number);
  const total = h * 60 + m + mins;
  return `${String(Math.floor(total / 60) % 24).padStart(2, "0")}:${String(total % 60).padStart(2, "0")}`;
};

export default function CalendarView({ tasks = [], areas = [] }) {
  const [view, setView] = useState("month");
  const [cursor, setCursor] = useState(new Date());
  const [events, setEvents] = usePersistedState("studentlad.calendar.events", []);
  const [addOpen, setAddOpen] = useState(false);
  const [editingId, setEditingId] = useState(null);
  const [draft, setDraft] = useState({ title: "", date: fmtDate(new Date()), start: "09:00", end: "10:00", color: "teal" });
  const [selectedId, setSelectedId] = useState(null);
  const [syncedEvents, setSyncedEvents] = useState([]);
  const [syncing, setSyncing] = useState(false);

  const loadSynced = async () => {
    setSyncing(true);
    try {
      const res = await getCalendarEvents({});
      if (res?.data?.events) setSyncedEvents(res.data.events);
    } catch { /* not connected / no synced events yet */ }
    setSyncing(false);
  };
  useEffect(() => { loadSynced(); }, []);

  const taskEvents = useMemo(() => {
    return tasks.map((t) => {
      const due = resolveDue(t.due);
      if (!due) return null;
      const start = to24(t.time);
      return {
        id: "task-" + t.id, title: t.title, date: fmtDate(due),
        start, end: addMin(start, t.duration || 30),
        color: t.color || "blue", isTask: true, taskId: t.id,
        area: t.area, status: t.status,
      };
    }).filter(Boolean);
  }, [tasks]);

  const allEvents = useMemo(() => [...events, ...syncedEvents, ...taskEvents], [events, syncedEvents, taskEvents]);

  const conflicts = useMemo(() => {
    const set = new Set();
    for (let i = 0; i < allEvents.length; i++) {
      for (let j = i + 1; j < allEvents.length; j++) {
        if (overlap(allEvents[i], allEvents[j])) { set.add(allEvents[i].id); set.add(allEvents[j].id); }
      }
    }
    return set;
  }, [allEvents]);

  const draftConflicts = useMemo(() => {
    if (!draft.title) return [];
    const probe = { ...draft, id: "draft" };
    return allEvents.filter((e) => overlap(probe, e));
  }, [draft, allEvents]);

  const selected = allEvents.find((e) => e.id === selectedId) || null;

  const monthDays = useMemo(() => {
    const s = startOfWeek(startOfMonth(cursor), { weekStartsOn: 0 });
    const e = endOfWeek(endOfMonth(cursor), { weekStartsOn: 0 });
    return eachDayOfInterval({ start: s, end: e });
  }, [cursor]);

  const weekDays = useMemo(() => {
    const s = startOfWeek(cursor, { weekStartsOn: 0 });
    return Array.from({ length: 7 }, (_, i) => addDays(s, i));
  }, [cursor]);

  const eventsByDate = useMemo(() => {
    const map = {};
    for (const e of allEvents) { (map[e.date] ||= []).push(e); }
    return map;
  }, [allEvents]);

  const prev = () => setCursor(view === "month" ? subMonths(cursor, 1) : subWeeks(cursor, 1));
  const next = () => setCursor(view === "month" ? addMonths(cursor, 1) : addWeeks(cursor, 1));
  const goToday = () => setCursor(new Date());

  const openAdd = (date) => {
    setEditingId(null);
    setDraft({ title: "", date: fmtDate(date || new Date()), start: "09:00", end: "10:00", color: "teal" });
    setAddOpen(true);
  };

  const openEdit = (ev) => {
    setEditingId(ev.id);
    setDraft({ title: ev.title, date: ev.date, start: ev.start, end: ev.end, color: ev.color });
    setSelectedId(null);
    setAddOpen(true);
  };

  const saveEvent = () => {
    if (!draft.title.trim()) return;
    if (toMin(draft.end) <= toMin(draft.start)) return;
    if (editingId) {
      setEvents(events.map((e) => (e.id === editingId ? { ...draft, id: editingId } : e)));
    } else {
      setEvents([...events, { ...draft, id: "e" + Date.now() }]);
    }
    setAddOpen(false);
    setEditingId(null);
  };

  const removeEvent = (id) => {
    setEvents(events.filter((e) => e.id !== id));
    setSelectedId(null);
  };

  const suggestSlot = () => {
    let t = toMin(draft.start);
    const dayEvents = events.filter((e) => e.date === draft.date).sort((a, b) => toMin(a.start) - toMin(b.start));
    for (let i = 0; i < dayEvents.length; i++) {
      const e = dayEvents[i];
      if (t + 60 <= toMin(e.start)) break;
      if (toMin(e.end) > t) t = toMin(e.end);
    }
    if (t + 60 > 21 * 60) t = 7 * 60;
    const hh = String(Math.floor(t / 60)).padStart(2, "0");
    const mm = String(t % 60).padStart(2, "0");
    setDraft({ ...draft, start: `${hh}:${mm}`, end: `${String(Math.floor((t + 60) / 60)).padStart(2, "0")}:${String((t + 60) % 60).padStart(2, "0")}` });
  };

  const years = useMemo(() => {
    const y = new Date().getFullYear();
    return Array.from({ length: 11 }, (_, i) => y - 5 + i);
  }, []);

  return (
    <div className="page">
      <div className="page-heading">
        <div>
          <h2>Calendar</h2>
          <p>Plan commitments, spot conflicts, and keep your week on track.</p>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" onClick={loadSynced} disabled={syncing}>
            <RefreshCw size={16} className={syncing ? "animate-spin" : ""} /> Sync
          </Button>
          <Button className="coral-button" onClick={() => openAdd(new Date())}>
            <Plus size={18} /> Add event
          </Button>
        </div>
      </div>

      <Card className="p-4 space-y-4">
        {/* Toolbar */}
        <div className="flex flex-wrap items-center gap-2 justify-between">
          <div className="flex items-center gap-2">
            <Button variant="outline" size="sm" onClick={goToday}>Today</Button>
            <Button variant="outline" size="icon" onClick={prev}><ChevronLeft size={18} /></Button>
            <Button variant="outline" size="icon" onClick={next}><ChevronRight size={18} /></Button>
            <span className="text-lg font-semibold min-w-[180px] text-center">
              {view === "month" ? format(cursor, "MMMM yyyy") : `${format(weekDays[0], "MMM d")} – ${format(weekDays[6], "MMM d, yyyy")}`}
            </span>
          </div>
          <div className="flex items-center gap-2">
            <Select value={String(cursor.getMonth())} onValueChange={(v) => setCursor(new Date(cursor.getFullYear(), Number(v), 1))}>
              <SelectTrigger className="w-[130px] h-9"><SelectValue /></SelectTrigger>
              <SelectContent>
                {Array.from({ length: 12 }, (_, i) => format(new Date(2020, i, 1), "MMMM")).map((m, i) => (
                  <SelectItem key={i} value={String(i)}>{m}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Select value={String(cursor.getFullYear())} onValueChange={(v) => setCursor(new Date(Number(v), cursor.getMonth(), 1))}>
              <SelectTrigger className="w-[100px] h-9"><SelectValue /></SelectTrigger>
              <SelectContent>
                {years.map((y) => <SelectItem key={y} value={String(y)}>{y}</SelectItem>)}
              </SelectContent>
            </Select>
            <div className="flex rounded-md border overflow-hidden">
              <Button size="sm" variant={view === "month" ? "default" : "ghost"} onClick={() => setView("month")}>Month</Button>
              <Button size="sm" variant={view === "week" ? "default" : "ghost"} onClick={() => setView("week")}>Week</Button>
            </div>
          </div>
        </div>

        {conflicts.size > 0 && (
          <div className="flex items-center gap-2 rounded-md bg-rose-50 border border-rose-200 px-3 py-2 text-sm text-rose-700">
            <AlertTriangle size={16} />
            {conflicts.size} scheduling conflict{conflicts.size > 1 ? "s" : ""} detected — overlapping events are highlighted.
          </div>
        )}

        {/* Month view */}
        {view === "month" && (
          <div>
            <div className="grid grid-cols-7 border-b">
              {WEEKDAYS.map((d) => (
                <div key={d} className="py-2 text-center text-xs font-semibold text-muted-foreground uppercase">{d}</div>
              ))}
            </div>
            <div className="grid grid-cols-7">
              {monthDays.map((day) => {
                const inMonth = isSameMonth(day, cursor);
                const today = isSameDay(day, new Date());
                const dayEvents = (eventsByDate[fmtDate(day)] || []).sort((a, b) => toMin(a.start) - toMin(b.start));
                return (
                  <div
                    onClick={() => openAdd(day)}
                    className={`min-h-[96px] border-b border-r p-1.5 cursor-pointer hover:bg-accent/50 ${inMonth ? "" : "bg-muted/40 text-muted-foreground"}`}
                    key={fmtDate(day)}
                  >
                    <div className={`text-xs mb-1 flex items-center justify-center w-6 h-6 rounded-full ${today ? "bg-primary text-primary-foreground font-semibold" : ""}`}>
                      {format(day, "d")}
                    </div>
                    <div className="space-y-1">
                      {dayEvents.slice(0, 3).map((e) => (
                        <button
                          key={e.id}
                          onClick={(ev) => { ev.stopPropagation(); setSelectedId(e.id); }}
                          className={`w-full text-left text-[11px] px-1.5 py-0.5 rounded border truncate flex items-center gap-1 ${COLOR_MAP[e.color]} ${conflicts.has(e.id) ? "ring-1 ring-rose-400" : ""}`}
                        >
                          {conflicts.has(e.id) && <AlertTriangle size={10} className="shrink-0" />}
                          <span className="truncate"><span className="opacity-70">{e.start}</span> {e.title}</span>
                        </button>
                      ))}
                      {dayEvents.length > 3 && (
                        <div className="text-[10px] text-muted-foreground pl-1">+{dayEvents.length - 3} more</div>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* Week view */}
        {view === "week" && (
          <div className="flex">
            <div className="w-14 shrink-0">
              <div className="h-9 border-b" />
              {HOURS.map((h) => (
                <div key={h} className="text-[11px] text-muted-foreground text-right pr-1" style={{ height: ROW_H }}>{format(new Date().setHours(h, 0), "h a")}</div>
              ))}
            </div>
            <div className="flex-1 grid grid-cols-7">
              {weekDays.map((day) => {
                const dayEvents = (eventsByDate[fmtDate(day)] || []).sort((a, b) => toMin(a.start) - toMin(b.start));
                const today = isSameDay(day, new Date());
                return (
                  <div className="relative border-l" key={fmtDate(day)}>
                    <div className={`h-9 text-center text-xs font-medium border-b ${today ? "text-primary" : "text-muted-foreground"}`}>
                      {format(day, "EEE d")}
                    </div>
                    {HOURS.map((h) => (
                      <div key={h} className="border-b border-dashed border-border/60" style={{ height: ROW_H }} />
                    ))}
                    {dayEvents.map((e) => {
                      const top = (toMin(e.start) - 7 * 60) * (ROW_H / 60);
                      const height = Math.max(22, (toMin(e.end) - toMin(e.start)) * (ROW_H / 60));
                      return (
                        <button
                          key={e.id}
                          onClick={() => setSelectedId(e.id)}
                          className={`absolute left-0.5 right-0.5 text-left text-[11px] px-1.5 py-1 rounded border overflow-hidden ${COLOR_MAP[e.color]} ${conflicts.has(e.id) ? "ring-2 ring-rose-400" : ""}`}
                          style={{ top, height }}
                        >
                          <div className="font-medium truncate flex items-center gap-1">
                            {conflicts.has(e.id) && <AlertTriangle size={10} className="shrink-0" />}
                            <span className="truncate">{e.title}</span>
                          </div>
                          <div className="opacity-70 truncate">{e.start}–{e.end}</div>
                        </button>
                      );
                    })}
                  </div>
                );
              })}
            </div>
          </div>
        )}
      </Card>

      {/* Add dialog */}
      <Dialog open={addOpen} onOpenChange={setAddOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{editingId ? "Edit event" : "Add event"}</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <div className="space-y-1">
              <Label htmlFor="ev-title">Title</Label>
              <Input id="ev-title" autoFocus value={draft.title} onChange={(e) => setDraft({ ...draft, title: e.target.value })} placeholder="e.g. Science review session" />
            </div>
            <div className="grid grid-cols-3 gap-3">
              <div className="space-y-1">
                <Label>Date</Label>
                <Input type="date" value={draft.date} onChange={(e) => setDraft({ ...draft, date: e.target.value })} />
              </div>
              <div className="space-y-1">
                <Label>Start</Label>
                <Input type="time" value={draft.start} onChange={(e) => setDraft({ ...draft, start: e.target.value })} />
              </div>
              <div className="space-y-1">
                <Label>End</Label>
                <Input type="time" value={draft.end} onChange={(e) => setDraft({ ...draft, end: e.target.value })} />
              </div>
            </div>
            <div className="space-y-1">
              <Label>Color</Label>
              <div className="flex gap-2">
                {COLORS.map((c) => (
                  <button
                    key={c}
                    onClick={() => setDraft({ ...draft, color: c })}
                    className={`w-7 h-7 rounded-full border-2 ${DOT_MAP[c]} ${draft.color === c ? "ring-2 ring-offset-2 ring-foreground" : ""}`}
                    aria-label={c}
                  />
                ))}
              </div>
            </div>
            {toMin(draft.end) <= toMin(draft.start) && (
              <div className="text-sm text-rose-600 flex items-center gap-1"><AlertTriangle size={14} /> End time must be after start time.</div>
            )}
            {draftConflicts.length > 0 && toMin(draft.end) > toMin(draft.start) && (
              <div className="rounded-md bg-rose-50 border border-rose-200 p-3 text-sm text-rose-700 space-y-2">
                <div className="flex items-center gap-1 font-medium"><AlertTriangle size={14} /> Conflicts with {draftConflicts.length} event{draftConflicts.length > 1 ? "s" : ""}:</div>
                <ul className="list-disc pl-5">
                  {draftConflicts.map((c) => <li key={c.id}>{c.title} ({c.start}–{c.end})</li>)}
                </ul>
                <Button size="sm" variant="outline" onClick={suggestSlot}>Suggest a free slot</Button>
              </div>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setAddOpen(false)}>Cancel</Button>
            <Button onClick={saveEvent} disabled={!draft.title.trim() || toMin(draft.end) <= toMin(draft.start)}>Add event</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Detail dialog */}
      <Dialog open={!!selected} onOpenChange={(o) => !o && setSelectedId(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              {selected && <span className={`w-3 h-3 rounded-full ${DOT_MAP[selected.color]}`} />}
              {selected?.title}
            </DialogTitle>
          </DialogHeader>
          {selected && (
            <div className="space-y-2 text-sm">
              <div className="flex items-center gap-2 text-muted-foreground"><Clock size={14} /> {format(parse(selected.date), "EEEE, MMM d")} · {selected.start}–{selected.end}</div>
              {selected.synced && (
                <div className="flex items-center gap-1 text-muted-foreground"><RefreshCw size={14} /> Synced from {selected.source || "your areas"} — managed automatically.</div>
              )}
              {conflicts.has(selected.id) && (
                <div className="flex items-center gap-1 text-rose-600"><AlertTriangle size={14} /> This event overlaps with another on the same day.</div>
              )}
              {selected.isTask && (() => {
                const aTasks = tasks.filter((t) => t.area === selected.area);
                const done = aTasks.filter((t) => t.status === "completed").length;
                const pct = aTasks.length ? Math.round((done / aTasks.length) * 100) : 0;
                return (
                  <div className="mt-2 rounded-md border p-3 space-y-2">
                    <div className="flex items-center justify-between">
                      <span className="font-medium">{selected.area || "Area"}</span>
                      <span className="text-muted-foreground">{done}/{aTasks.length} done · {pct}%</span>
                    </div>
                    <div className="h-2 rounded-full bg-muted overflow-hidden">
                      <div className="h-full bg-primary" style={{ width: pct + "%" }} />
                    </div>
                    <ul className="space-y-1">
                      {aTasks.map((t) => (
                        <li key={t.id} className="flex items-center gap-2 text-xs">
                          <span className={t.status === "completed" ? "text-green-600 font-semibold" : "text-muted-foreground"}>{t.status === "completed" ? "✓" : "○"}</span>
                          <span className={t.status === "completed" ? "line-through text-muted-foreground" : ""}>{t.title}</span>
                          <span className="ml-auto text-[10px] uppercase text-muted-foreground">{t.status}</span>
                        </li>
                      ))}
                      {aTasks.length === 0 && <li className="text-xs text-muted-foreground">No tasks in this area yet.</li>}
                    </ul>
                  </div>
                );
              })()}
            </div>
          )}
          <DialogFooter>
            {selected && !selected.synced && !selected.isTask && (
              <>
                <Button variant="destructive" onClick={() => removeEvent(selected.id)}><Trash2 size={16} /> Remove</Button>
                <Button variant="outline" onClick={() => openEdit(selected)}><Pencil size={16} /> Edit</Button>
              </>
            )}
            <Button variant="outline" onClick={() => setSelectedId(null)}>Close</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function parse(d) {
  const [y, m, dd] = d.split("-").map(Number);
  return new Date(y, m - 1, dd);
}