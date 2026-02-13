// server.js
import express from "express";
import path from "path";
import { fileURLToPath } from "url";

const app = express();
app.use(express.json());

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// ------------------------------
// In-memory store (simple y suficiente)
// ------------------------------
/**
 * commands[code][player] = [ "P1_PLAY", ... ]
 */
const commands = new Map();

/**
 * presence[code] = { stage: "start"|"select"|"level"|"trailer"|"wait", ts: Date.now() }
 */
const presence = new Map();

function normCode(code) {
  return String(code || "").trim().toUpperCase();
}

function inferPlayer(cmd) {
  // cmd esperado: "P1_PLAY" / "P2_LEFT" / "WAIT_X"
  if (!cmd) return "P1";
  if (cmd.startsWith("P2_")) return "P2";
  if (cmd.startsWith("WAIT_")) return "WAIT";
  return "P1";
}

function pushCommand(code, cmd) {
  const player = inferPlayer(cmd);
  if (!commands.has(code)) commands.set(code, new Map());
  const byPlayer = commands.get(code);
  if (!byPlayer.has(player)) byPlayer.set(player, []);
  byPlayer.get(player).push(cmd);
}

function popCommands(code, player) {
  if (!commands.has(code)) return [];
  const byPlayer = commands.get(code);
  if (!byPlayer.has(player)) return [];
  const list = byPlayer.get(player);
  byPlayer.set(player, []); // clear
  return list;
}

// ------------------------------
// Static (public/index.html)
// ------------------------------
app.use(express.static(path.join(__dirname, "public")));

app.get("/", (req, res) => {
  res.sendFile(path.join(__dirname, "public", "index.html"));
});

// ------------------------------
// API
// ------------------------------
app.post("/api/send", (req, res) => {
  const code = normCode(req.body?.code);
  const cmd = String(req.body?.cmd || "").trim();

  if (!code || !cmd) return res.status(400).json({ ok: false, error: "missing code/cmd" });

  pushCommand(code, cmd);
  return res.json({ ok: true });
});

app.get("/api/poll", (req, res) => {
  const code = normCode(req.query?.code);
  const player = String(req.query?.player || "P1").trim().toUpperCase();

  if (!code) return res.status(400).json({ ok: false, error: "missing code" });

  const cmds = popCommands(code, player);
  return res.json({ ok: true, cmds });
});

app.post("/api/presence", (req, res) => {
  const code = normCode(req.body?.code);
  const stage = String(req.body?.stage || "").trim().toLowerCase();

  if (!code || !stage) return res.status(400).json({ ok: false, error: "missing code/stage" });

  presence.set(code, { stage, ts: Date.now() });
  return res.json({ ok: true, stage });
});

app.get("/api/presence", (req, res) => {
  const code = normCode(req.query?.code);
  if (!code) return res.status(400).json({ ok: false, error: "missing code" });

  const p = presence.get(code);
  // default: start
  return res.json({ ok: true, stage: p?.stage || "start", ts: p?.ts || 0 });
});

// ------------------------------
// Start
// ------------------------------
const PORT = process.env.PORT || 10000;
app.listen(PORT, () => {
  console.log(`Remote running on port ${PORT}`);
});
