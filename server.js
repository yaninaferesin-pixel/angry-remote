// server.js (ESM)
import express from "express";
import path from "path";
import { fileURLToPath } from "url";

const app = express();
app.use(express.json({ limit: "200kb" }));

const PORT = process.env.PORT || 10000;

// -------- paths --------
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// -------- memory --------
const sessions = new Map();

function normCode(code) {
  return String(code || "").trim().toUpperCase().replace(/[^A-Z0-9]/g, "");
}
function ensureSession(code) {
  const c = normCode(code);
  if (!sessions.has(c)) {
    sessions.set(c, {
      createdAt: Date.now(),
      queue: [],
      presence: { stage: "start", t: Date.now() }
    });
  }
  return sessions.get(c);
}

// cleanup (6h)
setInterval(() => {
  const now = Date.now();
  for (const [code, s] of sessions.entries()) {
    if (now - s.createdAt > 6 * 60 * 60 * 1000) sessions.delete(code);
  }
}, 30 * 60 * 1000);

// -------- health --------
app.get("/ping", (req, res) => res.type("text").send("pong"));

// -------- front --------
app.get("/", (req, res) => {
  res.sendFile(path.join(__dirname, "index.html"));
});

// -------- api: send command --------
app.post("/api/send", (req, res) => {
  const code = normCode(req.body.code);
  if (!code) return res.status(400).json({ ok: false, error: "Missing code" });

  let cmd = String(req.body.cmd || "").trim();

  // compat: si te mandan player + cmd separado
  const player = String(req.body.player || "").trim().toUpperCase();
  if (!cmd && req.body.action) cmd = String(req.body.action || "").trim();
  if (cmd && player && !cmd.startsWith("P1_") && !cmd.startsWith("P2_") && !cmd.startsWith("WAIT_")) {
    cmd = `${player}_${cmd}`;
  }

  if (!cmd) return res.status(400).json({ ok: false, error: "Missing cmd" });

  const s = ensureSession(code);
  s.queue.push({ cmd, t: Date.now(), data: req.body.data ?? null });

  return res.json({ ok: true });
});

// -------- api: poll (Unity) --------
app.get("/api/poll", (req, res) => {
  const code = normCode(req.query.code);
  if (!code) return res.status(400).json({ ok: false, error: "Missing code" });

  const s = ensureSession(code);
  const events = s.queue;
  s.queue = [];

  // devolvemos modo cola + (por compat) cmd simple si hay 1
  const cmd = events.length === 1 ? events[0].cmd : "";
  res.json({ ok: true, cmd, events });
});

// -------- api: presence (Unity -> Web) --------
app.post("/api/presence", (req, res) => {
  const code = normCode(req.body.code);
  const stage = String(req.body.stage || "").trim().toLowerCase() || "start";
  if (!code) return res.status(400).json({ ok: false, error: "Missing code" });

  const s = ensureSession(code);
  s.presence = { stage, t: Date.now() };
  res.json({ ok: true });
});

app.get("/api/presence", (req, res) => {
  const code = normCode(req.query.code);
  if (!code) return res.status(400).json({ ok: false, error: "Missing code" });

  const s = ensureSession(code);
  res.json({ ok: true, stage: s.presence.stage, t: s.presence.t });
});

app.listen(PORT, () => {
  console.log("Remote running on port", PORT);
});
