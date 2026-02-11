// server.js (CommonJS)// server.js (ESM)
import express from "express";
import cors from "cors";
import path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
app.use(cors());
app.use(express.json({ limit: "300kb" }));

// ---------- CONFIG ----------
const PORT = process.env.PORT || 10000;

// Cada code tiene colas por player
// Guardamos eventos tipo { cmd: "P1_PLAY", t: 123456789, data: {} }
const sessions = new Map();

// Presencia (para que la web cambie la "etapa" sola)
const presence = new Map(); // code -> { stage:"start|select|level|wait", active:"P1|P2|WAIT", t:Date.now() }

function normCode(code) {
  return String(code || "")
    .trim()
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, "");
}

function ensureSession(code) {
  const c = normCode(code);
  if (!c) return null;
  if (!sessions.has(c)) {
    sessions.set(c, {
      createdAt: Date.now(),
      queues: { P1: [], P2: [], WAIT: [] }
    });
  }
  return sessions.get(c);
}

// Limpieza simple
setInterval(() => {
  const now = Date.now();
  for (const [code, s] of sessions.entries()) {
    if (now - s.createdAt > 6 * 60 * 60 * 1000) sessions.delete(code);
  }
  for (const [code, p] of presence.entries()) {
    if (now - p.t > 60 * 60 * 1000) presence.delete(code);
  }
}, 10 * 60 * 1000);

// ---------- HEALTH ----------
app.get("/ping", (req, res) => res.type("text").send("pong"));

// ---------- FRONT (sirve index.html desde el root del repo) ----------
app.use(express.static(__dirname));
app.get("/", (req, res) => {
  res.sendFile(path.join(__dirname, "index.html"));
});

// ---------- API ----------

// Enviar comando desde el teléfono
// Body: { code:"62TR", player:"P1"|"P2"|"WAIT", cmd:"P1_PLAY", data?:{} }
app.post("/api/send", (req, res) => {
  const code = normCode(req.body.code);
  const player = String(req.body.player || "P1").toUpperCase();
  const cmd = String(req.body.cmd || "").trim();
  const data = req.body.data ?? null;

  if (!code) return res.status(400).json({ ok: false, error: "Missing code" });
  if (!cmd) return res.status(400).json({ ok: false, error: "Missing cmd" });

  const s = ensureSession(code);
  const key = player === "P2" ? "P2" : player === "WAIT" ? "WAIT" : "P1";

  s.queues[key].push({ cmd, t: Date.now(), data });
  return res.json({ ok: true });
});

// Polling para Unity
// GET /api/poll?code=62TR&player=P1
app.get("/api/poll", (req, res) => {
  const code = normCode(req.query.code);
  const player = String(req.query.player || "P1").toUpperCase();

  if (!code) return res.status(400).json({ ok: false, error: "Missing code" });

  const s = ensureSession(code);
  const key = player === "P2" ? "P2" : player === "WAIT" ? "WAIT" : "P1";
  const out = s.queues[key];
  s.queues[key] = [];

  res.json({ ok: true, events: out });
});

// Presencia: Unity le dice a la web en qué "etapa" está
// POST /api/presence  Body: { code:"CULA", stage:"start|select|level|wait", active:"P1|P2|WAIT" }
app.post("/api/presence", (req, res) => {
  const code = normCode(req.body.code);
  const stage = String(req.body.stage || "").toLowerCase();
  const active = String(req.body.active || "").toUpperCase();

  if (!code) return res.status(400).json({ ok: false, error: "Missing code" });

  const safeStage = ["start", "select", "level", "wait"].includes(stage) ? stage : "start";
  const safeActive = ["P1", "P2", "WAIT"].includes(active) ? active : "P1";

  presence.set(code, { stage: safeStage, active: safeActive, t: Date.now() });
  res.json({ ok: true });
});

// La web consulta la presencia
// GET /api/presence?code=CULA
app.get("/api/presence", (req, res) => {
  const code = normCode(req.query.code);
  if (!code) return res.status(400).json({ ok: false, error: "Missing code" });

  const p = presence.get(code);
  res.json({ ok: true, code, presence: p || null });
});

// Debug
app.get("/api/status", (req, res) => {
  const code = normCode(req.query.code);
  if (!code) return res.status(400).json({ ok: false, error: "Missing code" });
  const s = ensureSession(code);
  const p = presence.get(code) || null;

  res.json({
    ok: true,
    code,
    presence: p,
    counts: {
      P1: s.queues.P1.length,
      P2: s.queues.P2.length,
      WAIT: s.queues.WAIT.length
    }
  });
});

app.listen(PORT, () => {
  console.log("Remote running on port", PORT);
});


