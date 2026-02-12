// server.js (CommonJS) - Render compatible
const express = require("express");
const cors = require("cors");
const path = require("path");

const app = express();
app.use(cors());
app.use(express.json({ limit: "200kb" }));

const PORT = process.env.PORT || 10000;

// ---- Sessions ----
// queues por code: P1, P2, WAIT + presence (stage actual)
const sessions = new Map();

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
      presence: { stage: "start", t: Date.now() }
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

// ---- Health ----
app.get("/ping", (req, res) => res.type("text").send("pong"));

// ---- Front (STATIC) ----
const publicDir = path.join(__dirname, "public");
app.use(express.static(publicDir));

app.get("/", (req, res) => {
  res.sendFile(path.join(publicDir, "index.html"));
});

// ---- API ----
// Telefono manda comando
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
  return res.json({ ok: true });
});

// Unity hace poll
app.get("/api/poll", (req, res) => {
  const code = normCode(req.query.code);
  const player = String(req.query.player || "P1").toUpperCase();

  if (!code) return res.status(400).json({ ok: false, error: "Missing code" });

  const s = ensureSession(code);
  const key = player === "P2" ? "P2" : player === "WAIT" ? "WAIT" : "P1";

  const out = s.queues[key];
  s.queues[key] = [];

  res.json({ ok: true, events: out, presence: s.presence });
});

// Presence: Unity avisa qué “stage” está activo (para que el celular cambie SOLO)
app.post("/api/presence", (req, res) => {
  const code = normCode(req.body.code);
  const stage = String(req.body.stage || "").trim().toLowerCase();

  if (!code) return res.status(400).json({ ok: false, error: "Missing code" });
  if (!stage) return res.status(400).json({ ok: false, error: "Missing stage" });

  const s = ensureSession(code);
  s.presence = { stage, t: Date.now() };
  return res.json({ ok: true });
});

// Debug
app.get("/api/status", (req, res) => {
  const code = normCode(req.query.code);
  if (!code) return res.status(400).json({ ok: false, error: "Missing code" });
  const s = ensureSession(code);
  res.json({
    ok: true,
    code,
    presence: s.presence,
    counts: {
      P1: s.queues.P1.length,
      P2: s.queues.P2.length,
      WAIT: s.queues.WAIT.length
    }
  });
});

app.listen(PORT, () => console.log("Remote running on port", PORT));
