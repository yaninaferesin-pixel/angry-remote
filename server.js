// server.js (ESM)
import express from "express";
import path from "path";
import fs from "fs";
import { fileURLToPath } from "url";

const app = express();
app.use(express.json({ limit: "200kb" }));

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const PORT = process.env.PORT || 3000;

// code -> { queues:{P1:[],P2:[],WAIT:[]}, stage:"start", player:"P1", updatedAt:number }
const sessions = new Map();

function normCode(code) {
  return String(code || "").trim().toUpperCase().replace(/[^A-Z0-9]/g, "");
}
function ensure(code) {
  const c = normCode(code);
  if (!c) return null;
  if (!sessions.has(c)) {
    sessions.set(c, {
      createdAt: Date.now(),
      updatedAt: Date.now(),
      stage: "start",
      player: "P1",
      queues: { P1: [], P2: [], WAIT: [] }
    });
  }
  return sessions.get(c);
}

// Limpieza
setInterval(() => {
  const now = Date.now();
  for (const [code, s] of sessions.entries()) {
    if (now - s.updatedAt > 6 * 60 * 60 * 1000) sessions.delete(code);
  }
}, 30 * 60 * 1000);

app.get("/ping", (req, res) => res.type("text").send("pong"));

// ---- FRONT ----
const publicDir = path.join(__dirname, "public");
app.use(express.static(publicDir));

function sendIndex(res) {
  const p = path.join(publicDir, "index.html");
  if (fs.existsSync(p)) return res.sendFile(p);
  return res.status(500).type("text").send("Missing public/index.html");
}

app.get("/", (req, res) => sendIndex(res));
app.get("*", (req, res) => sendIndex(res));

// ---- API ----
// Teléfono -> manda comando
app.post("/api/send", (req, res) => {
  const code = normCode(req.body.code);
  const player = String(req.body.player || "P1").toUpperCase();
  const cmd = String(req.body.cmd || "").trim();

  if (!code) return res.status(400).json({ ok: false, error: "Missing code" });
  if (!cmd) return res.status(400).json({ ok: false, error: "Missing cmd" });

  const s = ensure(code);
  s.updatedAt = Date.now();

  const key = player === "P2" ? "P2" : player === "WAIT" ? "WAIT" : "P1";
  s.queues[key].push({ cmd, t: Date.now() });

  res.json({ ok: true });
});

// Unity -> poll
app.get("/api/poll", (req, res) => {
  const code = normCode(req.query.code);
  const player = String(req.query.player || "P1").toUpperCase();
  if (!code) return res.status(400).json({ ok: false, error: "Missing code" });

  const s = ensure(code);
  s.updatedAt = Date.now();

  const key = player === "P2" ? "P2" : player === "WAIT" ? "WAIT" : "P1";
  const events = s.queues[key];
  s.queues[key] = [];

  res.json({ ok: true, events });
});

// Unity -> presencia (para cambio automático de panel en el cel)
app.post("/api/presence", (req, res) => {
  const code = normCode(req.body.code);
  const stage = String(req.body.stage || "").trim().toLowerCase();
  const player = String(req.body.player || "").trim().toUpperCase();

  if (!code) return res.status(400).json({ ok: false, error: "Missing code" });
  const s = ensure(code);
  s.updatedAt = Date.now();

  if (stage) s.stage = stage;           // "start" | "select" | "level" ...
  if (player) s.player = player;        // "P1" | "P2" | "WAIT"

  res.json({ ok: true });
});

// Teléfono -> consulta estado para auto UI
app.get("/api/state", (req, res) => {
  const code = normCode(req.query.code);
  if (!code) return res.status(400).json({ ok: false, error: "Missing code" });

  const s = ensure(code);
  res.json({ ok: true, stage: s.stage, player: s.player });
});

app.listen(PORT, () => console.log("Remote running on port", PORT));
