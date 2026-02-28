import express from "express";
import path from "path";
import fs from "fs";
import { fileURLToPath } from "url";

const app = express();
app.use(express.json());

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// ===== In-memory store =====
const queues = new Map();
const state = new Map();

function normCode(code) {
  return String(code || "").trim().toUpperCase();
}
function getQueue(code) {
  if (!queues.has(code)) queues.set(code, []);
  return queues.get(code);
}

// ===== Static site =====
app.use(express.static(__dirname));

// Health / Ping
app.get("/health", (_req, res) => res.json({ ok: true }));
app.get("/ping", (_req, res) => res.send("pong"));

// ✅ Resolver index REAL (index.html vs index.html)
function resolveIndexFile() {
  const candidates = ["index.html", "index.html", "index.htm"];
  for (const f of candidates) {
    const p = path.join(__dirname, f);
    if (fs.existsSync(p)) return p;
  }
  return null;
}

const INDEX_FILE = resolveIndexFile();

app.get("/", (_req, res) => {
  if (INDEX_FILE) return res.sendFile(INDEX_FILE);
  return res.status(200).send("Remote server OK, but index file is missing in repo.");
});

// Para rutas tipo /?code=CULA y refresh
app.get(/^\/(?!api\/).*/, (_req, res) => {
  if (INDEX_FILE) return res.sendFile(INDEX_FILE);
  return res.status(200).send("Remote server OK, but index file is missing in repo.");
});

// ===== API =====
app.post("/api/cmd", (req, res) => {
  const code = normCode(req.body?.code);
  const cmd = String(req.body?.cmd || "").trim();

  if (!code) return res.status(400).json({ ok: false, error: "missing code" });
  if (!cmd) return res.status(400).json({ ok: false, error: "missing cmd" });

  getQueue(code).push(cmd);
  return res.json({ ok: true });
});

app.get("/api/poll", (req, res) => {
  const code = normCode(req.query?.code);
  if (!code) return res.status(400).json({ ok: false, error: "missing code" });

  const q = getQueue(code);
  const cmd = q.length > 0 ? q.shift() : null;
  return res.json({ ok: true, cmd });
});

app.post("/api/state", (req, res) => {
  const code = normCode(req.body?.code);
  const stage = String(req.body?.stage || "").trim();
  const active = req.body?.active == null ? "" : String(req.body.active).trim();

  if (!code) return res.status(400).json({ ok: false, error: "missing code" });

  state.set(code, { stage, active, ts: Date.now() });
  return res.json({ ok: true });
});

app.get("/api/state", (req, res) => {
  const code = normCode(req.query?.code);
  if (!code) return res.status(400).json({ ok: false, error: "missing code" });

  const s = state.get(code) || { stage: "unknown", active: "", ts: 0 };
  return res.json({ ok: true, ...s });
});

const PORT = process.env.PORT || 10000;
app.listen(PORT, () => console.log(`Remote server running on port ${PORT}`));
