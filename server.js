import express from "express";
import path from "path";
import fs from "fs";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
app.use(express.json());

// code -> { stage, active, ts }
const stateByCode = new Map();
// code -> string[]
const cmdQueueByCode = new Map();

function normCode(code) {
  return (code || "").trim().toUpperCase();
}
function ensureQueue(code) {
  if (!cmdQueueByCode.has(code)) cmdQueueByCode.set(code, []);
  return cmdQueueByCode.get(code);
}

// health
app.get("/ping", (req, res) => res.status(200).send("ok"));

// state
app.post("/api/state", (req, res) => {
  const code = normCode(req.body?.code);
  if (!code) return res.status(400).json({ ok: false, error: "missing code" });

  const stage = (req.body?.stage || "").trim();
  const active = (req.body?.active || "").trim();

  stateByCode.set(code, { stage, active, ts: Date.now() });
  return res.json({ ok: true });
});

app.get("/api/state", (req, res) => {
  const code = normCode(req.query?.code);
  if (!code) return res.status(400).json({ ok: false, error: "missing code" });

  const st = stateByCode.get(code) || { stage: "start", active: "", ts: 0 };
  return res.json({ ok: true, ...st });
});

// send command
app.post("/api/send", (req, res) => {
  const code = normCode(req.body?.code);
  const cmd = (req.body?.cmd || "").trim();
  if (!code) return res.status(400).json({ ok: false, error: "missing code" });
  if (!cmd) return res.status(400).json({ ok: false, error: "missing cmd" });

  ensureQueue(code).push(cmd);
  return res.json({ ok: true });
});

// poll (Unity)
app.get("/api/poll", (req, res) => {
  const code = normCode(req.query?.code);
  if (!code) return res.status(400).json({ ok: false, error: "missing code" });

  const q = ensureQueue(code);
  const cmd = q.length > 0 ? q.shift() : "";
  return res.json({ ok: true, cmd });
});

// static
const publicDir = path.join(__dirname, "public");
const publicIndex = path.join(publicDir, "index.html");
const rootIndex = path.join(__dirname, "index.html");

if (fs.existsSync(publicDir)) app.use(express.static(publicDir));

app.get("/", (req, res) => {
  if (fs.existsSync(publicIndex)) return res.sendFile(publicIndex);
  if (fs.existsSync(rootIndex)) return res.sendFile(rootIndex);
  return res.status(404).send("index.html not found");
});

const PORT = process.env.PORT || 10000;
app.listen(PORT, () => console.log("Remote server running on port", PORT));
