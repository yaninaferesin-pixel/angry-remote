// server.js (CommonJS)
const express = require("express");
const cors = require("cors");
const path = require("path");

const app = express();
app.use(cors());
app.use(express.json({ limit: "200kb" }));

const PORT = process.env.PORT || 10000;

// ---- sesiones ----
const sessions = new Map();
// sessions.get(code) = { createdAt, queues:{P1:[],P2:[],WAIT:[]}, presence:{ stage:"start", ts } }

function normCode(code) {
  return String(code || "").trim().toUpperCase().replace(/[^A-Z0-9]/g, "");
}

function ensureSession(code) {
  const c = normCode(code);
  if (!c) return null;

  if (!sessions.has(c)) {
    sessions.set(c, {
      createdAt: Date.now(),
      queues: { P1: [], P2: [], WAIT: [] },
      presence: { stage: "start", ts: Date.now() }
    });
  }
  return sessions.get(c);
}

// limpieza
setInterval(() => {
  const now = Date.now();
  for (const [code, s] of sessions.entries()) {
    if (now - s.createdAt > 6 * 60 * 60 * 1000) sessions.delete(code);
  }
}, 30 * 60 * 1000);

// health
app.get("/ping", (req, res) => res.type("text").send("pong"));

// front
app.get("/", (req, res) => {
  res.sendFile(path.join(__dirname, "index.html"));
});

// ---- API comandos ----
app.post("/api/send", (req, res) => {
  const code = normCode(req.body.code);
  const player = String(req.body.player || "P1").toUpperCase();
  const cmd = String(req.body.cmd || "").trim();
  const data = req.body.data || null;

  if (!code) return res.status(400).json({ ok: false, error: "Missing code" });
  if (!cmd) return res.status(400).json({ ok: false, error: "Missing cmd" });

  const s = ensureSession(code);
  const key = player === "P2" ? "P2" : player === "WAIT" ? "WAIT" : "P1";
  s.queues[key].push({ cmd, t: Date.now(), data });

  res.json({ ok: true });
});

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

// ---- Presence (para etapa automática) ----
// Unity avisa en qué escena está
app.post("/api/presence", (req, res) => {
  const code = normCode(req.body.code);
  const stage = String(req.body.stage || "start").trim();

  if (!code) return res.status(400).json({ ok: false, error: "Missing code" });

  const s = ensureSession(code);
  s.presence = { stage, ts: Date.now() };
  res.json({ ok: true });
});

// Teléfono consulta en qué etapa está Unity
app.get("/api/presence", (req, res) => {
  const code = normCode(req.query.code);
  if (!code) return res.status(400).json({ ok: false, error: "Missing code" });

  const s = ensureSession(code);
  res.json({ ok: true, stage: s.presence?.stage || "start", ts: s.presence?.ts || 0 });
});

app.listen(PORT, () => console.log("Remote running on port", PORT));
