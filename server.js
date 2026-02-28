import express from "express";
import path from "path";
import { fileURLToPath } from "url";

const app = express();
app.use(express.json());

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// In-memory
const queues = new Map(); // code -> [cmd...]
const states = new Map(); // code -> { stage, active, updatedAt }

function normCode(c){ return String(c || "").trim().toUpperCase(); }

function getQueue(code){
  const c = normCode(code);
  if(!queues.has(c)) queues.set(c, []);
  return queues.get(c);
}

function getState(code){
  const c = normCode(code);
  if(!states.has(c)) states.set(c, { stage:"start", active:"P1", updatedAt: Date.now() });
  return states.get(c);
}

// Static
app.use(express.static(path.join(__dirname, "public")));

// Send
app.post("/api/send", (req, res)=>{
  const code = normCode(req.body?.code);
  const cmd = String(req.body?.cmd || "").trim();
  if(!code) return res.status(400).json({ ok:false, error:"Missing code" });
  if(!cmd) return res.status(400).json({ ok:false, error:"Missing cmd" });
  getQueue(code).push(cmd);
  return res.json({ ok:true });
});

// Poll
app.get("/api/poll", (req, res)=>{
  const code = normCode(req.query.code);
  if(!code) return res.status(400).json({ ok:false, error:"Missing code" });
  const q = getQueue(code);
  const cmd = q.length ? q.shift() : null;
  return res.json({ ok:true, cmd });
});

// State
app.get("/api/state", (req, res)=>{
  const code = normCode(req.query.code);
  if(!code) return res.status(400).json({ ok:false, error:"Missing code" });
  const st = getState(code);
  return res.json({ ok:true, stage: st.stage, active: st.active, updatedAt: st.updatedAt });
});

app.post("/api/state", (req, res)=>{
  const code = normCode(req.body?.code);
  if(!code) return res.status(400).json({ ok:false, error:"Missing code" });

  const st = getState(code);

  const stage = String(req.body?.stage || "").trim().toLowerCase();
  const active = String(req.body?.active || "").trim().toUpperCase();

  if(stage) st.stage = stage;
  if(active) st.active = active;

  st.updatedAt = Date.now();
  states.set(code, st);

  return res.json({ ok:true, stage: st.stage, active: st.active });
});

// SPA fallback
app.get("*", (req, res)=>{
  res.sendFile(path.join(__dirname, "public", "index.html"));
});

const port = process.env.PORT || 3000;
app.listen(port, ()=>console.log("Remote running on port", port));
