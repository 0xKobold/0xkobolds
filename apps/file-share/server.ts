/**
 * 0xKobold Hub - Unified Pi-Dasua Communication
 * Features: Files, Clipboard, Notes, Terminal, File Request
 */

import { createServer } from "http";
import { readdir, stat, readFile, writeFile, mkdir } from "fs/promises";
import { join, extname } from "path";
import { WebSocketServer, WebSocket } from "ws";
import { spawn } from "child_process";

const PORT = 8080;
const SHARE_PATH = "/mnt/5tb";
const HOST = "100.65.167.97";
const NOTE_FILE = "/mnt/5tb/notes.md";
const CLIPBOARD_FILE = "/tmp/clipboard-sync.txt";

// State
const clients = new Set<WebSocket>();
const terminals = new Map<string, any>();
let lastFiles: string[] = [];
let lastClipboard = "";

// Helpers
async function getFiles(dirPath: string) {
  try {
    const entries = await readdir(dirPath, { withFileTypes: true });
    return (await Promise.all(entries.map(async (e) => {
      const p = join(dirPath, e.name);
      try {
        const s = await stat(p);
        return { name: e.name, path: p.replace(SHARE_PATH, ''), size: s.size, isDirectory: e.isDirectory(), modified: s.mtime.toISOString() };
      } catch { return null; }
    }))).filter(Boolean).sort((a, b) => {
      if (a!.isDirectory !== b!.isDirectory) return a!.isDirectory ? -1 : 1;
      return a!.name.localeCompare(b!.name);
    });
  } catch { return []; }
}

async function getClipboard() {
  try { return await readFile(CLIPBOARD_FILE, "utf-8"); } catch { return ""; }
}

async function getNotes() {
  try { return await readFile(NOTE_FILE, "utf-8"); } catch { return ""; }
}

function broadcast(msg: object) {
  const data = JSON.stringify(msg);
  clients.forEach(c => { if (c.readyState === WebSocket.OPEN) c.send(data); });
}

async function checkChanges() {
  const files = await readdir(SHARE_PATH);
  if (JSON.stringify(files) !== JSON.stringify(lastFiles)) {
    lastFiles = files;
    broadcast({ type: "files", data: await getFiles(SHARE_PATH) });
  }
  const clip = await getClipboard();
  if (clip !== lastClipboard) {
    lastClipboard = clip;
    broadcast({ type: "clipboard", data: clip });
  }
}

// HTTP Server
const server = createServer(async (req, res) => {
  const url = new URL(req.url, `http://${HOST}:${PORT}`);
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");

  if (req.method === "OPTIONS") { res.writeHead(200); res.end(); return; }

  // Serve UI
  if (url.pathname === "/" || url.pathname === "/index.html") {
    res.writeHead(200, { "Content-Type": "text/html" });
    res.end(getHTML());
    return;
  }

  // === API: Files ===
  if (url.pathname === "/api/files") {
    res.writeHead(200, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ files: await getFiles(SHARE_PATH) }));
    return;
  }

  if (url.pathname.startsWith("/api/download/")) {
    const fp = decodeURIComponent(url.pathname.replace("/api/download/", ""));
    try {
      const data = await readFile(join(SHARE_PATH, fp));
      res.writeHead(200, { "Content-Type": "application/octet-stream", "Content-Disposition": `attachment; filename="${encodeURIComponent(fp.split('/').pop())}"` });
      res.end(data);
    } catch { res.writeHead(404); res.end("Not found"); }
    return;
  }

  if (url.pathname === "/api/upload" && req.method === "POST") {
    let body = ""; req.on("data", c => body += c);
    req.on("end", async () => {
      try {
        const { path: fp, content } = JSON.parse(body);
        const fullPath = join(SHARE_PATH, fp);
        await mkdir(join(SHARE_PATH, fp.split('/').slice(0, -1).join('/')), { recursive: true });
        await writeFile(fullPath, Buffer.from(content, "base64"));
        broadcast({ type: "files", data: await getFiles(SHARE_PATH) });
        res.writeHead(200); res.end(JSON.stringify({ success: true }));
      } catch (e) { res.writeHead(500); res.end(JSON.stringify({ error: String(e) })); }
    });
    return;
  }

  // === API: Clipboard ===
  if (url.pathname === "/api/clipboard" && req.method === "GET") {
    res.writeHead(200, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ clipboard: await getClipboard() }));
    return;
  }

  // === API: Status (for Mission Control widget) ===
  if (url.pathname === "/api/status" && req.method === "GET") {
    res.writeHead(200, { "Content-Type": "application/json" });
    res.end(JSON.stringify({
      connected: true,
      clipboard: await getClipboard(),
      notes: await getNotes(),
      terminalSessions: Array.from(terminals.entries()).map(([id, data]) => ({ id, created: data.created })),
    }));
    return;
  }

  if (url.pathname === "/api/clipboard" && req.method === "POST") {
    let body = ""; req.on("data", c => body += c);
    req.on("end", async () => {
      try {
        const { content } = JSON.parse(body);
        await writeFile(CLIPBOARD_FILE, content);
        lastClipboard = content;
        broadcast({ type: "clipboard", data: content });
        res.writeHead(200); res.end(JSON.stringify({ success: true }));
      } catch (e) { res.writeHead(500); res.end(JSON.stringify({ error: String(e) })); }
    });
    return;
  }

  // === API: Notes ===
  if (url.pathname === "/api/notes" && req.method === "GET") {
    res.writeHead(200, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ notes: await getNotes() }));
    return;
  }

  if (url.pathname === "/api/notes" && req.method === "POST") {
    let body = ""; req.on("data", c => body += c);
    req.on("end", async () => {
      try {
        const { content } = JSON.parse(body);
        await writeFile(NOTE_FILE, content);
        broadcast({ type: "notes", data: content });
        res.writeHead(200); res.end(JSON.stringify({ success: true }));
      } catch (e) { res.writeHead(500); res.end(JSON.stringify({ error: String(e) })); }
    });
    return;
  }

  // === API: Terminal ===
  if (url.pathname === "/api/terminal/create" && req.method === "POST") {
    const id = Math.random().toString(36).slice(2, 10);
    const tmux = spawn("tmux", ["new-session", "-d", "-s", `hub-${id}`], { shell: true });
    
    tmux.on("close", () => terminals.delete(id));
    terminals.set(id, { created: Date.now() });
    
    res.writeHead(200, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ id, url: `/terminal/${id}` }));
    return;
  }

  if (url.pathname.startsWith("/api/terminal/") && req.method === "GET") {
    const id = url.pathname.split("/")[3];
    if (!terminals.has(id)) { res.writeHead(404); res.end("Not found"); return; }
    
    // Send tmux socket info via CSS
    const socketPath = `/tmp/tmux-1000/default`;
    res.writeHead(200, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ id, socketPath }));
    return;
  }

  if (url.pathname.startsWith("/api/terminal/") && req.method === "POST") {
    const parts = url.pathname.split("/");
    const id = parts[3];
    const action = parts[4];
    
    if (!terminals.has(id)) { res.writeHead(404); res.end("Not found"); return; }
    
    let body = ""; req.on("data", c => body += c);
    req.on("end", async () => {
      try {
        const { input } = JSON.parse(body);
        if (action === "send") {
          spawn("tmux", ["send-keys", "-t", `hub-${id}`, input, "Enter"], { shell: true });
        }
        res.writeHead(200); res.end(JSON.stringify({ success: true }));
      } catch (e) { res.writeHead(500); res.end(JSON.stringify({ error: String(e) })); }
    });
    return;
  }

  // Terminal page (WebSocket terminal)
  if (url.pathname.startsWith("/terminal/")) {
    const id = url.pathname.split("/")[2];
    res.writeHead(200, { "Content-Type": "text/html" });
    res.end(getTerminalHTML(id));
    return;
  }

  // === API: File Request ===
  if (url.pathname === "/api/request") {
    const requests = [];
    try {
      const reqFile = await readFile("/tmp/file-requests.json", "utf-8");
      const parsed = JSON.parse(reqFile);
      requests.push(...(Array.isArray(parsed) ? parsed : [parsed]));
    } catch { /* no requests */ }
    res.writeHead(200, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ requests }));
    return;
  }

  if (url.pathname === "/api/request" && req.method === "POST") {
    let body = ""; req.on("data", c => body += c);
    req.on("end", async () => {
      try {
        const { from, message, timestamp } = JSON.parse(body);
        const requests = [];
        try { const existing = await readFile("/tmp/file-requests.json", "utf-8"); requests.push(...JSON.parse(existing)); } catch { /* ignore */ }
        requests.push({ from, message, timestamp, fulfilled: false });
        await writeFile("/tmp/file-requests.json", JSON.stringify(requests, null, 2));
        broadcast({ type: "request", data: { from, message, timestamp } });
        res.writeHead(200); res.end(JSON.stringify({ success: true }));
      } catch (e) { res.writeHead(500); res.end(JSON.stringify({ error: String(e) })); }
    });
    return;
  }

  res.writeHead(404); res.end("Not found");
});

// WebSocket
const wss = new WebSocketServer({ server });
wss.on("connection", async (ws) => {
  clients.add(ws);
  
  // Send initial state
  ws.send(JSON.stringify({
    type: "init",
    data: {
      files: await getFiles(SHARE_PATH),
      clipboard: await getClipboard(),
      notes: await getNotes(),
    }
  }));

  ws.on("message", async (msg) => {
    try {
      const { type, data } = JSON.parse(msg.toString());
      
      if (type === "clipboard") {
        await writeFile(CLIPBOARD_FILE, data);
        lastClipboard = data;
        broadcast({ type: "clipboard", data });
      }
      
      if (type === "notes") {
        await writeFile(NOTE_FILE, data);
        broadcast({ type: "notes", data });
      }
      
      if (type === "terminal-input" && data.id) {
        spawn("tmux", ["send-keys", "-t", `hub-${data.id}`, data.input, "Enter"], { shell: true });
      }
    } catch { /* ignore */ }
  });

  ws.on("close", () => clients.delete(ws));
  ws.on("error", () => clients.delete(ws));
});

server.listen(PORT, HOST, () => {
  console.log(`🚀 0xKobold Hub: http://${HOST}:${PORT}`);
  console.log(`📁 Files: ${SHARE_PATH}`);
});

setInterval(checkChanges, 3000);

// === HTML UI ===
function getHTML() {
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>🐉 0xKobold Hub</title>
  <style>
    :root {
      --bg: oklch(0.07 0.01 250);
      --fg: oklch(0.95 0.01 250);
      --card: oklch(0.10 0.01 250);
      --secondary: oklch(0.15 0.02 250);
      --muted: oklch(0.65 0.02 250);
      --primary: oklch(0.75 0.18 145);
      --border: oklch(0.20 0.02 250);
      --destructive: oklch(0.55 0.22 25);
    }
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body { font-family: -apple-system, sans-serif; background: var(--bg); color: var(--fg); min-height: 100vh; }

    /* Header */
    header {
      display: flex; justify-content: space-between; align-items: center;
      padding: 12px 24px; background: var(--card); border-bottom: 1px solid var(--border);
    }
    .logo { display: flex; align-items: center; gap: 10px; font-size: 1.1rem; font-weight: 600; }
    .logo-icon { font-size: 1.5rem; }
    .tabs { display: flex; gap: 4px; }
    .tab {
      padding: 8px 16px; border-radius: 8px; border: none; background: transparent;
      color: var(--muted); font-size: 0.9rem; cursor: pointer; transition: all 0.15s;
    }
    .tab:hover { background: var(--secondary); color: var(--fg); }
    .tab.active { background: var(--primary); color: var(--bg); font-weight: 500; }

    /* Main */
    main { padding: 24px; max-width: 1200px; margin: 0 auto; }
    .panel { display: none; }
    .panel.active { display: block; }

    /* Cards */
    .card {
      background: var(--card); border: 1px solid var(--border);
      border-radius: 12px; padding: 20px; margin-bottom: 20px;
    }
    .card-title { font-size: 0.75rem; font-weight: 600; text-transform: uppercase; letter-spacing: 0.05em; color: var(--muted); margin-bottom: 12px; }

    /* Upload */
    .upload-zone {
      border: 2px dashed var(--border); border-radius: 12px; padding: 40px;
      text-align: center; cursor: pointer; transition: all 0.2s;
    }
    .upload-zone:hover, .upload-zone.dragover { border-color: var(--primary); background: color-mix(in oklch, var(--primary) 5%, transparent); }
    .upload-zone input { display: none; }
    .upload-icon { font-size: 2rem; margin-bottom: 8px; }
    .upload-text { color: var(--muted); }
    .upload-text strong { color: var(--primary); }

    /* File list */
    .file-list { background: var(--card); border: 1px solid var(--border); border-radius: 12px; overflow: hidden; }
    .file-header { display: grid; grid-template-columns: 1fr 100px 160px 80px; padding: 10px 16px; background: var(--secondary); font-size: 0.7rem; font-weight: 600; text-transform: uppercase; color: var(--muted); }
    .file-row { display: grid; grid-template-columns: 1fr 100px 160px 80px; padding: 12px 16px; border-bottom: 1px solid var(--border); align-items: center; }
    .file-row:last-child { border-bottom: none; }
    .file-row:hover { background: var(--secondary); }
    .file-name { display: flex; align-items: center; gap: 10px; overflow: hidden; }
    .file-name span { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
    .file-size, .file-date { font-size: 0.85rem; color: var(--muted); }
    .btn { padding: 6px 12px; border-radius: 6px; border: none; font-size: 0.85rem; cursor: pointer; transition: all 0.15s; }
    .btn-primary { background: var(--primary); color: var(--bg); }
    .btn-ghost { background: transparent; color: var(--muted); }
    .btn-ghost:hover { background: var(--secondary); color: var(--fg); }

    /* Clipboard */
    .clipboard-box { width: 100%; min-height: 120px; background: var(--secondary); border: 1px solid var(--border); border-radius: 8px; padding: 12px; color: var(--fg); font-family: monospace; font-size: 0.9rem; resize: vertical; }
    .clipboard-actions { display: flex; gap: 8px; margin-top: 12px; justify-content: flex-end; }

    /* Notes */
    .notes-box { width: 100%; min-height: 300px; background: var(--secondary); border: 1px solid var(--border); border-radius: 8px; padding: 12px; color: var(--fg); font-size: 0.9rem; resize: vertical; }

    /* Terminal */
    .terminal-create { text-align: center; padding: 40px; }
    .terminal-id { font-size: 0.9rem; color: var(--muted); margin-top: 12px; }
    .terminal-url { background: var(--secondary); padding: 8px 16px; border-radius: 6px; font-family: monospace; margin-top: 8px; display: inline-block; }

    /* Request */
    .request-form { display: flex; gap: 12px; }
    .request-input { flex: 1; background: var(--secondary); border: 1px solid var(--border); border-radius: 8px; padding: 12px; color: var(--fg); font-size: 0.9rem; }
    .request-list { margin-top: 20px; }
    .request-item { display: flex; justify-content: space-between; align-items: center; padding: 12px 0; border-bottom: 1px solid var(--border); }
    .request-item:last-child { border-bottom: none; }
    .request-meta { font-size: 0.8rem; color: var(--muted); }
    .request.from-me .request-from { color: var(--primary); }

    /* Toast */
    .toast { position: fixed; bottom: 24px; right: 24px; padding: 12px 20px; background: var(--card); border: 1px solid var(--primary); border-radius: 8px; transform: translateY(100px); opacity: 0; transition: all 0.3s; z-index: 1000; }
    .toast.show { transform: translateY(0); opacity: 1; }

    /* Empty */
    .empty { text-align: center; padding: 40px; color: var(--muted); }
  </style>
</head>
<body>
  <header>
    <div class="logo">
      <span class="logo-icon">🐉</span>
      <span>0xKobold Hub</span>
    </div>
    <div class="tabs">
      <button class="tab active" data-tab="files">📁 Files</button>
      <button class="tab" data-tab="clipboard">📋 Clipboard</button>
      <button class="tab" data-tab="notes">📝 Notes</button>
      <button class="tab" data-tab="terminal">💻 Terminal</button>
      <button class="tab" data-tab="request">📬 Request</button>
    </div>
  </header>

  <main>
    <!-- FILES -->
    <div class="panel active" id="files">
      <div class="upload-zone" id="dropZone">
        <div class="upload-icon">📤</div>
        <div class="upload-text"><strong>Drop files</strong> to upload to /mnt/5tb</div>
        <input type="file" id="fileInput" multiple>
      </div>
      <div class="file-list">
        <div class="file-header">
          <div>Name</div><div>Size</div><div>Modified</div><div></div>
        </div>
        <div id="fileList"><div class="empty">Loading...</div></div>
      </div>
    </div>

    <!-- CLIPBOARD -->
    <div class="panel" id="clipboard">
      <div class="card">
        <div class="card-title">Shared Clipboard</div>
        <textarea class="clipboard-box" id="clipboardText" placeholder="Paste or type here... syncs in real-time!"></textarea>
        <div class="clipboard-actions">
          <button class="btn btn-ghost" onclick="copyClipboard()">📋 Copy</button>
          <button class="btn btn-primary" onclick="pasteClipboard()">📥 Paste</button>
        </div>
      </div>
      <div style="font-size: 0.8rem; color: var(--muted); text-align: center; margin-top: 12px;">
        Clipboard syncs automatically between Pi and Dasua
      </div>
    </div>

    <!-- NOTES -->
    <div class="panel" id="notes">
      <div class="card">
        <div class="card-title">Shared Notes</div>
        <textarea class="notes-box" id="notesText" placeholder="Write notes here... visible on both devices!"></textarea>
      </div>
      <div style="font-size: 0.8rem; color: var(--muted); text-align: center; margin-top: 12px;">
        Saved to /mnt/5tb/notes.md • Auto-saves on change
      </div>
    </div>

    <!-- TERMINAL -->
    <div class="panel" id="terminal">
      <div class="card">
        <div class="card-title">tmux Terminal Sessions</div>
        <div id="terminalArea">
          <div class="terminal-create">
            <p>Create a tmux session on Pi that you can attach to from Dasua.</p>
            <button class="btn btn-primary" onclick="createTerminal()" style="margin-top: 16px;">➕ Create Session</button>
            <div id="terminalInfo" style="display:none; margin-top: 16px;">
              <div class="terminal-id">Session created!</div>
              <div class="terminal-url" id="terminalUrl"></div>
              <div style="font-size: 0.8rem; color: var(--muted); margin-top: 8px;">
                Open URL on Dasua to use terminal. Pi: <code>tmux attach -t hub-[ID]</code>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>

    <!-- REQUEST -->
    <div class="panel" id="request">
      <div class="card">
        <div class="card-title">Request File from Pi</div>
        <div class="request-form">
          <input type="text" class="request-input" id="requestMsg" placeholder="Hey Pi, can you send me the config file?">
          <button class="btn btn-primary" onclick="sendRequest()">Send Request</button>
        </div>
        <div class="request-list" id="requestList"></div>
      </div>
    </div>
  </main>

  <div class="toast" id="toast"></div>

  <script>
    const ws = new WebSocket(\`ws://\${location.host}\`);
    let files = [], clipboard = "", notes = "";
    const $ = (s) => document.querySelector(s);
    const $$ = (s) => document.querySelectorAll(s);

    // Tabs
    $$('.tab').forEach(t => t.addEventListener('click', () => {
      $$('.tab').forEach(x => x.classList.remove('active'));
      $$('.panel').forEach(x => x.classList.remove('active'));
      t.classList.add('active');
      $('#' + t.dataset.tab).classList.add('active');
    }));

    // Toast
    function toast(msg) {
      $('#toast').textContent = msg;
      $('#toast').classList.add('show');
      setTimeout(() => $('#toast').classList.remove('show'), 3000);
    }

    // Files
    function renderFiles(f) {
      if (!f?.length) { $('#fileList').innerHTML = '<div class="empty">No files</div>'; return; }
      $('#fileList').innerHTML = f.map(x => \`
        <div class="file-row">
          <div class="file-name"><span>📄</span><span>\${x.name}</span></div>
          <div class="file-size">\${x.isDirectory ? '--' : formatSize(x.size)}</div>
          <div class="file-date">\${formatDate(x.modified)}</div>
          <div>\${!x.isDirectory ? \`<button class="btn btn-ghost" onclick="download('\${x.path}')">Download</button>\` : ''}</div>
        </div>
      \`).join('');
    }
    function formatSize(b) { if (!b) return '0 B'; const k=1024, s=['B','KB','MB','GB']; const i=Math.floor(Math.log(b)/Math.log(k)); return parseFloat((b/Math.pow(k,i)).toFixed(1))+' '+s[i]; }
    function formatDate(d) { return new Date(d).toLocaleDateString('en-US', {month:'short',day:'numeric',hour:'2-digit',minute:'2-digit'}); }
    function download(p) { window.open('/api/download'+p, '_blank'); }
    function uploadFile(file, path='') {
      const r = new FileReader();
      r.onload = async () => {
        const res = await fetch('/api/upload', { method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify({path: path+file.name, content: r.result.split(',')[1]}) });
        toast(res.ok ? '✓ Uploaded' : '✗ Failed');
      };
      r.readAsDataURL(file);
    }
    const dz = $('#dropZone'), fi = $('#fileInput');
    dz.addEventListener('click', () => fi.click());
    fi.addEventListener('change', () => Array.from(fi.files).forEach(f => uploadFile(f)));
    dz.addEventListener('dragover', (e) => { e.preventDefault(); dz.classList.add('dragover'); });
    dz.addEventListener('dragleave', () => dz.classList.remove('dragover'));
    dz.addEventListener('drop', (e) => { e.preventDefault(); dz.classList.remove('dragover'); Array.from(e.dataTransfer.files).forEach(f => uploadFile(f)); });

    // Clipboard
    let clipboardTimer;
    $('#clipboardText').addEventListener('input', (e) => {
      clipboard = e.target.value;
      ws.send(JSON.stringify({ type: 'clipboard', data: clipboard }));
      clearTimeout(clipboardTimer);
      clipboardTimer = setTimeout(() => fetch('/api/clipboard', {method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify({content: clipboard})}), 1000);
    });
    function copyClipboard() { navigator.clipboard.writeText(clipboard); toast('Copied!'); }
    async function pasteClipboard() { clipboard = await navigator.clipboard.readText(); $('#clipboardText').value = clipboard; ws.send(JSON.stringify({type:'clipboard', data: clipboard})); }

    // Notes
    let notesTimer;
    $('#notesText').addEventListener('input', (e) => {
      notes = e.target.value;
      ws.send(JSON.stringify({ type: 'notes', data: notes }));
      clearTimeout(notesTimer);
      notesTimer = setTimeout(() => fetch('/api/notes', {method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify({content: notes})}), 2000);
    });

    // Terminal
    async function createTerminal() {
      const res = await fetch('/api/terminal/create', {method:'POST'});
      const { id, url } = await res.json();
      $('#terminalInfo').style.display = 'block';
      $('#terminalUrl').textContent = location.origin + url;
      toast('Session created: ' + id);
    }

    // Request
    async function sendRequest() {
      const msg = $('#requestMsg').value.trim();
      if (!msg) return;
      await fetch('/api/request', {method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify({from: 'Dasua', message: msg, timestamp: Date.now()})});
      $('#requestMsg').value = '';
      toast('Request sent!');
      loadRequests();
    }
    async function loadRequests() {
      const res = await fetch('/api/request');
      const { requests } = await res.json();
      $('#requestList').innerHTML = requests.map(r => \`
        <div class="request-item request from-me">
          <div>
            <div>\${r.message}</div>
            <div class="request-meta">From: \${r.from} • \${new Date(r.timestamp).toLocaleTimeString()}</div>
          </div>
          <button class="btn btn-ghost">Reply</button>
        </div>
      \`).join('');
    }

    // WebSocket
    ws.onopen = () => toast('Connected');
    ws.onmessage = (e) => {
      const { type, data } = JSON.parse(e.data);
      if (type === 'init') { files = data.files; clipboard = data.clipboard; notes = data.notes; renderFiles(files); $('#clipboardText').value = clipboard; $('#notesText').value = notes; }
      if (type === 'files') { files = data; renderFiles(files); }
      if (type === 'clipboard' && data !== clipboard) { clipboard = data; $('#clipboardText').value = data; }
      if (type === 'notes' && data !== notes) { notes = data; $('#notesText').value = data; }
      if (type === 'request') loadRequests();
    };
    ws.onclose = () => toast('Disconnected - refresh');

    // Init
    loadRequests();
  </script>
</body>
</html>`;
}

// Terminal HTML (embedded)
function getTerminalHTML(id) {
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <title>Terminal | 0xKobold Hub</title>
  <style>
    :root { --bg: oklch(0.07 0.01 250); --fg: oklch(0.95 0.01 250); --primary: oklch(0.75 0.18 145); }
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body { font-family: monospace; background: var(--bg); color: var(--fg); height: 100vh; display: flex; flex-direction: column; }
    header { padding: 10px 20px; background: var(--bg); border-bottom: 1px solid oklch(0.2 0.02 250); display: flex; justify-content: space-between; align-items: center; }
    .title { color: var(--primary); }
    .info { font-size: 0.85rem; color: oklch(0.65 0.02 250); }
    #terminal-output { flex: 1; padding: 20px; overflow-y: auto; white-space: pre-wrap; background: oklch(0.05 0.01 250); }
    #terminal-input { display: flex; padding: 10px 20px; background: oklch(0.1 0.01 250); border-top: 1px solid oklch(0.2 0.02 250); }
    #terminal-input span { color: var(--primary); margin-right: 8px; }
    #terminal-input input { flex: 1; background: transparent; border: none; color: var(--fg); font-family: monospace; font-size: 1rem; outline: none; }
  </style>
</head>
<body>
  <header>
    <span class="title">🐉 0xKobold Terminal</span>
    <span class="info">tmux session • Pi shell</span>
  </header>
  <div id="terminal-output"></div>
  <div id="terminal-input">
    <span>$</span>
    <input type="text" id="cmd" placeholder="Type command, press Enter..." autofocus>
  </div>
  <script>
    const id = "${id}";
    const ws = new WebSocket(\`ws://\${location.host}\`);
    const output = $('#terminal-output');
    const cmd = $('#cmd');

    ws.onopen = () => ws.send(JSON.stringify({ type: 'terminal', data: { id } }));
    ws.onmessage = (e) => {
      const { type, data } = JSON.parse(e.data);
      if (type === 'output') output.textContent += data;
      if (type === 'init') { output.textContent = data; cmd.focus(); }
    };
    cmd.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') {
        const input = cmd.value + '\\n';
        output.textContent += '$ ' + cmd.value + '\\n';
        ws.send(JSON.stringify({ type: 'terminal-input', data: { id, input } }));
        cmd.value = '';
      }
    });
    function $(s) { return document.querySelector(s); }
  </script>
</body>
</html>`;
}
