import express from "express";
import path from "path";
import fs from "fs";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();

// -------- Middleware --------
app.use(express.json({ limit: "256kb" }));

// CORS (no rompe nada; ayuda si alguna vez servís el remote desde otro dominio)
app.use((req, res, next) => {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET,POST,OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
  if (req.method === "OPTIONS") return res.sendStatus(204);
  next();
});

// -------- In-memory state --------
// code -> { stage, active, ts }
const stateByCode = new Map();
// code -> [cmd strings]
const cmdQueueByCode = new Map();

// -------- Helpers --------
function normCode(code) {
  return (code || "").trim().toUpperCase();
}
function ensureQueue(code) {
  if (!cmdQueueByCode.has(code)) cmdQueueByCode.set(code, []);
  return cmdQueueByCode.get(code);
}

// -------- Health --------
app.get("/ping", (req, res) => res.status(200).send("ok"));

// -------- API: state --------
app.post("/api/state", (req, res) => {
  const code = normCode(req.body?.code);
  if (!code) return res.status(400).json({ ok: false, error: "missing code" });

  const stage = (req.body?.stage || "").toString().trim();
  const active = (req.body?.active || "").toString().trim();

  stateByCode.set(code, { stage, active, ts: Date.now() });
  return res.json({ ok: true });
});

app.get("/api/state", (req, res) => {
  const code = normCode(req.query?.code);
  if (!code) return res.status(400).json({ ok: false, error: "missing code" });

  const st = stateByCode.get(code) || { stage: "start", active: "", ts: 0 };
  return res.json({ ok: true, ...st });
});

// -------- API: send command --------
app.post("/api/send", (req, res) => {
  const code = normCode(req.body?.code);
  const cmd = (req.body?.cmd || "").toString().trim();
  if (!code) return res.status(400).json({ ok: false, error: "missing code" });
  if (!cmd) return res.status(400).json({ ok: false, error: "missing cmd" });

  const q = ensureQueue(code);
  q.push(cmd);
  return res.json({ ok: true });
});

// ✅ Alias REAL (antes estaba mal)
// Muchos clientes mandan a /api/cmd en lugar de /api/send
app.post("/api/cmd", (req, res) => {
  const code = normCode(req.body?.code);
  const cmd = (req.body?.cmd || "").toString().trim();
  if (!code) return res.status(400).json({ ok: false, error: "missing code" });
  if (!cmd) return res.status(400).json({ ok: false, error: "missing cmd" });

  const q = ensureQueue(code);
  q.push(cmd);
  return res.json({ ok: true });
});

// (Opcional) alias GET por si alguna prueba manda querystring
app.get("/api/cmd", (req, res) => {
  const code = normCode(req.query?.code);
  const cmd = (req.query?.cmd || "").toString().trim();
  if (!code) return res.status(400).json({ ok: false, error: "missing code" });
  if (!cmd) return res.status(400).json({ ok: false, error: "missing cmd" });

  const q = ensureQueue(code);
  q.push(cmd);
  return res.json({ ok: true });
});

// -------- API: poll (Unity) --------
app.get("/api/poll", (req, res) => {
  const code = normCode(req.query?.code);
  if (!code) return res.status(400).json({ ok: false, error: "missing code" });

  const q = ensureQueue(code);
  const cmd = q.length > 0 ? q.shift() : "";
  return res.json({ ok: true, cmd });
});

// -------- Static: serve public --------
const publicDir = path.join(__dirname, "public");
const rootIndex = path.join(__dirname, "index.html");
const publicIndex = path.join(publicDir, "index.html");

// Servimos /public completo si existe
if (fs.existsSync(publicDir)) {
  app.use(express.static(publicDir));
}

// Root -> index.html (prioridad public/index.html)
app.get("/", (req, res) => {
  if (fs.existsSync(publicIndex)) return res.sendFile(publicIndex);
  if (fs.existsSync(rootIndex)) return res.sendFile(rootIndex);
  return res.status(404).send("index.html not found");
});

// (Opcional) debug mínimo
app.get("/api/debug", (req, res) => {
  const code = normCode(req.query?.code);
  if (!code) return res.status(400).json({ ok: false, error: "missing code" });

  const st = stateByCode.get(code) || { stage: "start", active: "", ts: 0 };
  const q = ensureQueue(code);
  return res.json({ ok: true, state: st, queueLength: q.length, queuePreview: q.slice(0, 5) });
});

const PORT = process.env.PORT || 10000;
app.listen(PORT, () => {
  console.log("Remote server running on port", PORT);
});
