// server.js (ESM)
import express from "express";
import cors from "cors";
import path from "path";
import fs from "fs";
import { fileURLToPath } from "url";

const app = express();
app.use(cors());
app.use(express.json({ limit: "200kb" }));

const PORT = process.env.PORT || 10000;

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// -------------------- sesiones --------------------
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
      presence: { stage: "start", activePlayer: "P1", updatedAt: Date.now() }
    });
  }
  return sessions.get(c);
}

// limpieza simple
setInterval(() => {
  const now = Date.now();
  for (const [code, s] of sessions.entries()) {
    if (now - s.createdAt > 6 * 60 * 60 * 1000) sessions.delete(code);
  }
}, 30 * 60 * 1000);

// -------------------- health --------------------
app.get("/ping", (req, res) => res.type("text").send("pong"));

// -------------------- front --------------------
// sirve /public si existe (assets opcionales)
const publicDir = path.join(__dirname, "public");
if (fs.existsSync(publicDir)) {
  app.use(express.static(publicDir));
}

// root index (busca index.html en /src o /src/public)
function resolveIndex() {
  const a = path.join(__dirname, "index.html");
  const b = path.join(__dirname, "public", "index.html");
  if (fs.existsSync(a)) return a;
  if (fs.existsSync(b)) return b;
  return null;
}

app.get("/", (req, res) => {
  const p = resolveIndex();
  if (!p) return res.status(500).send("index.html no encontrado (subilo junto a server.js o en /public)");
  res.sendFile(p);
});

// -------------------- API --------------------
// TEL -> manda comando
// body: { code, player:"P1"|"P2"|"WAIT", cmd:"P1_PLAY", data?:{} }
app.post("/api/send", (req, res) => {
  const code = normCode(req.body?.code);
  const player = String(req.body?.player || "P1").toUpperCase();
  const cmd = String(req.body?.cmd || "").trim();
  const data = req.body?.data ?? null;

  if (!code) return res.status(400).json({ ok: false, error: "Missing code" });
  if (!cmd) return res.status(400).json({ ok: false, error: "Missing cmd" });

  const s = ensureSession(code);
  const key = player === "P2" ? "P2" : player === "WAIT" ? "WAIT" : "P1";

  s.queues[key].push({ cmd, t: Date.now(), data });
  return res.json({ ok: true });
});

// UNITY -> poll
// GET /api/poll?code=XXXX&player=P1|P2|WAIT|ALL
app.get("/api/poll", (req, res) => {
  const code = normCode(req.query.code);
  const player = String(req.query.player || "ALL").toUpperCase();

  if (!code) return res.status(400).json({ ok: false, error: "Missing code" });
  const s = ensureSession(code);

  let events = [];
  if (player === "P1" || player === "P2" || player === "WAIT") {
    events = s.queues[player];
    s.queues[player] = [];
  } else {
    // ALL
    events = [...s.queues.P1, ...s.queues.P2, ...s.queues.WAIT];
    s.queues.P1 = [];
    s.queues.P2 = [];
    s.queues.WAIT = [];
  }

  res.json({ ok: true, events });
});

// UNITY -> presence (para que el celular cambie de panel solo)
// body: { code, stage:"start|select|level|wait", activePlayer:"P1|P2" }
app.post("/api/presence", (req, res) => {
  const code = normCode(req.body?.code);
  const stage = String(req.body?.stage || "start").trim().toLowerCase();
  const activePlayer = String(req.body?.activePlayer || "P1").toUpperCase();

  if (!code) return res.status(400).json({ ok: false, error: "Missing code" });

  const s = ensureSession(code);
  s.presence = { stage, activePlayer, updatedAt: Date.now() };

  res.json({ ok: true });
});

// TEL -> consulta presence
app.get("/api/presence", (req, res) => {
  const code = normCode(req.query.code);
  if (!code) return res.status(400).json({ ok: false, error: "Missing code" });

  const s = ensureSession(code);
  res.json({ ok: true, presence: s.presence });
});

app.listen(PORT, () => {
  console.log("Remote running on port", PORT);
});
