// server.js (CommonJS)
const express = require("express");
const cors = require("cors");
const path = require("path");

const app = express();
app.use(cors());
app.use(express.json({ limit: "200kb" }));

// Render asigna PORT automáticamente
const PORT = process.env.PORT || 8080;

// ---- sesiones en memoria ----
// sessions[CODE].queues.P1 / P2 / WAIT = array de eventos {cmd,t,data}
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
      queues: { P1: [], P2: [], WAIT: [] }
    });
  }
  return sessions.get(c);
}

// Limpieza cada 30 min (borra sesiones viejas de 6h)
setInterval(() => {
  const now = Date.now();
  for (const [code, s] of sessions.entries()) {
    if (now - s.createdAt > 6 * 60 * 60 * 1000) sessions.delete(code);
  }
}, 30 * 60 * 1000);

// ---- health ----
app.get("/ping", (req, res) => res.type("text").send("pong"));

// ---- FRONT (public/) ----
const publicDir = path.join(__dirname, "public");
app.use(express.static(publicDir));

// Por si el usuario entra a "/"
app.get("/", (req, res) => {
  res.sendFile(path.join(publicDir, "index.html"));
});

// ---- API ----
// Enviar comando desde el teléfono
// Body: { code:"62TR", player:"P1"|"P2"|"WAIT", cmd:"P1_PLAY", data?:{} }
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

// Debug: ver conteo sin vaciar
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
    }
  });
});

app.listen(PORT, () => {
  console.log("Remote running on port", PORT);
});
