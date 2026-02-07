const express = require("express");
const path = require("path");

const app = express();
app.use(express.json());

// ==============================
// CONFIG
// ==============================
const PORT = process.env.PORT || 8080;

// Mapa: code -> { p1: [cmd], p2: [cmd] }
const sessions = new Map();

function normCode(code) {
  return String(code || "").trim().toUpperCase();
}

function ensureSession(code) {
  if (!sessions.has(code)) {
    sessions.set(code, { p1: [], p2: [], createdAt: Date.now() });
  }
  return sessions.get(code);
}

// Limpieza simple (evita crecer infinito en free tier)
setInterval(() => {
  const now = Date.now();
  for (const [code, s] of sessions.entries()) {
    const idleMs = now - (s.lastUsedAt || s.createdAt);
    // borra sesiones sin uso por 6 horas
    if (idleMs > 6 * 60 * 60 * 1000) sessions.delete(code);
  }
}, 30 * 60 * 1000);

// ==============================
// SERVIR UI WEB
// ==============================
app.use(express.static(path.join(__dirname, "public")));

// Si entran a "/" y no existiera index por alguna razón, lo forzamos:
app.get("/", (req, res) => {
  res.sendFile(path.join(__dirname, "public", "index.html"));
});

// ==============================
// HEALTHCHECK
// ==============================
app.get("/ping", (req, res) => res.type("text").send("pong"));

// ==============================
// API: ENVIAR COMANDO (desde el teléfono)
// POST /api/command
// body: { code:"TAP", player:1|2, action:"P1_PLAY", payload?:{} }
// ==============================
app.post("/api/command", (req, res) => {
  const code = normCode(req.body.code);
  const player = Number(req.body.player) === 2 ? 2 : 1;
  const action = String(req.body.action || "").trim();
  const payload = req.body.payload || null;

  if (!code) return res.status(400).json({ ok: false, error: "Missing code" });
  if (!action) return res.status(400).json({ ok: false, error: "Missing action" });

  const session = ensureSession(code);
  session.lastUsedAt = Date.now();

  const cmd = { t: Date.now(), action, payload };

  if (player === 1) session.p1.push(cmd);
  else session.p2.push(cmd);

  res.json({ ok: true });
});

// ==============================
// API: LEER COMANDOS (Unity hace polling)
// GET /api/poll?code=TAP&player=1
// Respuesta: { ok:true, commands:[...] }
// ==============================
app.get("/api/poll", (req, res) => {
  const code = normCode(req.query.code);
  const player = Number(req.query.player) === 2 ? 2 : 1;

  if (!code) return res.status(400).json({ ok: false, error: "Missing code" });

  const session = ensureSession(code);
  session.lastUsedAt = Date.now();

  const list = player === 1 ? session.p1 : session.p2;
  const out = list.splice(0, list.length); // consume todo

  res.json({ ok: true, commands: out });
});

app.listen(PORT, () => {
  console.log(`Remote running on port ${PORT}`);
});
