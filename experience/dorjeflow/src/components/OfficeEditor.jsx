import { useState, useRef, useEffect } from "react";
import { base44 } from "@/api/base44Client";
import { cloudConnection } from "@/functions/cloudConnection";
import { saveToCloud } from "@/functions/saveToCloud";
import { listCloudFiles } from "@/functions/listCloudFiles";
import { getCloudFile } from "@/functions/getCloudFile";
import {
  Document as DocxDocument, Packer, Paragraph, TextRun, HeadingLevel
} from "docx";
import ExcelJS from "exceljs";
import mammoth from "mammoth";
import {
  X, Bold, Italic, Underline, Heading1, Heading2, Pilcrow, List, ListOrdered,
  AlignLeft, AlignCenter, AlignRight, Sparkles, Download, Cloud, CloudOff,
  Plus, Trash2, Loader2, FileText, Sheet, FolderOpen, Search
} from "lucide-react";

import { GOOGLE_DRIVE_CONNECTOR_ID, ONEDRIVE_CONNECTOR_ID, PROVIDER_ID } from "@/lib/cloudConnectors";

const DEFAULT_GRID = () =>
  Array.from({ length: 12 }, () => Array.from({ length: 6 }, () => ""));

function collectRuns(node, style = {}, runs = []) {
  node.childNodes.forEach((child) => {
    if (child.nodeType === 3) {
      const t = child.textContent.replace(/\s+/g, " ");
      if (t) runs.push(new TextRun({ text: t, ...style }));
    } else if (child.nodeType === 1) {
      const tag = child.tagName.toLowerCase();
      const next = { ...style };
      if (tag === "b" || tag === "strong") next.bold = true;
      if (tag === "i" || tag === "em") next.italics = true;
      if (tag === "u") next.underline = true;
      collectRuns(child, next, runs);
    }
  });
  return runs;
}

function htmlToParagraphs(root) {
  const blocks = root.querySelectorAll("h1,h2,h3,p,li");
  const paragraphs = [];
  if (blocks.length === 0) {
    paragraphs.push(new Paragraph({ children: [new TextRun({ text: root.textContent || "" })] }));
    return paragraphs;
  }
  blocks.forEach((block) => {
    const runs = collectRuns(block);
    if (runs.length === 0) runs.push(new TextRun({ text: "" }));
    const tag = block.tagName.toLowerCase();
    const opts = { children: runs };
    if (tag === "h1") opts.heading = HeadingLevel.HEADING_1;
    else if (tag === "h2") opts.heading = HeadingLevel.HEADING_2;
    else if (tag === "h3") opts.heading = HeadingLevel.HEADING_3;
    else if (tag === "li") opts.bullet = { level: 0 };
    paragraphs.push(new Paragraph(opts));
  });
  return paragraphs;
}

function parseCSV(text) {
  const rows = [];
  const lines = text.replace(/\r/g, "").split("\n");
  for (const line of lines) {
    if (!line && rows.length) continue;
    const cells = [];
    let cur = "";
    let inQ = false;
    for (let i = 0; i < line.length; i++) {
      const ch = line[i];
      if (inQ) {
        if (ch === '"') {
          if (line[i + 1] === '"') { cur += '"'; i++; }
          else inQ = false;
        } else cur += ch;
      } else {
        if (ch === ",") { cells.push(cur); cur = ""; }
        else if (ch === '"') inQ = true;
        else cur += ch;
      }
    }
    cells.push(cur);
    rows.push(cells);
  }
  return rows.length ? rows : [[""]];
}

function base64ToArrayBuffer(b64) {
  const bin = atob(b64);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return bytes.buffer;
}

export default function OfficeEditor({ open, onClose, onSaved, command, onCommandDone }) {
  const [type, setType] = useState("docx");
  const [title, setTitle] = useState("Untitled");
  const editorRef = useRef(null);
  const [grid, setGrid] = useState(DEFAULT_GRID());
  const [aiPrompt, setAiPrompt] = useState("");
  const [aiBusy, setAiBusy] = useState(false);
  const [busy, setBusy] = useState(false);
  const [cloud, setCloud] = useState({ google: false, onedrive: false });
  const [cloudMsg, setCloudMsg] = useState(null);
  const [picker, setPicker] = useState(null); // { provider } when listing
  const [fileList, setFileList] = useState([]);
  const [listBusy, setListBusy] = useState(false);
  const [searchQ, setSearchQ] = useState("");
  const [openedCloud, setOpenedCloud] = useState(null); // { id, name, provider, mime }

  const refreshCloudStatus = async () => {
    const ids = [GOOGLE_DRIVE_CONNECTOR_ID, ONEDRIVE_CONNECTOR_ID].filter(Boolean);
    if (ids.length === 0) return;
    try {
      const res = await cloudConnection({ connector_ids: ids });
      const s = res?.data?.status || {};
      setCloud({
        google: !!s[GOOGLE_DRIVE_CONNECTOR_ID],
        onedrive: !!s[ONEDRIVE_CONNECTOR_ID],
      });
    } catch { /* ignore */ }
  };

  useEffect(() => {
    if (!open) return;
    refreshCloudStatus();
  }, [open]);

  // Natural-language command dispatch from the assistant
  useEffect(() => {
    if (!open || !command) return;
    const { action, provider, filename } = command;
    if (action === "open_file") openFromCloud(provider || "google", filename || "");
    else if (action === "open_file_by_id") loadFile(command.file, provider || "google");
    else if (action === "list_cloud_files") openPicker(provider || "google");
    else if (action === "save_to_cloud") saveToCloudProvider(provider || "google", true);
    onCommandDone?.();
  }, [command, open]);

  if (!open) return null;

  const exec = (cmd, val) => {
    document.execCommand(cmd, false, val);
    editorRef.current?.focus();
  };

  const getBlob = async () => {
    if (type === "docx") {
      const paragraphs = htmlToParagraphs(editorRef.current);
      const doc = new DocxDocument({ sections: [{ children: paragraphs }] });
      const blob = await Packer.toBlob(doc);
      return { blob, mime: "application/vnd.openxmlformats-officedocument.wordprocessingml.document", ext: "docx" };
    }
    const wb = new ExcelJS.Workbook();
    const ws = wb.addWorksheet("Sheet1");
    grid.forEach((row, r) => {
      row.forEach((val, c) => {
        const cell = ws.getCell(r + 1, c + 1);
        const num = Number(val);
        cell.value = val !== "" && !isNaN(num) ? num : val;
      });
    });
    const buffer = await wb.xlsx.writeBuffer();
    return {
      blob: new Blob([buffer], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" }),
      mime: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      ext: "xlsx",
    };
  };

  const download = async () => {
    setBusy(true);
    try {
      const { blob, ext } = await getBlob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `${title || "Untitled"}.${ext}`;
      a.click();
      URL.revokeObjectURL(url);
    } finally { setBusy(false); }
  };

  const ensureConnected = async (provider) => {
    const id = PROVIDER_ID(provider);
    if (!id) { setCloudMsg("Connector setup still in progress — add OAuth credentials and I'll wire the IDs."); return null; }
    if (cloud[provider]) return id;
    const url = await base44.connectors.connectAppUser(id);
    const popup = window.open(url, "_blank");
    await new Promise((resolve) => {
      const timer = setInterval(() => {
        if (!popup || popup.closed) { clearInterval(timer); resolve(); }
      }, 600);
    });
    await refreshCloudStatus();
    return cloud[provider] ? id : id;
  };

  const openPicker = async (provider) => {
    const id = await ensureConnected(provider);
    if (!id) return;
    setPicker({ provider });
    setSearchQ("");
    await loadFiles(provider, "");
  };

  const loadFiles = async (provider, query) => {
    setListBusy(true);
    try {
      const res = await listCloudFiles({ provider, connector_id: PROVIDER_ID(provider), query });
      setFileList(res?.data?.files || []);
    } catch (e) {
      setCloudMsg("Could not list files: " + (e?.message || ""));
    } finally { setListBusy(false); }
  };

  const openFromCloud = async (provider, filename) => {
    const id = await ensureConnected(provider);
    if (!id) return;
    setBusy(true);
    setCloudMsg(null);
    try {
      const res = await listCloudFiles({ provider, connector_id: id, query: filename });
      const files = res?.data?.files || [];
      if (files.length === 0) {
        setCloudMsg(`No files matching "${filename}" found on ${provider === "google" ? "Google Drive" : "OneDrive"}.`);
        setPicker({ provider });
        setFileList([]);
        return;
      }
      const match = filename
        ? files.find((f) => f.name.toLowerCase().includes(filename.toLowerCase())) || files[0]
        : files[0];
      await loadFile(match, provider);
    } catch (e) {
      setCloudMsg("Open failed: " + (e?.message || ""));
    } finally { setBusy(false); }
  };

  const loadFile = async (file, provider) => {
    setBusy(true);
    setCloudMsg(null);
    try {
      const res = await getCloudFile({ provider, connector_id: PROVIDER_ID(provider), file_id: file.id, mime: file.mime });
      const b64 = res?.data?.base64;
      const mime = res?.data?.mime || file.mime || "";
      const arrayBuffer = base64ToArrayBuffer(b64);
      const isExcel = mime.includes("spreadsheet") || file.name.toLowerCase().endsWith(".xlsx");
      if (isExcel) {
        setType("xlsx");
        const wb = new ExcelJS.Workbook();
        await wb.xlsx.load(arrayBuffer);
        const ws = wb.worksheets[0];
        const rows = [];
        if (ws) {
          ws.eachRow({ includeEmpty: true }, (row) => {
            const vals = [];
            row.eachCell({ includeEmpty: true }, (cell) => {
              const v = cell.value;
              vals.push(v === null || v === undefined ? "" : String(v));
            });
            rows.push(vals);
          });
        }
        setGrid(rows.length ? rows : DEFAULT_GRID());
      } else {
        setType("docx");
        const result = await mammoth.convertToHtml({ arrayBuffer });
        if (editorRef.current) editorRef.current.innerHTML = result.value || "<p></p>";
      }
      const baseName = file.name.replace(/\.(docx|xlsx)$/i, "");
      setTitle(baseName);
      setOpenedCloud({ id: file.id, name: file.name, provider, mime: file.mime });
      setPicker(null);
      setCloudMsg(`Opened "${file.name}" from ${provider === "google" ? "Google Drive" : "OneDrive"}.`);
    } catch (e) {
      setCloudMsg("Could not open file: " + (e?.message || ""));
    } finally { setBusy(false); }
  };

  const saveToCloudProvider = async (provider, isCommand = false) => {
    const id = await ensureConnected(provider);
    if (!id) return;
    setBusy(true);
    setCloudMsg(null);
    try {
      const { blob, ext, mime } = await getBlob();
      const fileName = openedCloud?.name || `${title}.${ext}`;
      const up = await base44.integrations.Core.UploadFile({ file: new File([blob], fileName) });
      const fileUrl = up?.file_url;
      const res = await saveToCloud({
        file_url: fileUrl,
        name: fileName,
        provider,
        connector_id: id,
        file_id: openedCloud?.provider === provider ? openedCloud.id : undefined,
      });
      const link = res?.data?.link;
      setCloudMsg(link ? `${res?.data?.updated ? "Updated" : "Saved"} "${fileName}" to ${provider === "google" ? "Google Drive" : "OneDrive"} ✓` : "Saved.");
      if (res?.data?.updated && openedCloud) {
        setOpenedCloud({ ...openedCloud, provider });
      } else if (res?.data?.id) {
        setOpenedCloud({ id: res.data.id, name: fileName, provider, mime });
      }
      onSaved?.();
    } catch (e) {
      setCloudMsg("Cloud save failed: " + (e?.message || "try reconnecting."));
    } finally { setBusy(false); }
  };

  const aiEdit = async () => {
    if (!aiPrompt.trim() || aiBusy) return;
    setAiBusy(true);
    setCloudMsg(null);
    try {
      if (type === "docx") {
        const html = editorRef.current.innerHTML;
        const res = await base44.integrations.Core.InvokeLLM({
          prompt: `Edit the following HTML document content per the instructions. Return ONLY the edited HTML, preserving tags (<h1>,<h2>,<p>,<b>,<i>,<u>,<ul>,<ol>,<li>). Do not wrap in a code fence.\n\nInstructions: """${aiPrompt}"""\n\nHTML:\n${html}`,
          response_json_schema: { type: "object", properties: { html: { type: "string" } }, required: ["html"] },
        });
        editorRef.current.innerHTML = res.html || html;
      } else {
        const csv = grid.map((r) => r.map((c) => `"${(c || "").replace(/"/g, '""')}"`).join(",")).join("\n");
        const res = await base44.integrations.Core.InvokeLLM({
          prompt: `Edit the following CSV data per the instructions. Return ONLY valid CSV with the same column structure, no explanation.\n\nInstructions: """${aiPrompt}"""\n\nCSV:\n${csv}`,
          response_json_schema: { type: "object", properties: { csv: { type: "string" } }, required: ["csv"] },
        });
        const rows = parseCSV(res.csv || csv);
        const cols = Math.max(...rows.map((r) => r.length), grid[0].length);
        const normalized = rows.map((r) => {
          const row = [...r];
          while (row.length < cols) row.push("");
          return row;
        });
        setGrid(normalized);
      }
      setAiPrompt("");
    } catch (e) {
      setCloudMsg("AI edit failed: " + (e?.message || "unknown error"));
    } finally { setAiBusy(false); }
  };

  const setCell = (r, c, val) => {
    setGrid((g) => g.map((row, ri) => (ri === r ? row.map((cell, ci) => (ci === c ? val : cell)) : row)));
  };
  const addRow = () => setGrid((g) => [...g, Array.from({ length: g[0].length }, () => "")]);
  const addCol = () => setGrid((g) => g.map((row) => [...row, ""]));
  const delRow = () => setGrid((g) => (g.length > 1 ? g.slice(0, -1) : g));
  const delCol = () => setGrid((g) => (g[0].length > 1 ? g.map((row) => row.slice(0, -1)) : g));

  const colName = (i) => String.fromCharCode(65 + i);

  const Tool = ({ icon: Icon, cmd, val, label }) => (
    <button type="button" title={label} onMouseDown={(e) => e.preventDefault()} onClick={() => exec(cmd, val)}>
      <Icon size={16} />
    </button>
  );

  return (
    <div className="modal-backdrop" role="presentation" onMouseDown={onClose}>
      <div className="modal office-modal" role="dialog" aria-modal="true" onMouseDown={(e) => e.stopPropagation()}>
        <button className="modal-close" onClick={onClose}><X size={20} /></button>
        <div className="office-head">
          <div className="office-type-switch">
            <button className={type === "docx" ? "active" : ""} onClick={() => setType("docx")}><FileText size={16} /> Word</button>
            <button className={type === "xlsx" ? "active" : ""} onClick={() => setType("xlsx")}><Sheet size={16} /> Excel</button>
          </div>
          <input className="office-title" value={title} onChange={(e) => setTitle(e.target.value)} placeholder="File name" />
        </div>

        {picker && (
          <div className="cloud-picker">
            <div className="picker-head">
              <strong><FolderOpen size={16} /> Open from {picker.provider === "google" ? "Google Drive" : "OneDrive"}</strong>
              <button onClick={() => setPicker(null)}><X size={16} /></button>
            </div>
            <div className="picker-search">
              <Search size={15} />
              <input value={searchQ} onChange={(e) => setSearchQ(e.target.value)} placeholder="Search files…" onKeyDown={(e) => e.key === "Enter" && loadFiles(picker.provider, searchQ)} />
              <button className="outline-button" onClick={() => loadFiles(picker.provider, searchQ)} disabled={listBusy}>{listBusy ? <Loader2 size={14} className="animate-spin" /> : "Search"}</button>
            </div>
            <div className="picker-list">
              {fileList.length === 0 && !listBusy && <p className="empty">No files found. Try a different search.</p>}
              {fileList.map((f) => (
                <button key={f.id} className="picker-item" onClick={() => loadFile(f, picker.provider)}>
                  <FileText size={16} />
                  <span>{f.name}</span>
                </button>
              ))}
            </div>
          </div>
        )}

        {type === "docx" ? (
          <>
            <div className="office-toolbar">
              <Tool icon={Bold} cmd="bold" label="Bold" />
              <Tool icon={Italic} cmd="italic" label="Italic" />
              <Tool icon={Underline} cmd="underline" label="Underline" />
              <span className="tb-sep" />
              <Tool icon={Heading1} cmd="formatBlock" val="h1" label="Heading 1" />
              <Tool icon={Heading2} cmd="formatBlock" val="h2" label="Heading 2" />
              <Tool icon={Pilcrow} cmd="formatBlock" val="p" label="Paragraph" />
              <span className="tb-sep" />
              <Tool icon={List} cmd="insertUnorderedList" label="Bullets" />
              <Tool icon={ListOrdered} cmd="insertOrderedList" label="Numbered" />
              <span className="tb-sep" />
              <Tool icon={AlignLeft} cmd="justifyLeft" label="Align left" />
              <Tool icon={AlignCenter} cmd="justifyCenter" label="Center" />
              <Tool icon={AlignRight} cmd="justifyRight" label="Align right" />
            </div>
            <div
              className="office-doc"
              ref={editorRef}
              contentEditable
              suppressContentEditableWarning
              dangerouslySetInnerHTML={{ __html: "<h1>Untitled</h1><p>Start writing here…</p>" }}
            />
          </>
        ) : (
          <div className="office-sheet">
            <div className="sheet-tools">
              <button onClick={addRow}><Plus size={14} /> Row</button>
              <button onClick={addCol}><Plus size={14} /> Col</button>
              <button onClick={delRow}><Trash2 size={14} /> Row</button>
              <button onClick={delCol}><Trash2 size={14} /> Col</button>
            </div>
            <div className="sheet-scroll">
              <table className="sheet-table">
                <thead>
                  <tr><th />{grid[0].map((_, c) => <th key={c}>{colName(c)}</th>)}</tr>
                </thead>
                <tbody>
                  {grid.map((row, r) => (
                    <tr key={r}>
                      <th>{r + 1}</th>
                      {row.map((val, c) => (
                        <td key={c}>
                          <input value={val} onChange={(e) => setCell(r, c, e.target.value)} />
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

        <div className="office-ai">
          <input value={aiPrompt} onChange={(e) => setAiPrompt(e.target.value)} placeholder={`Tell the AI how to edit this ${type === "docx" ? "document" : "sheet"}…`} onKeyDown={(e) => e.key === "Enter" && aiEdit()} />
          <button className="primary-button" onClick={aiEdit} disabled={aiBusy || !aiPrompt.trim()}>
            {aiBusy ? <Loader2 size={16} className="animate-spin" /> : <Sparkles size={16} />} AI edit
          </button>
        </div>

        <div className="office-actions">
          <button className="outline-button" onClick={() => openPicker("google")} disabled={busy}>
            <FolderOpen size={16} /> Open Google
          </button>
          <button className="outline-button" onClick={() => openPicker("onedrive")} disabled={busy}>
            <FolderOpen size={16} /> Open OneDrive
          </button>
          <button className="outline-button" onClick={download} disabled={busy}>
            <Download size={16} /> Download
          </button>
          <button className="outline-button" onClick={() => saveToCloudProvider("google")} disabled={busy}>
            {cloud.google ? <Cloud size={16} /> : <CloudOff size={16} />} Google Drive
          </button>
          <button className="outline-button" onClick={() => saveToCloudProvider("onedrive")} disabled={busy}>
            {cloud.onedrive ? <Cloud size={16} /> : <CloudOff size={16} />} OneDrive
          </button>
          {busy && <Loader2 size={16} className="animate-spin" />}
        </div>
        {cloudMsg && <div className="office-msg">{cloudMsg}</div>}
        {!GOOGLE_DRIVE_CONNECTOR_ID && !ONEDRIVE_CONNECTOR_ID && (
          <div className="office-msg">Cloud open/save will activate once you add Google/Microsoft OAuth credentials to the connectors I registered.</div>
        )}
      </div>
    </div>
  );
}