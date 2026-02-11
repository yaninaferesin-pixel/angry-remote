// server.js (CommonJS)
const express = require("express");
const cors = require("cors");
const path = require("path");

const app = express();
app.use(cors());
app.use(express.json({ limit: "200kb" }));

const PORT = process.env.PORT || 8080;

// ====== SESIONES ======
// Por cada code guardamos colas por jugador + presence (escena/pantalla actual)
const sessions = new Map();

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
      queues: { P1: [], P2: [], WAIT: [] },
      presence: {
        stage: "start",          // start | select | level | wait
        activePlayer: "P1",      // P1 | P2 | WAIT
        updatedAt: Date.now()
      }
    });
  }
  return sessions.get(c);
}

// Limpieza simple (6h)
setInterval(() => {
  const now = Date.now();
  for (const [code, s] of sessions.entries()) {
    if (now - s.createdAt > 6 * 60 * 60 * 1000) sessions.delete(code);
  }
}, 30 * 60 * 1000);

// ====== HEALTH ======
app.get("/ping", (req, res) => res.type("text").send("pong"));

// ====== FRONT ======
app.get("/", (req, res) => {
  res.sendFile(path.join(__dirname, "index.html"));
});

// ====== API: SEND (teléfono -> cola) ======
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

// ====== API: POLL (Unity -> recibe comandos) ======
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

// ====== API: STATUS (debug) ======
app.get("/api/status", (req, res) => {
  const code = normCode(req.query.code);
  if (!code) return res.status(400).json({ ok: false, error: "Missing code" });

  const s = ensureSession(code);
  res.json({
    ok: true,
    code,
    counts: {
      P1: s.queues.P1.length,
      P2: s.queues.P2.length,
      WAIT: s.queues.WAIT.length
    },
    presence: s.presence
  });
});

// ====== API: PRESENCE (Unity -> avisa qué pantalla está activa) ======
// Unity llama POST /api/presence { code, stage, activePlayer }
app.post("/api/presence", (req, res) => {
  const code = normCode(req.body.code);
  const stage = String(req.body.stage || "start").toLowerCase();
  const activePlayer = String(req.body.activePlayer || "P1").toUpperCase();

  if (!code) return res.status(400).json({ ok: false, error: "Missing code" });

  const s = ensureSession(code);
  s.presence.stage = stage; // start | select | level | wait
  s.presence.activePlayer = activePlayer; // P1 | P2 | WAIT
  s.presence.updatedAt = Date.now();

  res.json({ ok: true });
});

// Teléfono lee GET /api/presence?code=XXXX
app.get("/api/presence", (req, res) => {
  const code = normCode(req.query.code);
  if (!code) return res.status(400).json({ ok: false, error: "Missing code" });

  const s = ensureSession(code);
  res.json({ ok: true, presence: s.presence });
});

app.listen(PORT, () => {
  console.log("Remote running on port", PORT);
});
