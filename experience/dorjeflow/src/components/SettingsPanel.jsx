import { useState, useEffect } from "react";
import { base44 } from "@/api/base44Client";
import { useToast } from "@/components/ui/use-toast";
import {
  Laptop, Cloud, CloudCog, Wifi, WifiOff, Bot, LockKeyhole, ChevronRight,
  Save, CheckCircle2, LogOut
} from "lucide-react";

const TABS = ["Profile", "General", "Appearance", "Accessibility", "AI & Models", "Privacy & Data", "Notifications", "Connected apps"];

const DEFAULT_SETTINGS = {
  general: { language: "English (US)", region: "United States", startPage: "Home", weekStartsOn: "Sunday", showChecklist: true },
  appearance: { theme: "light", density: "comfortable", cardSize: "regular", reducedMotion: false },
  accessibility: { screenReader: false, highContrast: false, keyboardNav: false, voiceFirst: false, textSize: "md" },
  ai: { autoRouter: true, detailedReasoning: true, citeSources: true, showAssumptions: false, responseDetail: "balanced", askBeforeCloud: true, noSensitiveFiles: true, cloudBudget: "$5 limit" },
  privacy: { dataLocation: "local", memory: { personalContext: true, preferences: true, learnTasks: true, storeAudio: false }, sharing: { confirmShare: true, anonDiagnostics: false, personalizedAnalytics: false } },
  notifications: { assignmentReminders: true, conflictAlerts: true, dailySummary: true, quietHours: false, quietStart: "22:00", quietEnd: "07:00" },
  connected: { google: false, microsoft: false, canvas: false, portal: false },
};

const loadSettings = () => {
  try { const s = localStorage.getItem("studentlad.settings"); if (s) return { ...DEFAULT_SETTINGS, ...JSON.parse(s) }; } catch { /* ignore */ }
  return DEFAULT_SETTINGS;
};

function Toggle({ on, onToggle }) {
  return <button aria-label="Toggle setting" onClick={onToggle} className={on ? "toggle on" : "toggle"}><span /></button>;
}

function Row({ title, sub, children }) {
  return <div className="setting-row"><span>{title}{sub && <small>{sub}</small>}</span>{children}</div>;
}

const inputStyle = { height: 42, border: "1px solid var(--line)", borderRadius: 8, padding: "0 10px", background: "white" };

export default function SettingsPanel({ deploymentMode, setDeploymentMode, syncState, setSyncState }) {
  const [tab, setTab] = useState("Profile");
  const [settings, setSettings] = useState(loadSettings);
  const [user, setUser] = useState(null);
  const [profileName, setProfileName] = useState("");
  const [savingName, setSavingName] = useState(false);
  const { toast } = useToast();

  useEffect(() => { localStorage.setItem("studentlad.settings", JSON.stringify(settings)); }, [settings]);

  useEffect(() => {
    const root = document.documentElement;
    root.classList.toggle("dark", settings.appearance.theme === "dark");
    root.classList.toggle("high-contrast", settings.accessibility.highContrast);
    root.classList.toggle("reduce-motion", settings.appearance.reducedMotion);
    root.style.fontSize = settings.accessibility.textSize === "lg" ? "18px" : settings.accessibility.textSize === "sm" ? "14px" : "16px";
  }, [settings.appearance.theme, settings.appearance.reducedMotion, settings.accessibility.highContrast, settings.accessibility.textSize]);

  useEffect(() => {
    base44.auth.me().then((u) => { setUser(u); setProfileName(u?.full_name || ""); }).catch(() => setUser(null));
  }, []);

  const set = (path, value) => setSettings((prev) => {
    const next = JSON.parse(JSON.stringify(prev));
    const keys = path.split(".");
    let obj = next;
    for (let i = 0; i < keys.length - 1; i++) obj = obj[keys[i]];
    obj[keys[keys.length - 1]] = value;
    return next;
  });

  const saveProfile = async () => {
    setSavingName(true);
    try {
      await base44.auth.updateMe({ full_name: profileName });
      setUser((u) => ({ ...u, full_name: profileName }));
      toast({ title: "Profile updated" });
    } catch (e) {
      toast({ title: "Update failed", description: e?.message || "unknown error", variant: "destructive" });
    }
    setSavingName(false);
  };

  const logout = () => base44.auth.logout(window.location.origin);
  const s = settings;

  return (
    <div className="page">
      <div className="page-heading"><div><h2>Settings</h2><p>Personalize Student-LAD, protect your data, and connect your workspace.</p></div></div>
      <div className="settings-shell">
        <div className="settings-tabs">{TABS.map((t) => <button key={t} onClick={() => setTab(t)} className={tab === t ? "active" : ""}>{t}</button>)}</div>

        {tab === "Profile" && (
          <div className="settings-content">
            <div className="settings-title"><h3>Profile</h3><p>Your account details and sign-in.</p></div>
            <div className="settings-grid two-col">
              <section className="card">
                <div className="profile-card">
                  <div className="profile-avatar">{(profileName || user?.email || "U").charAt(0).toUpperCase()}</div>
                  <div className="profile-meta"><strong>{profileName || "Unnamed user"}</strong><small>{user?.email || "—"}</small></div>
                  <span className="status blue profile-role">{user?.role || "user"}</span>
                </div>
                <label className="select-label">Display name
                  <input value={profileName} onChange={(e) => setProfileName(e.target.value)} placeholder="Your name" style={inputStyle} />
                </label>
                <button className="coral-button" onClick={saveProfile} disabled={savingName} style={{ marginTop: 10 }}>
                  {savingName ? "Saving…" : <><Save size={16} /> Save profile</>}
                </button>
              </section>
              <section className="card">
                <h3>Account</h3>
                <Row title="Email" sub={user?.email || "—"}><ChevronRight /></Row>
                <Row title="Role" sub={user?.role || "user"}><ChevronRight /></Row>
                <Row title="Sign out" sub="End your session on this device"><button className="data-button danger" onClick={logout} style={{ margin: 0 }}><LogOut size={15} /> Log out</button></Row>
              </section>
            </div>
          </div>
        )}

        {tab === "General" && (
          <div className="settings-content">
            <div className="settings-title"><h3>General</h3><p>Language, region, and start-up preferences.</p></div>
            <div className="settings-grid two-col">
              <section className="card">
                <label className="select-label">Language<select value={s.general.language} onChange={(e) => set("general.language", e.target.value)}><option>English (US)</option><option>English (UK)</option><option>Spanish</option><option>French</option><option>Arabic</option></select></label>
                <label className="select-label">Region<select value={s.general.region} onChange={(e) => set("general.region", e.target.value)}><option>United States</option><option>United Kingdom</option><option>Canada</option><option>India</option><option>United Arab Emirates</option></select></label>
              </section>
              <section className="card">
                <label className="select-label">Start page<select value={s.general.startPage} onChange={(e) => set("general.startPage", e.target.value)}><option>Home</option><option>Today</option><option>Calendar</option><option>Workspace AI</option></select></label>
                <label className="select-label">Week starts on<select value={s.general.weekStartsOn} onChange={(e) => set("general.weekStartsOn", e.target.value)}><option>Sunday</option><option>Monday</option><option>Saturday</option></select></label>
                <Row title="Show setup checklist"><Toggle on={s.general.showChecklist} onToggle={() => set("general.showChecklist", !s.general.showChecklist)} /></Row>
              </section>
            </div>
          </div>
        )}

        {tab === "Appearance" && (
          <div className="settings-content">
            <div className="settings-title"><h3>Appearance</h3><p>Theme, density, and motion. Changes apply instantly.</p></div>
            <div className="settings-grid two-col">
              <section className="card">
                <h3>Theme</h3>
                <div className="mode-cards two">
                  <button className={s.appearance.theme === "light" ? "selected" : ""} onClick={() => set("appearance.theme", "light")}><Cloud /><strong>Light</strong><small>Default</small></button>
                  <button className={s.appearance.theme === "dark" ? "selected" : ""} onClick={() => set("appearance.theme", "dark")}><CloudCog /><strong>Dark</strong><small>Low light</small></button>
                </div>
              </section>
              <section className="card">
                <h3>Density & cards</h3>
                <label className="select-label">Density<select value={s.appearance.density} onChange={(e) => set("appearance.density", e.target.value)}><option value="comfortable">Comfortable</option><option value="compact">Compact</option></select></label>
                <label className="select-label">Card size<select value={s.appearance.cardSize} onChange={(e) => set("appearance.cardSize", e.target.value)}><option value="regular">Regular</option><option value="large">Large</option></select></label>
                <Row title="Reduced motion" sub="Minimize animations and transitions."><Toggle on={s.appearance.reducedMotion} onToggle={() => set("appearance.reducedMotion", !s.appearance.reducedMotion)} /></Row>
              </section>
            </div>
          </div>
        )}

        {tab === "Accessibility" && (
          <div className="settings-content">
            <div className="settings-title"><h3>Accessibility</h3><p>Adjust the app for vision, motor, and reading needs.</p></div>
            <div className="settings-grid two-col">
              <section className="card">
                <Row title="Screen reader labels" sub="Extra ARIA labels on interactive elements."><Toggle on={s.accessibility.screenReader} onToggle={() => set("accessibility.screenReader", !s.accessibility.screenReader)} /></Row>
                <Row title="High contrast" sub="Increase contrast for better readability."><Toggle on={s.accessibility.highContrast} onToggle={() => set("accessibility.highContrast", !s.accessibility.highContrast)} /></Row>
                <Row title="Keyboard navigation" sub="Show visible focus rings."><Toggle on={s.accessibility.keyboardNav} onToggle={() => set("accessibility.keyboardNav", !s.accessibility.keyboardNav)} /></Row>
              </section>
              <section className="card">
                <Row title="Voice-first controls" sub="Prefer voice input across the app."><Toggle on={s.accessibility.voiceFirst} onToggle={() => set("accessibility.voiceFirst", !s.accessibility.voiceFirst)} /></Row>
                <label className="select-label">Text size<select value={s.accessibility.textSize} onChange={(e) => set("accessibility.textSize", e.target.value)}><option value="sm">Small</option><option value="md">Medium</option><option value="lg">Large</option></select></label>
              </section>
            </div>
          </div>
        )}

        {tab === "AI & Models" && (
          <div className="settings-content">
            <div className="settings-title"><h3>AI & Models</h3><p>Control where AI runs, which capabilities are used, and when cloud help is allowed.</p></div>
            <div className="settings-grid">
              <section className="card"><h3>Processing mode</h3>
                <div className="mode-cards">{[["local", Laptop, "Local", "No cloud cost"], ["hybrid", CloudCog, "Hybrid", "Minimum cloud use"], ["cloud", Cloud, "Cloud", "Highest capability"]].map(([id, I, title, sub]) => <button key={id} onClick={() => setDeploymentMode(id)} className={deploymentMode === id ? "selected" : ""}><I /><strong>{title}</strong><small>{sub}</small></button>)}</div>
                <Row title="Automatic capability router" sub="Select the smallest capable lane for each task."><Toggle on={s.ai.autoRouter} onToggle={() => set("ai.autoRouter", !s.ai.autoRouter)} /></Row>
              </section>
              <section className="card"><h3>Installed local capabilities</h3>{[["Qwen3 8B", "Writing & reasoning"], ["DeepSeek-R1 1.5B", "Workflow planning"], ["Qwen3.5 Vision 0.8B", "Image understanding"], ["Whisper Tiny", "Speech to text"], ["MiniLM", "Search & embeddings"]].map((x) => <div className="model-row" key={x[0]}><Bot /><strong>{x[0]}</strong><small>{x[1]}</small><span className="status green">Ready</span></div>)}</section>
              <section className="card"><h3>Reasoning & answers</h3>
                <Row title="Detailed reasoning"><Toggle on={s.ai.detailedReasoning} onToggle={() => set("ai.detailedReasoning", !s.ai.detailedReasoning)} /></Row>
                <Row title="Cite sources"><Toggle on={s.ai.citeSources} onToggle={() => set("ai.citeSources", !s.ai.citeSources)} /></Row>
                <Row title="Show assumptions"><Toggle on={s.ai.showAssumptions} onToggle={() => set("ai.showAssumptions", !s.ai.showAssumptions)} /></Row>
                <label className="select-label">Response detail<select value={s.ai.responseDetail} onChange={(e) => set("ai.responseDetail", e.target.value)}><option value="concise">Concise</option><option value="balanced">Balanced</option><option value="detailed">Detailed</option></select></label>
              </section>
              <section className="card"><h3>Cloud fallback</h3>
                <Row title="Ask before cloud AI"><Toggle on={s.ai.askBeforeCloud} onToggle={() => set("ai.askBeforeCloud", !s.ai.askBeforeCloud)} /></Row>
                <Row title="Never send sensitive files"><Toggle on={s.ai.noSensitiveFiles} onToggle={() => set("ai.noSensitiveFiles", !s.ai.noSensitiveFiles)} /></Row>
                <label className="select-label">Monthly cloud budget<select value={s.ai.cloudBudget} onChange={(e) => set("ai.cloudBudget", e.target.value)}><option>$5 limit</option><option>$10 limit</option><option>No cloud spend</option></select></label>
              </section>
              <section className="card"><h3>Connectivity</h3>
                <div className="mode-cards two">
                  <button className={syncState === "online" ? "selected" : ""} onClick={() => setSyncState("online")}><Wifi /><strong>Online</strong><small>Sync available</small></button>
                  <button className={syncState === "offline" ? "selected" : ""} onClick={() => setSyncState("offline")}><WifiOff /><strong>Offline</strong><small>Local working set</small></button>
                </div>
              </section>
              <section className="card trust-card"><LockKeyhole /><h3>Sensitive tasks stay local unless you explicitly approve cloud processing.</h3></section>
            </div>
          </div>
        )}

        {tab === "Privacy & Data" && (
          <div className="settings-content">
            <div className="settings-title"><h3>Privacy & Data</h3><p>Control memory, storage, permissions, sharing, and retention.</p></div>
            <div className="settings-grid two-col">
              <section className="card"><h3>Data location</h3>
                <label className="radio-line"><input type="radio" name="data-location" checked={s.privacy.dataLocation === "local"} onChange={() => set("privacy.dataLocation", "local")} /><span><strong>Local device</strong><small>Data stays on this device.</small></span><span className="status green">Recommended</span></label>
                <label className="radio-line"><input type="radio" name="data-location" checked={s.privacy.dataLocation === "cloud"} onChange={() => set("privacy.dataLocation", "cloud")} /><span><strong>Encrypted cloud sync</strong><small>Sync selected data across devices.</small></span></label>
              </section>
              <section className="card"><h3>Dorje memory</h3>
                <Row title="Use personal context to improve plans"><Toggle on={s.privacy.memory.personalContext} onToggle={() => set("privacy.memory.personalContext", !s.privacy.memory.personalContext)} /></Row>
                <Row title="Remember confirmed preferences"><Toggle on={s.privacy.memory.preferences} onToggle={() => set("privacy.memory.preferences", !s.privacy.memory.preferences)} /></Row>
                <Row title="Learn from completed tasks"><Toggle on={s.privacy.memory.learnTasks} onToggle={() => set("privacy.memory.learnTasks", !s.privacy.memory.learnTasks)} /></Row>
                <Row title="Store raw audio"><Toggle on={s.privacy.memory.storeAudio} onToggle={() => set("privacy.memory.storeAudio", !s.privacy.memory.storeAudio)} /></Row>
              </section>
              <section className="card"><h3>Sharing & analytics</h3>
                <Row title="Confirm before sharing"><Toggle on={s.privacy.sharing.confirmShare} onToggle={() => set("privacy.sharing.confirmShare", !s.privacy.sharing.confirmShare)} /></Row>
                <Row title="Anonymous diagnostics"><Toggle on={s.privacy.sharing.anonDiagnostics} onToggle={() => set("privacy.sharing.anonDiagnostics", !s.privacy.sharing.anonDiagnostics)} /></Row>
                <Row title="Personalized analytics"><Toggle on={s.privacy.sharing.personalizedAnalytics} onToggle={() => set("privacy.sharing.personalizedAnalytics", !s.privacy.sharing.personalizedAnalytics)} /></Row>
              </section>
              <section className="card"><h3>Your data</h3>
                <button className="data-button" onClick={() => toast({ title: "Export started" })}>Export my data</button>
                <button className="data-button" onClick={() => { localStorage.removeItem("studentlad.tasks"); localStorage.removeItem("studentlad.areas"); toast({ title: "Conversation history cleared" }); }}>Clear conversation history</button>
                <button className="data-button danger" onClick={() => { ["studentlad.tasks", "studentlad.areas", "studentlad.calendar.events", "studentlad.settings"].forEach((k) => localStorage.removeItem(k)); toast({ title: "Local data deleted" }); }}>Delete local data</button>
              </section>
            </div>
            <div className="approval-note"><LockKeyhole /> Student-LAD never sells your data. External sharing always requires permission.</div>
          </div>
        )}

        {tab === "Notifications" && (
          <div className="settings-content">
            <div className="settings-title"><h3>Notifications</h3><p>Choose what you're alerted about and when.</p></div>
            <div className="settings-grid two-col">
              <section className="card">
                <Row title="Assignment reminders" sub="Ping before a task is due."><Toggle on={s.notifications.assignmentReminders} onToggle={() => set("notifications.assignmentReminders", !s.notifications.assignmentReminders)} /></Row>
                <Row title="Conflict alerts" sub="When two commitments overlap."><Toggle on={s.notifications.conflictAlerts} onToggle={() => set("notifications.conflictAlerts", !s.notifications.conflictAlerts)} /></Row>
                <Row title="Daily plan summary" sub="A morning recap of your day."><Toggle on={s.notifications.dailySummary} onToggle={() => set("notifications.dailySummary", !s.notifications.dailySummary)} /></Row>
              </section>
              <section className="card">
                <Row title="Quiet hours" sub="No notifications during this window."><Toggle on={s.notifications.quietHours} onToggle={() => set("notifications.quietHours", !s.notifications.quietHours)} /></Row>
                <label className="select-label">Quiet start<input type="time" value={s.notifications.quietStart} onChange={(e) => set("notifications.quietStart", e.target.value)} style={inputStyle} /></label>
                <label className="select-label">Quiet end<input type="time" value={s.notifications.quietEnd} onChange={(e) => set("notifications.quietEnd", e.target.value)} style={inputStyle} /></label>
              </section>
            </div>
          </div>
        )}

        {tab === "Connected apps" && (
          <div className="settings-content">
            <div className="settings-title"><h3>Connected apps</h3><p>Link external services. Toggle a service to mark it connected.</p></div>
            <div className="settings-grid two-col">
              {[["google", "Google Workspace", "Drive, Docs, Calendar"], ["microsoft", "Microsoft 365", "OneDrive, Word, Outlook"], ["canvas", "Canvas", "Assignments & grades"], ["portal", "School portal", "Announcements"]].map(([id, name, desc]) => (
                <section className="card" key={id}>
                  <Row title={name} sub={desc}><Toggle on={s.connected[id]} onToggle={() => set(`connected.${id}`, !s.connected[id])} /></Row>
                  <span className={"status " + (s.connected[id] ? "green" : "slate")}>{s.connected[id] ? "Connected" : "Not connected"}</span>
                </section>
              ))}
            </div>
          </div>
        )}

        <div className="settings-actions">
          <button className="outline-button" onClick={() => setSettings(DEFAULT_SETTINGS)}>Reset</button>
          <button className="coral-button" onClick={() => toast({ title: "Settings saved" })}><CheckCircle2 size={16} /> Save changes</button>
        </div>
      </div>
    </div>
  );
}