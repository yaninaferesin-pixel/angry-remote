// server.js (CommonJS)
const express = require("express");
const path = require("path");

const app = express();
app.use(express.json({ limit: "200kb" }));

const PORT = process.env.PORT || 3000;

// ----------------- memoria -----------------
const sessions = new Map(); // code -> { queue: [], stage: "start", updatedAt: number }

function normCode(code) {
  return String(code || "").trim().toUpperCase().replace(/[^A-Z0-9]/g, "");
}

function getSession(code) {
  const c = normCode(code);
  if (!c) return null;
  if (!sessions.has(c)) {
    sessions.set(c, { queue: [], stage: "start", updatedAt: Date.now() });
  }
  return sessions.get(c);
}

// Limpieza simple (6h)
setInterval(() => {
  const now = Date.now();
  for (const [code, s] of sessions.entries()) {
    if (now - s.updatedAt > 6 * 60 * 60 * 1000) sessions.delete(code);
  }
}, 30 * 60 * 1000);

// ----------------- health -----------------
app.get("/ping", (req, res) => res.type("text").send("pong"));

// ----------------- static -----------------
const publicDir = path.join(__dirname, "public");
app.use(express.static(publicDir));

// ----------------- api -----------------

// Enviar comando desde el teléfono
// body: { code:"CULA", cmd:"P1_PLAY" }
app.post("/api/send", (req, res) => {
  const code = normCode(req.body?.code);
  const cmd = String(req.body?.cmd || "").trim();

  if (!code) return res.status(400).json({ ok: false, error: "Missing code" });
  if (!cmd) return res.status(400).json({ ok: false, error: "Missing cmd" });

  const s = getSession(code);
  s.queue.push(cmd);
  s.updatedAt = Date.now();

  res.json({ ok: true });
});

// Poll desde Unity: devuelve 1 cmd y lo consume
app.get("/api/poll", (req, res) => {
  const code = normCode(req.query.code);
  if (!code) return res.status(400).json({ ok: false, error: "Missing code" });

  const s = getSession(code);
  const cmd = s.queue.length ? s.queue.shift() : null;
  s.updatedAt = Date.now();

  res.json({ ok: true, cmd });
});

// Presence: Unity le avisa al server en qué etapa está para que el celular cambie solo
// body: { code:"CULA", stage:"start"|"select"|"level"|"wait" }
app.post("/api/presence", (req, res) => {
  const code = normCode(req.body?.code);
  const stage = String(req.body?.stage || "").trim().toLowerCase();

  if (!code) return res.status(400).json({ ok: false, error: "Missing code" });
  if (!stage) return res.status(400).json({ ok: false, error: "Missing stage" });

  const s = getSession(code);
  s.stage = stage;
  s.updatedAt = Date.now();

  res.json({ ok: true });
});

app.get("/api/presence", (req, res) => {
  const code = normCode(req.query.code);
  if (!code) return res.status(400).json({ ok: false, error: "Missing code" });

  const s = getSession(code);
  res.json({ ok: true, stage: s.stage, updatedAt: s.updatedAt });
});

// SPA fallback
app.get("*", (req, res) => {
  res.sendFile(path.join(publicDir, "index.html"));
});

app.listen(PORT, () => console.log("Remote running on port", PORT));
