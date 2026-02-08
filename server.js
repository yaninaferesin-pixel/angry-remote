// server.js  (ESM - compatible con "type":"module")
import express from "express";
import path from "path";
import { fileURLToPath } from "url";

const app = express();
app.use(express.json());

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// --- In-memory storage (simple, para demo) ---
const queues = new Map(); // code -> { cmds: [], state: {} }

function getRoom(code) {
  if (!queues.has(code)) queues.set(code, { cmds: [], state: {} });
  return queues.get(code);
}

// --- Health ---
app.get("/ping", (req, res) => res.type("text").send("pong"));

// --- Serve UI (index.html en la raíz del repo) ---
app.get("/", (req, res) => {
  res.sendFile(path.join(__dirname, "index.html"));
});

// --- API: enviar comando desde el teléfono ---
app.post("/api/send", (req, res) => {
  const code = (req.query.code || "").toString().trim().toUpperCase();
  if (!code) return res.status(400).json({ ok: false, error: "Missing code" });

  const room = getRoom(code);
  const cmd = (req.body?.cmd || "").toString().trim();
  const player = (req.body?.player || "").toString().trim(); // opcional

  if (cmd) {
    room.cmds.push({ cmd, player, t: Date.now() });
  }

  res.json({ ok: true });
});

// --- API: Unity hace polling para leer comandos ---
app.get("/poll", (req, res) => {
  const code = (req.query.code || "").toString().trim().toUpperCase();
  if (!code) return res.status(400).json({ ok: false, error: "Missing code" });

  const room = getRoom(code);
  const cmds = room.cmds.splice(0, room.cmds.length); // consume
  res.json({ ok: true, cmds, drags: [] });
});

// --- API: estado (para UI “por etapas”) ---
app.get("/api/state", (req, res) => {
  const code = (req.query.code || "").toString().trim().toUpperCase();
  if (!code) return res.status(400).json({ ok: false, error: "Missing code" });

  const room = getRoom(code);
  res.json({ ok: true, state: room.state || {} });
});

app.post("/api/state", (req, res) => {
  const code = (req.query.code || "").toString().trim().toUpperCase();
  if (!code) return res.status(400).json({ ok: false, error: "Missing code" });

  const room = getRoom(code);
  room.state = { ...(room.state || {}), ...(req.body || {}) };
  res.json({ ok: true });
});

// --- Render port ---
const port = process.env.PORT || 10000;
app.listen(port, () => {
  console.log("Remote running on port", port);
});
