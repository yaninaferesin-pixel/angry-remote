// server.js (COMPLETO)
// Express server para Remote + Unity polling
// Endpoints:
//  - POST /api/send   { code, cmd }   -> encola comando
//  - GET  /api/poll?code=XXXX         -> devuelve y consume 1 comando
//  - POST /api/state  { code, stage, active } -> guarda presencia
//  - GET  /api/state?code=XXXX        -> devuelve presencia
//  - Sirve /public (index.html)

const express = require("express");
const path = require("path");

const app = express();
app.use(express.json({ limit: "1mb" }));

// In-memory store (ok para demo/jam). Si reinicia Render, se pierde.
const rooms = new Map();
/*
rooms.get(code) => {
  stage, active, updatedAt,
  queue: [ "P1_PLAY", "P1_SLOT0", ... ]
}
*/

function getRoom(codeRaw) {
  const code = String(codeRaw || "").trim().toUpperCase();
  if (!code) return null;

  if (!rooms.has(code)) {
    rooms.set(code, {
      stage: "start",
      active: "P1",
      updatedAt: Date.now(),
      queue: []
    });
  }
  return { code, room: rooms.get(code) };
}

// ---------- API ----------

app.post("/api/send", (req, res) => {
  const { code, cmd } = req.body || {};
  const r = getRoom(code);
  if (!r) return res.status(400).json({ ok: false, error: "Missing code" });

  const cleanCmd = String(cmd || "").trim();
  if (!cleanCmd) return res.status(400).json({ ok: false, error: "Missing cmd" });

  r.room.queue.push(cleanCmd);
  r.room.updatedAt = Date.now();

  return res.json({ ok: true });
});

app.get("/api/poll", (req, res) => {
  const r = getRoom(req.query.code);
  if (!r) return res.status(400).json({ ok: false, error: "Missing code" });

  const next = r.room.queue.length > 0 ? r.room.queue.shift() : "";
  // NO cambiamos stage acá, solo consumimos cmd
  return res.json({ ok: true, cmd: next });
});

app.post("/api/state", (req, res) => {
  const { code, stage, active } = req.body || {};
  const r = getRoom(code);
  if (!r) return res.status(400).json({ ok: false, error: "Missing code" });

  if (typeof stage === "string" && stage.trim()) r.room.stage = stage.trim();
  if (typeof active === "string" && active.trim()) r.room.active = active.trim();

  r.room.updatedAt = Date.now();
  return res.json({ ok: true });
});

app.get("/api/state", (req, res) => {
  const r = getRoom(req.query.code);
  if (!r) return res.status(400).json({ ok: false, error: "Missing code" });

  return res.json({
    ok: true,
    stage: r.room.stage,
    active: r.room.active,
    updatedAt: r.room.updatedAt
  });
});

// ---------- Static ----------
const publicDir = path.join(__dirname, "public");
app.use(express.static(publicDir));

app.get("*", (req, res) => {
  res.sendFile(path.join(publicDir, "index.html"));
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log("Remote server running on port", PORT));
