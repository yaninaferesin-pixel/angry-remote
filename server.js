import express from "express";
import cors from "cors";

const app = express();
app.use(cors());
app.use(express.json());

// Render te da el puerto por variable de entorno
const PORT = process.env.PORT || 8080;

// Estado en memoria (suficiente para demo)
const sessions = new Map();
// sessions.get(code) = { taps: number, lastTapAt: number }

function getSession(code) {
  if (!sessions.has(code)) {
    sessions.set(code, { taps: 0, lastTapAt: 0 });
  }
  return sessions.get(code);
}
import express from "express";
import cors from "cors";

const app = express();
app.use(cors());
app.use(express.json());

const PORT = process.env.PORT || 8080;

// Estado en memoria: suficiente para demo
// sessions.get(code) = { cmds: [], drags: [], meta: {} }
const sessions = new Map();

function normCode(code) {
  return (code || "").toString().trim().toUpperCase();
}

function getSession(code) {
  if (!sessions.has(code)) {
    sessions.set(code, { cmds: [], drags: [], meta: {} });
  }
  return sessions.get(code);
}

app.get("/ping", (_, res) => res.send("pong"));

// Enviar comando (botón)
app.post("/cmd", (req, res) => {
  const code = normCode(req.body?.code);
  const cmd = (req.body?.cmd || "").toString().trim().toUpperCase();
  if (!code) return res.status(400).json({ ok: false, error: "Missing code" });
  if (!cmd) return res.status(400).json({ ok: false, error: "Missing cmd" });

  const s = getSession(code);
  s.cmds.push({ cmd, t: Date.now() });

  return res.json({ ok: true });
});

// Enviar drag (slingshot)
// payload: { code, player:"P1"/"P2", phase:"start|move|end|cancel", x:0..1, y:0..1 }
app.post("/drag", (req, res) => {
  const code = normCode(req.body?.code);
  const player = (req.body?.player || "").toString().trim().toUpperCase();
  const phase = (req.body?.phase || "").toString().trim().toLowerCase();
  const x = Number(req.body?.x);
  const y = Number(req.body?.y);

  if (!code) return res.status(400).json({ ok: false, error: "Missing code" });
  if (player !== "P1" && player !== "P2") return res.status(400).json({ ok: false, error: "Bad player" });
  if (!["start", "move", "end", "cancel"].includes(phase)) return res.status(400).json({ ok: false, error: "Bad phase" });
  if (!Number.isFinite(x) || !Number.isFinite(y)) return res.status(400).json({ ok: false, error: "Bad x/y" });

  const s = getSession(code);
  s.drags.push({ player, phase, x, y, t: Date.now() });

  return res.json({ ok: true });
});

// Unity hace poll y consume
app.get("/poll", (req, res) => {
  const code = normCode(req.query.code);
  if (!code) return res.status(400).json({ ok: false, error: "Missing code" });

  const s = getSession(code);

  const cmds = s.cmds;
  const drags = s.drags;

  // consumir
  s.cmds = [];
  s.drags = [];

  res.json({ ok: true, cmds, drags, serverTime: Date.now() });
});

app.listen(PORT, () => {
  console.log(`Listening on ${PORT}`);
});
