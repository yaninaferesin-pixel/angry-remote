import express from "express";
import path from "path";
import { fileURLToPath } from "url";

const app = express();
app.use(express.json({ limit: "200kb" }));

const PORT = process.env.PORT || 10000;

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// ---- in-memory sessions ----
const sessions = new Map();

function normCode(code) {
  return String(code || "")
    .trim()
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, "");
}

function ensureSession(code) {
  const c = normCode(code);
  if (!sessions.has(c)) {
    sessions.set(c, {
      createdAt: Date.now(),
      presence: { stage: "start", t: Date.now() },
      queues: { P1: [], P2: [], WAIT: [] },
    });
  }
  return sessions.get(c);
}

// cleanup
setInterval(() => {
  const now = Date.now();
  for (const [code, s] of sessions.entries()) {
    if (now - s.createdAt > 6 * 60 * 60 * 1000) sessions.delete(code);
  }
}, 30 * 60 * 1000);

// ---- serve web ----
app.use(express.static(path.join(__dirname, "public")));

app.get("/ping", (req, res) => res.type("text").send("pong"));

// ---- send command (web -> server) ----
app.post("/send", (req, res) => {
  const code = normCode(req.body.code);
  const cmd = String(req.body.cmd || "").trim();
  if (!code) return res.status(400).json({ ok: false, error: "Missing code" });
  if (!cmd) return res.status(400).json({ ok: false, error: "Missing cmd" });

  const s = ensureSession(code);

  // detect target by prefix
  let key = "P1";
  if (cmd.startsWith("P2_")) key = "P2";
  else if (cmd.startsWith("WAIT_")) key = "WAIT";

  s.queues[key].push({ cmd, t: Date.now(), data: req.body.data || null });
  res.json({ ok: true });
});

// ---- poll (unity -> server) ----
// GET /poll?code=ABCD&player=P1
app.get("/poll", (req, res) => {
  const code = normCode(req.query.code);
  const player = String(req.query.player || "P1").toUpperCase();
  if (!code) return res.status(400).json({ ok: false, error: "Missing code" });

  const s = ensureSession(code);
  const key = player === "P2" ? "P2" : player === "WAIT" ? "WAIT" : "P1";
  const out = s.queues[key];
  s.queues[key] = [];

  res.json({ ok: true, cmds: out, drags: [] });
});

// ---- presence (unity -> server -> web) ----
app.post("/presence", (req, res) => {
  const code = normCode(req.body.code);
  const stage = String(req.body.stage || "start").trim();
  if (!code) return res.status(400).json({ ok: false, error: "Missing code" });

  const s = ensureSession(code);
  s.presence = { stage, t: Date.now() };
  res.json({ ok: true });
});

app.get("/presence", (req, res) => {
  const code = normCode(req.query.code);
  if (!code) return res.status(400).json({ ok: false, error: "Missing code" });

  const s = ensureSession(code);
  res.json({ ok: true, stage: s.presence.stage, t: s.presence.t });
});

app.listen(PORT, () => {
  console.log("Remote running on port", PORT);
});
