// @ts-nocheck
import { useMemo, useState } from "react";
import { NavLink, useLocation, useNavigate } from "react-router-dom";
import {
  Accessibility, AlertTriangle, BarChart3, Bell, BookOpen, Bot, BriefcaseBusiness,
  CalendarDays, Check, CheckCircle2, ChevronRight, Clock3, Cloud, CloudCog,
  FileText, FolderOpen, GraduationCap, Home, Laptop,
  LayoutGrid, LockKeyhole, Menu, MessageSquareText, Mic, MicOff, MoreHorizontal,
  Plus, Pencil, Save, Search, Send, Settings, ShieldCheck, Sparkles, Sun, Target, Trash2,
  Upload, UserRound, Wifi, WifiOff, X
} from "lucide-react";
import "./studentlad.css";
import CalendarView from "@/components/CalendarView";
import AreaModal from "@/components/AreaModal";
import WorkspaceAssistant from "@/components/WorkspaceAssistant";
import SettingsPanel from "@/components/SettingsPanel";
import AreaProgressLineage, { areaStats } from "@/components/AreaProgressLineage";

const initialTasks = [
  { id: "t1", title: "Review science assignment rubric", area: "Science Assignment", time: "10:15 AM", duration: 30, due: "Today", priority: "high", status: "planned", color: "teal", points: 3, dependsOn: null },
  { id: "t2", title: "Biology class", area: "Biology", time: "8:30 AM", duration: 75, due: "Today", priority: "fixed", status: "scheduled", color: "violet", points: 5, dependsOn: null },
  { id: "t3", title: "Mathematics practice", area: "Mathematics", time: "1:00 PM", duration: 60, due: "Tomorrow", priority: "medium", status: "scheduled", color: "violet", points: 4, dependsOn: "Review science assignment rubric" },
  { id: "t4", title: "Exercise", area: "Health & Exercise", time: "6:00 PM", duration: 45, due: "Today", priority: "medium", status: "confirmed", color: "green", points: 3, dependsOn: null },
  { id: "t5", title: "Family dinner", area: "Family & Social", time: "7:00 PM", duration: 60, due: "Today", priority: "fixed", status: "confirmed", color: "orange", points: 2, dependsOn: null }
];

const initialAreas = [
  { id: "a1", title: "Science Assignment", icon: "flask", progress: 62, next: "Write first draft", note: "Due Oct 24", state: "Needs attention", tone: "teal" },
  { id: "a2", title: "Mathematics", icon: "math", progress: 78, next: "Practice chapter 6", note: "Test tomorrow", state: "High priority", tone: "violet" },
  { id: "a3", title: "Health & Exercise", icon: "health", progress: 80, next: "Evening walk", note: "4 of 5 this week", state: "On track", tone: "green" },
  { id: "a4", title: "Family & Social", icon: "family", progress: 90, next: "Parent-teacher meeting", note: "Wed 12:00 PM", state: "Confirmed", tone: "orange" },
  { id: "a5", title: "College Planning", icon: "college", progress: 35, next: "Compare three programs", note: "2 applications saved", state: "In progress", tone: "blue" },
  { id: "a6", title: "Soccer", icon: "sport", progress: 70, next: "Pack equipment", note: "Practice Tue & Thu", state: "On track", tone: "green" }
];

const initialDocuments = [
  { id: "d1", name: "Science assignment rubric.pdf", area: "Science Assignment", status: "Verified", updated: "Today", type: "PDF" },
  { id: "d2", name: "Math practice worksheet.pdf", area: "Mathematics", status: "In use", updated: "Yesterday", type: "PDF" },
  { id: "d3", name: "College comparison.xlsx", area: "College Planning", status: "Draft", updated: "Oct 20", type: "XLSX" },
  { id: "d4", name: "Health form.pdf", area: "Health & Exercise", status: "Private", updated: "Oct 18", type: "PDF" },
  { id: "d5", name: "Parent-teacher notes.docx", area: "Family & Social", status: "Reviewed", updated: "Oct 16", type: "DOCX" }
];

const navItems = [
  { to: "/", label: "Home", icon: Home },
  { to: "/today", label: "Today", icon: CalendarDays },
  { to: "/areas", label: "My Areas", icon: LayoutGrid },
  { to: "/calendar", label: "Calendar", icon: CalendarDays },
  { to: "/progress", label: "Progress", icon: BarChart3 },
  { to: "/documents", label: "Documents", icon: FileText },
  { to: "/workspace", label: "Workspace AI", icon: Sparkles },
  { to: "/settings", label: "Settings", icon: Settings }
];

function usePersistedState(key, initial) {
  const [value, setValue] = useState(() => {
    try {
      const stored = window.localStorage.getItem(key);
      return stored ? JSON.parse(stored) : initial;
    } catch {
      return initial;
    }
  });
  const update = (next) => {
    const resolved = typeof next === "function" ? next(value) : next;
    setValue(resolved);
    window.localStorage.setItem(key, JSON.stringify(resolved));
  };
  return [value, update];
}

function BrandMark() {
  return (
    <div className="brand-mark" aria-hidden="true">
      <span className="petal p1" /><span className="petal p2" />
      <span className="petal p3" /><span className="petal p4" />
    </div>
  );
}

function Sidebar({ open, onClose, listening, setListening }) {
  return (
    <aside className={open ? "sidebar open" : "sidebar"}>
      <div className="brand"><BrandMark /><span>Student-LAD</span><button className="mobile-close" onClick={onClose}><X size={20} /></button></div>
      <nav aria-label="Main navigation">
        {navItems.map(({ to, label, icon: Icon }) => (
          <NavLink key={to} to={to} end={to === "/"} onClick={onClose} className={({ isActive }) => isActive ? "nav-link active" : "nav-link"}>
            <Icon size={20} /><span>{label}</span>
          </NavLink>
        ))}
      </nav>
      <button className={listening ? "voice-orb listening" : "voice-orb"} onClick={() => setListening(!listening)} aria-label={listening ? "Stop listening" : "Start voice instruction"}>
        {listening ? <MicOff size={38} /> : <Mic size={38} />}
      </button>
      <p className="voice-copy">{listening ? "Listening… speak naturally" : "Tell Dorje what you want to manage"}</p>
    </aside>
  );
}

function TopBar({ syncState, onMenu }) {
  return (
    <header className="topbar">
      <button className="menu-button" onClick={onMenu}><Menu size={22} /></button>
      <div>
        <h1>Good morning, Maya <Sun size={23} className="sun-icon" /></h1>
        <p><CalendarDays size={15} /> Wednesday, May 14, 2025</p>
      </div>
      <label className="global-search"><Search size={19} /><input aria-label="Search anything" placeholder="Search anything…" /></label>
      <div className="top-actions">
        <span className={syncState === "offline" ? "sync-pill offline" : "sync-pill"}>{syncState === "offline" ? <WifiOff size={16} /> : <Wifi size={16} />}{syncState}</span>
        <button className="icon-button notification"><Bell size={20} /><span>3</span></button>
        <button className="access-button"><Accessibility size={18} /> Accessibility</button>
        <button className="profile"><span className="avatar">M</span><span>Maya</span></button>
      </div>
    </header>
  );
}

function Card({ children, className = "" }) {
  return <section className={"card " + className}>{children}</section>;
}

function ProgressRing({ value, tone = "blue", size = 62 }) {
  const degrees = value * 3.6;
  return <div className={"progress-ring " + tone} style={{ width: size, height: size, background: "conic-gradient(var(--ring-color) " + degrees + "deg, #edf1f7 0deg)" }}><span>{value}%</span></div>;
}

function Status({ children, tone = "blue" }) {
  return <span className={"status " + tone}>{children}</span>;
}

function ConflictCard() {
  return (
    <Card className="decision-card">
      <div className="card-title"><Sparkles size={20} /><strong>Dorje Plan & Decisions</strong><MoreHorizontal size={18} /></div>
      <div className="readiness"><span>Context readiness</span><strong>86%</strong><div><i /></div></div>
      <div className="warning-box">
        <h3><AlertTriangle size={19} /> Schedule conflict detected</h3>
        <p>Science Research overlaps with Soccer Practice (Wed 10:30–11:30 AM).</p>
        <label><input type="radio" defaultChecked name="slot" /> Wed 12:00–1:00 PM</label>
        <label><input type="radio" name="slot" /> Wed 4:00–5:00 PM</label>
        <button className="primary-button">Review choice</button>
      </div>
      <div className="week-glance">
        <h3>This week at a glance</h3>
        <div>{["M","T","W","T","F","S","S"].map((day, i) => <span key={i} className={i < 2 || i === 3 ? "done" : i === 2 ? "current" : ""}>{day}<i>{i < 2 || i === 3 ? "✓" : ""}</i></span>)}</div>
      </div>
      <div className="mini-metrics"><span><strong>82%</strong>Completion</span><span><strong>2</strong>Early submissions</span><span><strong>12.5 h</strong>Focus time</span></div>
      <div className="suggestion"><Sparkles size={20} /><p><strong>Dorje suggests</strong>Finish your history essay draft early to reduce Friday load.</p><ChevronRight size={18} /></div>
    </Card>
  );
}

function Dashboard({ tasks, areas, onComplete, openAdd }) {
  const navigate = useNavigate();
  return (
    <div className="page dashboard-page">
      <div className="page-heading"><div><h2>What would you like to manage today?</h2><p>Turn priorities into a realistic, approved plan.</p></div></div>
      <div className="dashboard-grid">
        <main>
          <div className="hero-actions">
            <button className="hero-action coral" onClick={() => navigate("/today")}><CalendarDays size={34} /><span><strong>Plan my day</strong><small>Prioritize tasks around your schedule</small></span><ChevronRight /></button>
            <button className="hero-action outline" onClick={openAdd}><Plus size={34} /><span><strong>Add something to manage</strong><small>Create a goal, project, routine, or event</small></span><ChevronRight /></button>
          </div>
          <Card className="next-card"><div className="round-icon"><Target /></div><div><small>What should I do next?</small><h3>Review science assignment rubric</h3><p><Clock3 size={15} /> 30 min <span /> Due Friday · unlocks research task</p></div><button className="coral-button" onClick={() => onComplete("t1")}>Start <ChevronRight size={17} /></button></Card>
          <div className="overview-grid">
            <Card><div className="card-head"><h3>Today</h3><button onClick={() => navigate("/today")}>View full day</button></div><TaskList tasks={tasks.slice(0,5)} compact onComplete={onComplete} /></Card>
            <Card><div className="card-head"><h3>Upcoming deadlines</h3><button>View all</button></div><DeadlineList /></Card>
            <Card><div className="card-head"><h3>My Areas</h3><button onClick={() => navigate("/areas")}>Manage</button></div><div className="mini-area-grid">{areas.slice(0,4).map(a => <div key={a.id} className={"mini-area " + a.tone}><ProgressRing value={a.progress} tone={a.tone} size={50} /><span><strong>{a.title}</strong><small>{a.next}</small></span></div>)}</div></Card>
          </div>
        </main>
        <ConflictCard />
      </div>
    </div>
  );
}

function TaskList({ tasks, compact = false, onComplete }) {
  return <div className={compact ? "task-list compact" : "task-list"}>{tasks.map(task => (
    <div className={"task-row " + (task.status === "completed" ? "completed" : "")} key={task.id}>
      {!compact && <button className="task-check" onClick={() => onComplete(task.id)}>{task.status === "completed" ? <Check size={15} /> : null}</button>}
      <span className={"task-dot " + task.color} />
      <div className="task-time">{task.time}</div>
      <div className="task-main"><strong>{task.title}</strong><small>{task.area}</small></div>
      <Status tone={task.status === "confirmed" || task.status === "completed" ? "green" : task.priority === "high" ? "coral" : "blue"}>{task.status}</Status>
    </div>
  ))}</div>;
}

function DeadlineList() {
  const items = [["Science Lab Report","Fri, May 16","2 days","teal"],["Math Problem Set 6","Mon, May 19","5 days","violet"],["History Essay Draft","Thu, May 22","8 days","blue"]];
  return <div className="deadline-list">{items.map((x,i)=><div key={i}><span className={"deadline-icon " + x[3]}><FileText size={17}/></span><p><strong>{x[0]}</strong><small>{x[1]}</small></p><Status tone={i===0?"coral":"slate"}>{x[2]}</Status></div>)}</div>;
}

function TodayPage({ tasks, onComplete }) {
  return <div className="page"><div className="page-heading"><div><h2>Your day, planned around what matters</h2><p>Review the draft before anything changes.</p></div><button className="coral-button"><CheckCircle2 size={18}/> Confirm my day</button></div>
    <div className="today-layout">
      <div><Card className="next-card"><div className="round-icon"><Target /></div><div><small>What should I do next?</small><h3>Review science assignment rubric</h3><p><Clock3 size={15}/> 30 min · Due Friday</p></div><button className="coral-button">Start</button></Card><Card><div className="card-head"><h3>Today</h3><Status tone="blue">5h 30m planned</Status></div><TaskList tasks={tasks} onComplete={onComplete}/></Card></div>
      <div><DeadlineListCard/><Card className="why-card"><Sparkles/><div><h3>Why this order?</h3><p>Math is due tomorrow; science research unlocks the next assignment step. Exercise stays protected.</p></div></Card><ConflictCard/></div>
    </div>
  </div>;
}

function DeadlineListCard(){return <Card><div className="card-head"><h3>Upcoming Deadlines</h3></div><DeadlineList/></Card>}

function AreasPage({ areas, tasks, onAddArea, onEditArea, onDeleteArea }) {
  const [filter, setFilter] = useState("all");
  const needsAttention = (a) => a.state.includes("attention") || a.state.includes("priority");
  const filtered = areas.filter(a => filter === "attention" ? needsAttention(a) : filter === "ontrack" ? !needsAttention(a) : true);
  return <div className="page"><div className="page-heading"><div><h2>My Areas</h2><p>Everything you are managing, in one place.</p></div><button className="coral-button" onClick={onAddArea}><Plus size={18}/> Add area</button></div>
    <div className="filter-row"><button className={filter==="all"?"active":""} onClick={()=>setFilter("all")}>All areas</button><button className={filter==="attention"?"active":""} onClick={()=>setFilter("attention")}>Needs attention</button><button className={filter==="ontrack"?"active":""} onClick={()=>setFilter("ontrack")}>On track</button></div>
    <div className="area-grid">{filtered.map(a=>{const st=areaStats(a,tasks);return <Card key={a.id} className={"area-card "+a.tone}><div className="area-top"><ProgressRing value={st.pct} tone={a.tone}/><div><h3>{a.title}</h3><p>Next: {a.next}</p><small>{a.note}</small></div></div><AreaProgressLineage area={a} tasks={tasks}/><div className="area-foot"><Status tone={needsAttention(a)?"coral":"green"}>{a.state}</Status><div className="area-actions"><button className="icon-mini" onClick={()=>onEditArea(a)} title="Edit area"><Pencil size={15}/></button><button className="icon-mini danger" onClick={()=>onDeleteArea(a.id)} title="Delete area"><Trash2 size={15}/></button></div></div></Card>;})}</div>
    {filtered.length===0&&<Card><p style={{color:"var(--muted)",margin:0,textAlign:"center",padding:"20px"}}>No areas match this filter.</p></Card>}
    <Card className="wide-suggestion"><Sparkles/><div><strong>Dorje suggests</strong><p>Start the science draft today. It unlocks review and revision before Friday.</p></div><button className="outline-button">Show why</button><button className="primary-button">Add to today</button></Card>
  </div>;
}

function CalendarPage({ tasks, areas }) {
  return <CalendarView tasks={tasks} areas={areas} />;
}

function ProgressPage({ areas, tasks }) {
  const completed=tasks.filter(t=>t.status==="completed").length;
  return <div className="page"><div className="page-heading"><div><h2>Progress</h2><p>See what is working and improve your plan.</p></div><div className="filter-row"><button className="active">This week</button><button>Month</button><button>Semester</button></div></div>
    <div className="metric-grid"><Card><ProgressRing value={82}/><span><strong>82%</strong> completed</span></Card><Card><Target/><span><strong>2</strong> milestones reached</span></Card><Card><Sparkles/><span><strong>3</strong> tasks replanned</span></Card><Card><CheckCircle2/><span><strong>{Math.max(1,completed)}</strong> submitted early</span></Card></div>
    <Card><div className="card-head"><h3>Weekly progress</h3><span className="legend"><i/> Planned <i/> Completed</span></div><div className="weekly-chart">{[90,88,83,89,87,86,84].map((v,i)=><div key={i}><span className="planned" style={{height:v+"%"}}/><span className="done" style={{height:(v-(i===2?20:5))+"%"}}/><small>{["Mon","Tue","Wed","Thu","Fri","Sat","Sun"][i]}</small></div>)}</div></Card>
    <div className="progress-bottom"><Card><h3>By area</h3>{areas.slice(0,5).map(a=><div className="area-bar" key={a.id}><span>{a.title}</span><div><i style={{width:a.progress+"%"}}/></div><strong>{a.progress}%</strong></div>)}</Card><Card><h3>Workload balance</h3><div className="balance-stat"><CalendarDays/><strong>8.5</strong><span>planned hours</span></div><div className="balance-stat"><CheckCircle2/><strong>7</strong><span>completed hours</span></div><div className="balance-stat"><Clock3/><strong>11.5</strong><span>available hours</span></div></Card></div>
    <Card className="wide-suggestion"><Sparkles/><div><strong>Dorje noticed</strong><p>Research tasks took longer than planned, but you protected your deadline buffer.</p></div><button className="outline-button">Review suggestion</button><button className="primary-button">Adjust next week</button></Card>
  </div>;
}

function DocumentsPage({ documents }) {
  const [selected,setSelected]=useState(documents[0]);
  return <div className="page"><div className="page-heading"><div><h2>Documents</h2><p>Your files, forms, and evidence—linked to the right work.</p></div><button className="coral-button"><Upload size={18}/> Add document</button></div>
    <div className="document-tools"><label><Search/><input placeholder="Search documents…"/></label><button>All files</button></div>
    <div className="documents-layout"><Card className="document-categories">{["All documents  12","Assignments  5","Rubrics  2","School forms  2","Health records  1","College planning  1","Shared with me  1"].map((x,i)=><button className={i===0?"active":""} key={x}>{x}</button>)}</Card>
      <Card className="document-list"><h3>Recent documents</h3>{documents.map(d=><button key={d.id} className={selected.id===d.id?"selected":""} onClick={()=>setSelected(d)}><span className="file-type">{d.type}</span><strong>{d.name}</strong><small>{d.area}</small><Status tone={d.status==="Verified"?"green":d.status==="Draft"?"coral":"blue"}>{d.status}</Status><span>{d.updated}</span><MoreHorizontal/></button>)}</Card>
    </div>
    <Card className="document-detail"><div className="large-file"><FileText/></div><div><h3>{selected.name}</h3><p>{selected.type} · 2 pages · Updated {selected.updated}</p><Status tone="teal">{selected.area}</Status><Status tone="green"><ShieldCheck size={13}/> Verified source</Status><Status tone="slate"><LockKeyhole size={13}/> Private</Status></div><div className="document-actions"><button>Open</button><button>Use in plan</button><button>Share</button></div></Card>
    <div className="approval-note"><LockKeyhole size={17}/> Nothing is shared without your approval.</div>
  </div>;
}

function WorkspacePage() {
  return <WorkspaceAssistant/>;
}

// Settings UI lives in @/components/SettingsPanel.jsx

function AddTaskModal({open,onClose,onAdd,tasks}){
 const [title,setTitle]=useState("");
 const [area,setArea]=useState("Academic");
 const [points,setPoints]=useState(2);
 const [dependsOn,setDependsOn]=useState("");
 if(!open)return null;
 const submit=()=>{if(!title.trim())return;onAdd({id:"t"+Date.now(),title,area,time:"Open",duration:30,due:"This week",priority:"medium",status:"planned",color:"blue",points:Number(points)||1,dependsOn:dependsOn||null});setTitle("");setPoints(2);setDependsOn("");onClose();};
 return <div className="modal-backdrop" role="presentation" onMouseDown={onClose}><div className="modal" role="dialog" aria-modal="true" onMouseDown={e=>e.stopPropagation()}><button className="modal-close" onClick={onClose}><X/></button><div className="round-icon"><Plus/></div><h2>Add something to manage</h2><p>Create a local task now. External scheduling remains a proposal until you approve it.</p><label>What do you want to manage?<input autoFocus value={title} onChange={e=>setTitle(e.target.value)} placeholder="Prepare my science fair project"/></label><label>Area<select value={area} onChange={e=>setArea(e.target.value)}><option>Academic</option><option>Career</option><option>Health & Exercise</option><option>Family & Social</option></select></label><div className="modal-row"><label className="modal-half">Points (effort)<input type="number" min="1" max="20" value={points} onChange={e=>setPoints(e.target.value)}/></label><label className="modal-half">Depends on<select value={dependsOn} onChange={e=>setDependsOn(e.target.value)}><option value="">Nothing</option>{(tasks||[]).map(t=><option key={t.id} value={t.title}>{t.title}</option>)}</select></label></div><div className="modal-readiness"><ShieldCheck/> Saved locally with a reversible audit event.</div><button className="coral-button full" onClick={submit}>Create task</button></div></div>
}

export default function StudentLAD(){
 const location=useLocation();
 const [tasks,setTasks]=usePersistedState("studentlad.tasks",initialTasks);
 const [areas,setAreas]=usePersistedState("studentlad.areas",initialAreas);
 const [deploymentMode,setDeploymentMode]=usePersistedState("studentlad.deploymentMode","local");
 const [syncState,setSyncState]=usePersistedState("studentlad.syncState","online");
 const [listening,setListening]=useState(false);
 const [sidebarOpen,setSidebarOpen]=useState(false);
 const [addOpen,setAddOpen]=useState(false);
 const [areaModalOpen,setAreaModalOpen]=useState(false);
 const [editingArea,setEditingArea]=useState(null);
 const onComplete=id=>setTasks(tasks.map(t=>t.id===id?{...t,status:t.status==="completed"?"planned":"completed"}:t));
 const screen=useMemo(()=>{
  if(location.pathname==="/today")return <TodayPage tasks={tasks} onComplete={onComplete}/>;
  if(location.pathname==="/areas")return <AreasPage areas={areas} tasks={tasks} onAddArea={()=>{setEditingArea(null);setAreaModalOpen(true);}} onEditArea={a=>{setEditingArea(a);setAreaModalOpen(true);}} onDeleteArea={id=>setAreas(areas.filter(a=>a.id!==id))}/>;
  if(location.pathname==="/calendar")return <CalendarPage tasks={tasks} areas={areas}/>;
  if(location.pathname==="/progress")return <ProgressPage areas={areas} tasks={tasks}/>;
  if(location.pathname==="/documents")return <DocumentsPage documents={initialDocuments}/>;
  if(location.pathname==="/workspace")return <WorkspacePage/>;
  if(location.pathname==="/settings")return <SettingsPanel deploymentMode={deploymentMode} setDeploymentMode={setDeploymentMode} syncState={syncState} setSyncState={setSyncState}/>;
  return <Dashboard tasks={tasks} areas={areas} onComplete={onComplete} openAdd={()=>setAddOpen(true)}/>;
 },[location.pathname,tasks,areas,deploymentMode,syncState]);
 const saveArea=data=>{if(editingArea){setAreas(areas.map(a=>a.id===editingArea.id?{...a,...data}:a));}else{setAreas([...areas,{...data,id:"a"+Date.now(),icon:"folder"}]);}setAreaModalOpen(false);setEditingArea(null);};
 return <div className="app-shell"><Sidebar open={sidebarOpen} onClose={()=>setSidebarOpen(false)} listening={listening} setListening={setListening}/><div className="app-main"><TopBar syncState={syncState} onMenu={()=>setSidebarOpen(true)}/>{screen}<footer><span><ShieldCheck size={15}/> Verified actions · Local-first privacy</span><span>Runtime: {deploymentMode}</span></footer></div><AddTaskModal open={addOpen} onClose={()=>setAddOpen(false)} onAdd={task=>setTasks([...tasks,task])} tasks={tasks}/><AreaModal open={areaModalOpen} editing={editingArea} onClose={()=>{setAreaModalOpen(false);setEditingArea(null);}} onSave={saveArea}/></div>;
}