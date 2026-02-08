// server.js (CommonJS) - Compatible con Unity RenderRemoteCommandClient.cs
const express = require("express");
const cors = require("cors");
const path = require("path");

const app = express();
app.use(cors());
app.use(express.json({ limit: "200kb" }));

// ---------- CONFIG ----------
const PORT = process.env.PORT || 8080;

// Sesiones por CODE, con colas separadas
// cmds: [{ cmd: "P1_PLAY", t: 123 }]
// drags: [{ player:"P1", phase:"move", x:0.5, y:0.2, t:123 }]
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
      cmds: [],
      drags: [],
    });
  }
  return sessions.get(c);
}

// Limpieza simple (6 horas)
setInterval(() => {
  const now = Date.now();
  for (const [code, s] of sessions.entries()) {
    if (now - s.createdAt > 6 * 60 * 60 * 1000) sessions.delete(code);
  }
}, 30 * 60 * 1000);

// ---------- HEALTH ----------
app.get("/ping", (req, res) => res.type("text").send("pong"));

// ---------- FRONT ----------
const indexPath = path.join(__dirname, "index.html");
app.get("/", (req, res) => res.sendFile(indexPath));

// ---------- API (Unity expects /poll) ----------

// Web -> enviar comando (botón)
// Body: { code:"62TR", cmd:"P1_PLAY" }
app.post("/send", (req, res) => {
  const code = normCode(req.body.code);
  const cmd = String(req.body.cmd || "").trim().toUpperCase();

  if (!code) return res.status(400).json({ ok: false, error: "Missing code" });
  if (!cmd) return res.status(400).json({ ok: false, error: "Missing cmd" });

  const s = ensureSession(code);
  s.cmds.push({ cmd, t: Date.now() });
  return res.json({ ok: true });
});

// Unity -> polling de comandos
// GET /poll?code=62TR
// Devuelve el formato que Unity RenderRemoteCommandClient.cs parsea:
// { ok:true, cmds:[{cmd:"P1_PLAY"}], drags:[{player,phase,x,y}] }
app.get("/poll", (req, res) => {
  const code = normCode(req.query.code);
  if (!code) return res.status(400).json({ ok: false, error: "Missing code" });

  const s = ensureSession(code);

  const cmds = s.cmds.map((c) => ({ cmd: c.cmd }));
  const drags = s.drags.map((d) => ({
    player: d.player,
    phase: d.phase,
    x: d.x,
    y: d.y,
  }));

  // vaciar colas
  s.cmds = [];
  s.drags = [];

  res.json({ ok: true, cmds, drags });
});

// (opcional) touch/drag para slingshot (más adelante)
// Body: { code:"62TR", player:"P1", phase:"start|move|end|cancel", x:0..1, y:0..1 }
app.post("/drag", (req, res) => {
  const code = normCode(req.body.code);
  const player = String(req.body.player || "").trim().toUpperCase();
  const phase = String(req.body.phase || "").trim().toLowerCase();
  const x = Number(req.body.x);
  const y = Number(req.body.y);

  if (!code) return res.status(400).json({ ok: false, error: "Missing code" });
  if (player !== "P1" && player !== "P2")
    return res.status(400).json({ ok: false, error: "player must be P1 or P2" });
  if (!["start", "move", "end", "cancel"].includes(phase))
    return res.status(400).json({ ok: false, error: "Invalid phase" });
  if (!Number.isFinite(x) || !Number.isFinite(y))
    return res.status(400).json({ ok: false, error: "Invalid x/y" });

  const s = ensureSession(code);
  s.drags.push({ player, phase, x, y, t: Date.now() });
  return res.json({ ok: true });
});

// ---------- COMPAT (por si tu web vieja llama /api/...) ----------
// Soportamos también /api/send y /api/poll, pero internamente usamos lo mismo.
app.post("/api/send", (req, res) => {
  // si viene { code, player, cmd } -> armamos cmd final
  const code = normCode(req.body.code);
  const player = String(req.body.player || "P1").trim().toUpperCase();
  const raw = String(req.body.cmd || "").trim().toUpperCase();

  if (!code) return res.status(400).json({ ok: false, error: "Missing code" });
  if (!raw) return res.status(400).json({ ok: false, error: "Missing cmd" });

  let cmd = raw;
  if (!raw.startsWith("P1_") && !raw.startsWith("P2_") && !raw.startsWith("WAIT_")) {
    if (player === "P2") cmd = `P2_${raw}`;
    else if (player === "WAIT") cmd = `WAIT_${raw}`;
    else cmd = `P1_${raw}`;
  }

  const s = ensureSession(code);
  s.cmds.push({ cmd, t: Date.now() });
  return res.json({ ok: true });
});

app.get("/api/poll", (req, res) => {
  // devolvemos mismo formato que /poll para simplificar
  req.url = "/poll" + (req.url.includes("?") ? req.url.slice(req.url.indexOf("?")) : "");
  return app._router.handle(req, res, () => {});
});

// Debug
app.get("/status", (req, res) => {
  const code = normCode(req.query.code);
  if (!code) return res.status(400).json({ ok: false, error: "Missing code" });
  const s = ensureSession(code);
  res.json({ ok: true, code, counts: { cmds: s.cmds.length, drags: s.drags.length } });
});

app.listen(PORT, () => {
  console.log("Remote running on port", PORT);
});
