import { useState, useEffect, useRef } from "react";
import { base44 } from "@/api/base44Client";
import { listCloudFiles } from "@/functions/listCloudFiles";
import { PROVIDER_ID } from "@/lib/cloudConnectors";
import {
  Cloud, CloudOff, Search, Loader2, FileText, Sheet, RefreshCw, FolderOpen
} from "lucide-react";

export default function CloudBrowser({ onOpenFile }) {
  const [provider, setProvider] = useState("google");
  const [authed, setAuthed] = useState(false);
  const [connected, setConnected] = useState(false);
  const [files, setFiles] = useState([]);
  const [loading, setLoading] = useState(false);
  const [searchQ, setSearchQ] = useState("");
  const [busy, setBusy] = useState(false);
  const popupRef = useRef(null);

  const connectorId = PROVIDER_ID(provider);
  const setupPending = !connectorId;

  const fetchFiles = async (query = "") => {
    if (setupPending) { setConnected(false); return; }
    setLoading(true);
    try {
      const res = await listCloudFiles({ provider, connector_id: connectorId, query });
      setFiles(res?.data?.files || []);
      setConnected(true);
    } catch {
      setConnected(false);
      setFiles([]);
    } finally { setLoading(false); }
  };

  useEffect(() => {
    base44.auth.isAuthenticated().then(async (isAuthed) => {
      setAuthed(isAuthed);
      if (isAuthed) await fetchFiles("");
    });
  }, []);

  useEffect(() => {
    if (authed && !setupPending) fetchFiles("");
    else if (setupPending) setConnected(false);
  }, [provider, authed]);

  const handleConnect = async () => {
    if (setupPending) return;
    setBusy(true);
    try {
      const url = await base44.connectors.connectAppUser(connectorId);
      const popup = window.open(url, "_blank");
      popupRef.current = popup;
      const timer = setInterval(() => {
        if (!popup || popup.closed) {
          clearInterval(timer);
          fetchFiles(searchQ);
          setBusy(false);
        }
      }, 600);
    } catch {
      setBusy(false);
    }
  };

  const handleDisconnect = async () => {
    try {
      await base44.connectors.disconnectAppUser(connectorId);
      setConnected(false);
      setFiles([]);
    } catch { /* ignore */ }
  };

  if (!authed) {
    return (
      <section className="card cloud-browser">
        <div className="card-head"><h3><FolderOpen size={16} /> Cloud files</h3></div>
        <p className="empty">Sign in to browse your cloud files.</p>
        <button className="coral-button" onClick={() => base44.auth.redirectToLogin()}>Sign in</button>
      </section>
    );
  }

  return (
    <section className="card cloud-browser">
      <div className="card-head">
        <h3><FolderOpen size={16} /> Cloud files</h3>
        <button onClick={() => fetchFiles(searchQ)} title="Refresh" disabled={loading}>
          <RefreshCw size={15} className={loading ? "animate-spin" : ""} />
        </button>
      </div>

      <div className="cloud-tabs">
        <button className={provider === "google" ? "active" : ""} onClick={() => setProvider("google")}>Google Drive</button>
        <button className={provider === "onedrive" ? "active" : ""} onClick={() => setProvider("onedrive")}>OneDrive</button>
      </div>

      {setupPending ? (
        <div className="cloud-status pending">
          <CloudOff size={16} /> Setup pending — the {provider === "google" ? "Google Drive" : "OneDrive"} connector isn't registered yet. Once you provide OAuth credentials, browsing goes live here.
        </div>
      ) : !connected ? (
        <div className="cloud-status">
          <CloudOff size={16} /> Not connected to {provider === "google" ? "Google Drive" : "OneDrive"}.
          <button className="coral-button" onClick={handleConnect} disabled={busy}>
            {busy ? <Loader2 size={15} className="animate-spin" /> : <Cloud size={15} />} Connect
          </button>
        </div>
      ) : (
        <>
          <div className="picker-search">
            <Search size={15} />
            <input
              value={searchQ}
              onChange={(e) => setSearchQ(e.target.value)}
              placeholder="Search files…"
              onKeyDown={(e) => e.key === "Enter" && fetchFiles(searchQ)}
            />
            <button className="outline-button" onClick={() => fetchFiles(searchQ)} disabled={loading}>
              {loading ? <Loader2 size={14} className="animate-spin" /> : "Search"}
            </button>
          </div>
          <div className="cloud-file-list">
            {files.length === 0 && !loading && <p className="empty">No files found.</p>}
            {files.map((f) => {
              const isExcel = f.name.toLowerCase().endsWith(".xlsx") || (f.mime || "").includes("spreadsheet");
              return (
                <button key={f.id} className="picker-item" onClick={() => onOpenFile(f, provider)}>
                  {isExcel ? <Sheet size={16} /> : <FileText size={16} />}
                  <span>{f.name}</span>
                </button>
              );
            })}
          </div>
          <button className="outline-button cloud-disconnect" onClick={handleDisconnect}>
            Disconnect {provider === "google" ? "Google Drive" : "OneDrive"}
          </button>
        </>
      )}
    </section>
  );
}