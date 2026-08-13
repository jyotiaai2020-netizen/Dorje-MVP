import { useState, useEffect, useRef } from "react";
import { base44 } from "@/api/base44Client";
import { interpretCommand } from "@/functions/interpretCommand";
import { createDocument } from "@/functions/createDocument";
import { editDocument } from "@/functions/editDocument";
import { sendWorkspaceEmail } from "@/functions/sendWorkspaceEmail";
import { extractDocumentText } from "@/services/workspaceAttachment";
import { studentLadApi } from "@/services/studentLadApi";
import OfficeEditor from "@/components/OfficeEditor";
import CloudBrowser from "@/components/CloudBrowser";
import {
  Bot, UserRound, Send, Mic, MicOff, Sparkles, FileText, Download,
  Pencil, X, Mail, Paperclip, RefreshCw, Plus, Loader2
} from "lucide-react";

const QUICK = [
  "Create a Python script to reverse a string",
  "Draft an email to my teacher about a missed class",
  "Make markdown study notes on photosynthesis",
  "List my documents",
];

export default function WorkspaceAssistant() {
  const [messages, setMessages] = useState([
    { role: "dorje", text: "Hi Maya! I can create documents, edit them, draft & send emails, and list your files. Try a command below or tap the mic and speak." },
  ]);
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const [listening, setListening] = useState(false);
  const [documents, setDocuments] = useState([]);
  const [selected, setSelected] = useState(null);
  const [emailDraft, setEmailDraft] = useState(null);
  const [sending, setSending] = useState(false);
  const [aiBusy, setAiBusy] = useState(false);
  const [aiHint, setAiHint] = useState("");
  const [aiAsk, setAiAsk] = useState(false);
  const userChatText = messages.filter((m) => m.role === "user").map((m) => m.text).join("\n").trim();
  const [officeOpen, setOfficeOpen] = useState(false);
  const [officeCommand, setOfficeCommand] = useState(null);
  const [attachment, setAttachment] = useState(null);
  const [uploading, setUploading] = useState(false);
  const recognitionRef = useRef(null);
  const messagesEndRef = useRef(null);
  const fileInputRef = useRef(null);

  useEffect(() => {
    const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SR) return;
    const rec = new SR();
    rec.continuous = false;
    rec.interimResults = true;
    rec.lang = "en-US";
    rec.onresult = (e) => {
      const t = Array.from(e.results).map((r) => r[0].transcript).join("");
      setInput(t);
    };
    rec.onend = () => setListening(false);
    rec.onerror = () => setListening(false);
    recognitionRef.current = rec;
  }, []);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  const loadDocs = async () => {
    try {
      const docs = await base44.entities.Document.list("-created_date", 50);
      setDocuments(docs);
    } catch { /* ignore */ }
  };
  useEffect(() => { loadDocs(); }, []);

  const toggleMic = () => {
    const rec = recognitionRef.current;
    if (!rec) { alert("Voice input isn't supported in this browser. Try Chrome or Edge."); return; }
    if (listening) { rec.stop(); setListening(false); }
    else { try { rec.start(); setListening(true); } catch { /* already started */ } }
  };

  const addMsg = (role, text) => setMessages((m) => [...m, { role, text }]);

  const runCommand = async (command) => {
    if (!command.trim() || busy) return;
    addMsg("user", command);
    setInput("");
    setBusy(true);
    try {
      const res = await interpretCommand({ command });
      const a = res?.data?.action;
      if (!a) { addMsg("dorje", "I couldn't parse that command."); return; }
      switch (a.action) {
        case "create_document": {
          const name = a.title || "Untitled";
          const cr = await createDocument({ name, content: a.content || "", file_type: a.file_type || "txt", area: "Workspace" });
          await loadDocs();
          const doc = cr?.data?.document;
          if (doc) setSelected(doc);
          addMsg("dorje", `Created "${name}" (.${a.file_type || "txt"}). It's saved — open it below to edit or download.`);
          break;
        }
        case "edit_document": {
          if (!selected) { addMsg("dorje", "Open a document first, then tell me how to edit it."); break; }
          const er = await editDocument({ content: selected.content, edit_prompt: a.edit_prompt || command });
          const newContent = er?.data?.content ?? "";
          await base44.entities.Document.update(selected.id, { content: newContent });
          setSelected({ ...selected, content: newContent });
          setDocuments((ds) => ds.map((d) => (d.id === selected.id ? { ...d, content: newContent } : d)));
          addMsg("dorje", "Updated the document with your changes.");
          break;
        }
        case "send_email": {
          setEmailDraft({ to: a.to || "", subject: a.subject || "", body: a.body || "", attachment_name: a.attachment_name || "" });
          addMsg("dorje", `Drafted an email to ${a.to || "—"}. Review and send it below.`);
          break;
        }
        case "list_documents": {
          await loadDocs();
          addMsg("dorje", `You have ${documents.length} document(s). They're listed below.`);
          break;
        }
        case "open_file": {
          setOfficeCommand({ action: "open_file", provider: a.provider || "google", filename: a.filename || "" });
          setOfficeOpen(true);
          addMsg("dorje", `Opening "${a.filename || "a file"}" from ${a.provider === "onedrive" ? "OneDrive" : "Google Drive"}…`);
          break;
        }
        case "save_to_cloud": {
          setOfficeCommand({ action: "save_to_cloud", provider: a.provider || "google" });
          addMsg("dorje", `Saving the open file to ${a.provider === "onedrive" ? "OneDrive" : "Google Drive"}…`);
          break;
        }
        case "list_cloud_files": {
          setOfficeCommand({ action: "list_cloud_files", provider: a.provider || "google" });
          setOfficeOpen(true);
          addMsg("dorje", `Opening your ${a.provider === "onedrive" ? "OneDrive" : "Google Drive"} files…`);
          break;
        }
        default:
          addMsg("dorje", a.reply || "Done.");
      }
    } catch (e) {
      addMsg("dorje", "Something went wrong: " + (e?.message || "unknown error"));
    } finally {
      setBusy(false);
    }
  };

  const handleAttach = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploading(true);
    try {
      const extracted = await extractDocumentText(file);
      setAttachment({ name: extracted.name, extractedText: extracted.text, contentType: extracted.type });
      addMsg("dorje", `Extracted text from "${extracted.name}" locally (${extracted.text.length.toLocaleString()} characters). The raw document remains in this browser. Ask me to review it when ready.`);
    } catch (err) {
      setAttachment(null);
      addMsg("dorje", "Attachment failed: " + (err?.message || "the selected document could not be read locally"));
    } finally {
      setUploading(false);
      if (e.target) e.target.value = "";
    }
  };

  const runAttachment = async (instruction) => {
    if (!attachment) return;
    const prompt = instruction
      ? `${instruction}\n\nAlso provide a brief summary, key points, and suggested next steps for this document.`
      : `Review this document and provide: 1) a concise summary, 2) key points, and 3) suggested next steps.`;
    addMsg("user", `${instruction || "Attached a file"} — ${attachment.name}`);
    setBusy(true);
    try {
      const res = await studentLadApi.attachments.analyze({
        filename: attachment.name,
        instruction: prompt,
        text_content: attachment.extractedText,
        content_type: attachment.contentType,
      });
      const text = typeof res === "string" ? res : res?.data?.response || res?.response || "I couldn't read that file.";
      addMsg("dorje", text);
    } catch (e) {
      addMsg("dorje", "Couldn't read the attachment: " + (e?.message || "unknown error"));
    } finally {
      setBusy(false);
    }
  };

  const send = () => {
    const text = input.trim();
    if (!text && !attachment) return;
    if (attachment) runAttachment(text);
    else runCommand(text);
    setInput("");
  };

  const openCloudFile = (file, provider) => {
    setOfficeCommand({ action: "open_file_by_id", file, provider });
    setOfficeOpen(true);
  };

  const download = (doc) => {
    const blob = new Blob([doc.content || ""], { type: "text/plain;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${doc.name}.${doc.file_type || "txt"}`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const saveEdits = async () => {
    if (!selected) return;
    await base44.entities.Document.update(selected.id, { content: selected.content });
    setDocuments((ds) => ds.map((d) => (d.id === selected.id ? { ...d, content: selected.content } : d)));
    addMsg("dorje", `Saved edits to ${selected.name}.`);
  };

  const doSendEmail = async () => {
    if (!emailDraft.to || !emailDraft.subject) return;
    setSending(true);
    try {
      await sendWorkspaceEmail(emailDraft);
      addMsg("dorje", `Email sent to ${emailDraft.to}.`);
      setEmailDraft(null);
    } catch (e) {
      addMsg("dorje", "Email failed: " + (e?.message || "make sure the recipient is a registered app user."));
    } finally {
      setSending(false);
    }
  };

  const writeWithAI = async () => {
    const context = userChatText || aiHint.trim();
    if (!context) { setAiAsk(true); return; }
    setAiBusy(true);
    try {
      const prompt =
        `Write a concise, professional email. Recipient: ${emailDraft.to || "the recipient"}. Subject: ${emailDraft.subject || ""}. ` +
        `${emailDraft.attachment_name ? `The email attaches a document named "${emailDraft.attachment_name}". ` : ""}` +
        `Context from the user: """${context}""". Return only the email body text, ready to send.`;
      const res = await base44.integrations.Core.InvokeLLM({ prompt });
      const body = typeof res === "string" ? res : res?.data?.response || res?.response || "";
      setEmailDraft((d) => ({ ...d, body: body || d.body }));
      setAiAsk(false);
      setAiHint("");
    } catch (e) {
      addMsg("dorje", "AI drafting failed: " + (e?.message || "unknown error"));
    } finally {
      setAiBusy(false);
    }
  };

  return (
    <div className="page workspace-page">
      <div className="page-heading">
        <div><h2>Workspace AI</h2><p>Speak or type — create files, edit them, and send email.</p></div>
        <span className="status blue"><Sparkles size={14} /> Voice + text</span>
        <button className="coral-button" onClick={() => setOfficeOpen(true)}><Plus size={16} /> New Word / Excel</button>
      </div>

      <div className="workspace-assistant-grid">
        <section className="card chat-panel">
          <h3>Ask Dorje</h3>
          <div className="messages">
            {messages.map((m, i) => (
              <div className={"message " + m.role} key={i}>
                {m.role === "dorje" ? <Bot /> : <UserRound />}
                <p>{m.text}</p>
              </div>
            ))}
            <div ref={messagesEndRef} />
          </div>
          <div className="quick-chips">
            {QUICK.map((q) => (
              <button key={q} onClick={() => runCommand(q)} disabled={busy}>{q}</button>
            ))}
          </div>
          {attachment && (
            <div className="attach-chip">
              <Paperclip size={14} /> {attachment.name}
              <button onClick={() => setAttachment(null)} title="Remove"><X size={14} /></button>
            </div>
          )}
          {attachment && (
            <div className="quick-chips">
              <button onClick={() => runAttachment("Summarize this document")} disabled={busy}>Summarize</button>
              <button onClick={() => runAttachment("Extract the key points")} disabled={busy}>Key points</button>
              <button onClick={() => runAttachment("Suggest next steps")} disabled={busy}>Suggest next steps</button>
            </div>
          )}
          <div className="composer">
            <button className="mic-button" onClick={toggleMic} title="Voice command">
              {listening ? <MicOff size={20} /> : <Mic size={20} />}
              {listening && <span className="listening-dot" />}
            </button>
            <button className="attach-button" onClick={() => fileInputRef.current?.click()} title="Attach file" disabled={uploading}>
              {uploading ? <Loader2 size={20} className="animate-spin" /> : <Paperclip size={20} />}
            </button>
            <input ref={fileInputRef} type="file" onChange={handleAttach} style={{ display: "none" }} />
            <textarea
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); send(); } }}
              placeholder={attachment ? "Ask about the attachment (or just send to summarize)…" : listening ? "Listening…" : "Type or speak a command…"}
            />
            <button className="send-button" onClick={send} disabled={busy || (!input.trim() && !attachment)} title="Send">
              {busy ? <RefreshCw size={18} className="animate-spin" /> : <Send size={18} />}
            </button>
          </div>
        </section>

        <section className="card docs-panel">
          <div className="card-head">
            <h3>My Documents</h3>
            <button onClick={loadDocs} title="Refresh"><RefreshCw size={15} /></button>
          </div>
          {documents.length === 0 && <p className="empty">No documents yet. Ask me to create one.</p>}
          <div className="docs-list">
            {documents.map((d) => (
              <button key={d.id} className={selected?.id === d.id ? "selected" : ""} onClick={() => setSelected(d)}>
                <FileText size={16} />
                <span><strong>{d.name}</strong><small>.{d.file_type || "txt"}</small></span>
              </button>
            ))}
          </div>
          {selected && (
            <div className="doc-viewer">
              <div className="doc-viewer-head">
                <strong>{selected.name}.{selected.file_type || "txt"}</strong>
                <div className="doc-viewer-actions">
                  <button onClick={() => download(selected)}><Download size={15} /> Download</button>
                  <button onClick={() => { setEmailDraft({ to: "", subject: selected.name, body: "", attachment_name: selected.name }); setAiAsk(false); setAiHint(""); }}><Mail size={15} /> Attach to email</button>
                  <button onClick={() => setSelected(null)}><X size={15} /></button>
                </div>
              </div>
              <textarea
                className="doc-content"
                value={selected.content || ""}
                onChange={(e) => setSelected({ ...selected, content: e.target.value })}
              />
              <button className="outline-button" onClick={saveEdits}><Pencil size={15} /> Save edits</button>
            </div>
          )}
        </section>

        <CloudBrowser onOpenFile={openCloudFile} />

        {emailDraft && (
          <section className="card email-panel">
            <div className="card-head">
              <h3><Mail size={16} /> Email draft</h3>
              <button onClick={() => setEmailDraft(null)}><X size={15} /></button>
            </div>
            <label>To<input value={emailDraft.to} onChange={(e) => setEmailDraft({ ...emailDraft, to: e.target.value })} placeholder="registered user email" /></label>
            <label>Subject<input value={emailDraft.subject} onChange={(e) => setEmailDraft({ ...emailDraft, subject: e.target.value })} /></label>
            <label>Body<textarea value={emailDraft.body} onChange={(e) => setEmailDraft({ ...emailDraft, body: e.target.value })} rows={5} /></label>
            <div className="email-ai-row">
              <button className="outline-button" onClick={writeWithAI} disabled={aiBusy}>
                {aiBusy ? <Loader2 size={15} className="animate-spin" /> : <Sparkles size={15} />} Write with AI
              </button>
            </div>
            {aiAsk && !userChatText && (
              <div className="email-ai-ask">
                <p>Tell me what the email should cover:</p>
                <textarea value={aiHint} onChange={(e) => setAiHint(e.target.value)} rows={3} placeholder="e.g. Apologize for missing class and ask for the makeup work" />
                <button className="coral-button" onClick={writeWithAI} disabled={aiBusy || !aiHint.trim()}>Generate</button>
              </div>
            )}
            {emailDraft.attachment_name && (
              <div className="attach-note"><Paperclip size={14} /> Attaching: {emailDraft.attachment_name}</div>
            )}
            <div className="email-note">Recipients must be registered app users.</div>
            <button className="coral-button" onClick={doSendEmail} disabled={sending || !emailDraft.to}>
              {sending ? "Sending…" : "Send email"}
            </button>
          </section>
        )}
      </div>
      <OfficeEditor
        open={officeOpen}
        onClose={() => { setOfficeOpen(false); setOfficeCommand(null); }}
        onSaved={loadDocs}
        command={officeCommand}
        onCommandDone={() => setOfficeCommand(null)}
      />
    </div>
  );
}
