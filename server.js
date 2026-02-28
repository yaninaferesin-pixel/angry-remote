import express from "express";
import path from "path";
import { fileURLToPath } from "url";

const app = express();
app.use(express.json());

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// ===== Paths =====
const publicPath = path.join(__dirname, "public");

// ✅ Servir carpeta public
app.use(express.static(publicPath));

// Health
app.get("/health", (_req, res) => res.json({ ok: true }));
app.get("/ping", (_req, res) => res.send("pong"));

// ✅ Root siempre devuelve public/index.html
app.get("/", (_req, res) => {
  res.sendFile(path.join(publicPath, "index.html"));
});

// Para rutas con ?code=CULA o refresh
app.get(/^\/(?!api\/).*/, (_req, res) => {
  res.sendFile(path.join(publicPath, "index.html"));
});

// ===== API =====
const queues = new Map();
const state = new Map();

function normCode(code) {
  return String(code || "").trim().toUpperCase();
}
function getQueue(code) {
  if (!queues.has(code)) queues.set(code, []);
  return queues.get(code);
}

app.post("/api/cmd", (req, res) => {
  const code = normCode(req.body?.code);
  const cmd = String(req.body?.cmd || "").trim();

  if (!code) return res.status(400).json({ ok: false });
  if (!cmd) return res.status(400).json({ ok: false });

  getQueue(code).push(cmd);
  return res.json({ ok: true });
});

app.get("/api/poll", (req, res) => {
  const code = normCode(req.query?.code);
  if (!code) return res.status(400).json({ ok: false });

  const q = getQueue(code);
  const cmd = q.length > 0 ? q.shift() : null;
  return res.json({ ok: true, cmd });
});

app.post("/api/state", (req, res) => {
  const code = normCode(req.body?.code);
  const stage = String(req.body?.stage || "");
  const active = String(req.body?.active || "");

  if (!code) return res.status(400).json({ ok: false });

  state.set(code, { stage, active, ts: Date.now() });
  return res.json({ ok: true });
});

app.get("/api/state", (req, res) => {
  const code = normCode(req.query?.code);
  if (!code) return res.status(400).json({ ok: false });

  const s = state.get(code) || { stage: "unknown", active: "", ts: 0 };
  return res.json({ ok: true, ...s });
});

const PORT = process.env.PORT || 10000;
app.listen(PORT, () => {
  console.log(`Remote server running on port ${PORT}`);
});
