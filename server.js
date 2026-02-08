// server.js
const express = require("express");
const path = require("path");

const app = express();
app.use(express.json());

// ====== DATA EN MEMORIA (por code) ======
const queues = new Map(); // code -> [ "CMD", ... ]
const states = new Map(); // code -> { stage, activePlayer, t }

function getQueue(code) {
  if (!queues.has(code)) queues.set(code, []);
  return queues.get(code);
}

function getState(code) {
  if (!states.has(code)) {
    states.set(code, { stage: "start", activePlayer: 1, t: Date.now() });
  }
  return states.get(code);
}

// ====== STATIC ======
app.use(express.static(path.join(__dirname, "public")));

// ====== HEALTH ======
app.get("/ping", (req, res) => res.send("pong"));

// ====== SEND COMMAND ======
app.post("/api/send", (req, res) => {
  const { code, cmd } = req.body || {};
  if (!code || !cmd) return res.status(400).json({ ok: false, error: "Missing code/cmd" });

  const q = getQueue(String(code).trim());
  q.push(String(cmd));
  return res.json({ ok: true });
});

// ====== POLL (Unity) ======
app.get("/api/poll", (req, res) => {
  const code = String(req.query.code || "").trim();
  if (!code) return res.status(400).json({ ok: false, error: "Missing code" });

  const q = getQueue(code);
  const cmd = q.length > 0 ? q.shift() : null;

  // Formato nuevo que Unity espera
  const cmds = cmd ? [{ cmd }] : [];
  return res.json({ ok: true, cmds, drags: [], cmd }); // cmd se deja por compatibilidad
});

// ====== STATE (Unity -> Web UI) ======
app.post("/api/state", (req, res) => {
  const { code, stage, activePlayer } = req.body || {};
  if (!code) return res.status(400).json({ ok: false, error: "Missing code" });

  states.set(String(code).trim(), {
    stage: stage || "start",
    activePlayer: Number(activePlayer) || 1,
    t: Date.now(),
  });

  return res.json({ ok: true });
});

app.get("/api/state", (req, res) => {
  const code = String(req.query.code || "").trim();
  if (!code) return res.status(400).json({ ok: false, error: "Missing code" });

  return res.json({ ok: true, state: getState(code) });
});

// SPA fallback
app.get("*", (req, res) => {
  res.sendFile(path.join(__dirname, "public", "index.html"));
});

const port = process.env.PORT || 3000;
app.listen(port, () => console.log("Remote running on port", port));
;


