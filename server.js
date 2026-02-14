import express from "express";
import path from "path";
import { fileURLToPath } from "url";

const app = express();
app.use(express.json());

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// ---- In-memory store (suficiente para demo) ----
const queues = new Map();     // key: `${code}:${player}` -> [{cmd, t}]
const presence = new Map();   // key: code -> { stage, t }

function qKey(code, player) {
  return `${code}:${player}`;
}

function normCode(code) {
  return (code || "").toString().trim().toUpperCase();
}

function normPlayer(player) {
  const p = (player || "P1").toString().trim().toUpperCase();
  if (p !== "P1" && p !== "P2" && p !== "WAIT") return "P1";
  return p;
}

function safeStage(stage) {
  const s = (stage || "").toString().trim().toLowerCase();
  if (["start", "select", "level", "wait"].includes(s)) return s;
  return "start";
}

// ---- Static (public/index.html) ----
app.use(express.static(path.join(__dirname, "public")));

app.get("/ping", (req, res) => res.json({ ok: true }));

// ---- SEND command ----
// body: { code, cmd, player? }
// Si cmd ya viene con "P1_" o "P2_" o "WAIT_" igual lo aceptamos.
// Si NO viene prefijo, lo armamos con player.
app.post("/api/send", (req, res) => {
  const code = normCode(req.body?.code);
  let cmd = (req.body?.cmd || "").toString().trim();
  let player = normPlayer(req.body?.player);

  if (!code) return res.status(400).json({ ok: false, error: "Missing code" });
  if (!cmd) return res.status(400).json({ ok: false, error: "Missing cmd" });

  // Si cmd NO tiene prefijo (P1_/P2_/WAIT_), se lo agregamos
  const hasPrefix =
    cmd.startsWith("P1_") || cmd.startsWith("P2_") || cmd.startsWith("WAIT_");

  if (!hasPrefix) cmd = `${player}_${cmd}`;

  // Encolar según prefijo real
  let realPlayer = "P1";
  if (cmd.startsWith("P2_")) realPlayer = "P2";
  else if (cmd.startsWith("WAIT_")) realPlayer = "WAIT";

  const k = qKey(code, realPlayer);
  if (!queues.has(k)) queues.set(k, []);
  queues.get(k).push({ cmd, t: Date.now() });

  res.json({ ok: true });
});

// ---- POLL ----
// GET /api/poll?code=XXXX&player=P1
// devuelve { ok:true, cmd:"P1_PLAY" } o { ok:true, cmd:null }
app.get("/api/poll", (req, res) => {
  const code = normCode(req.query.code);
  const player = normPlayer(req.query.player);

  if (!code) return res.status(400).json({ ok: false, error: "Missing code" });

  const k = qKey(code, player);
  const arr = queues.get(k) || [];
  const ev = arr.shift();
  queues.set(k, arr);

  res.json({ ok: true, cmd: ev ? ev.cmd : null });
});

// ---- PRESENCE ----
// POST /api/presence  body: {code, stage}
app.post("/api/presence", (req, res) => {
  const code = normCode(req.body?.code);
  const stage = safeStage(req.body?.stage);

  if (!code) return res.status(400).json({ ok: false, error: "Missing code" });

  presence.set(code, { stage, t: Date.now() });
  res.json({ ok: true, stage });
});

// GET /api/presence?code=XXXX -> {ok:true, stage:"select"}
app.get("/api/presence", (req, res) => {
  const code = normCode(req.query.code);
  if (!code) return res.status(400).json({ ok: false, error: "Missing code" });

  const p = presence.get(code);
  res.json({ ok: true, stage: p?.stage || "start" });
});

const PORT = process.env.PORT || 10000;
app.listen(PORT, () => console.log("Remote running on port", PORT));
