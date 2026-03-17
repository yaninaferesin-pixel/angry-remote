import express from "express";
import path from "path";
import fs from "fs";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
app.use(express.json());

// -------- In-memory state --------
// code -> { stage, active, ts, result, stars, playersCount, seenP1, seenP2 }
const stateByCode = new Map();

// code -> [cmd strings]
const cmdQueueByCode = new Map();

// -------- Helpers --------
function normCode(code) {
  return (code || "").trim().toUpperCase();
}

function ensureQueue(code) {
  if (!cmdQueueByCode.has(code)) cmdQueueByCode.set(code, []);
  return cmdQueueByCode.get(code);
}

function ensureState(code) {
  if (!stateByCode.has(code)) {
    stateByCode.set(code, {
      stage: "start",
      active: "",
      ts: 0,
      result: "",
      stars: 0,
      playersCount: 0,
      seenP1: false,
      seenP2: false,
    });
  }
  return stateByCode.get(code);
}

function touchState(st) {
  st.ts = Date.now();
}

function clearResultState(st) {
  st.result = "";
  st.stars = 0;
}

function markPlayerSeenFromCmd(st, cmd) {
  if (cmd.startsWith("P1_")) st.seenP1 = true;
  if (cmd.startsWith("P2_")) st.seenP2 = true;

  st.playersCount = (st.seenP1 ? 1 : 0) + (st.seenP2 ? 1 : 0);
}

function setActiveFromCmd(st, cmd) {
  if (cmd.startsWith("P1_")) st.active = "P1";
  else if (cmd.startsWith("P2_")) st.active = "P2";
}

function isCoalescableCommand(cmd) {
  return (
    cmd.startsWith("P1_AIM ") ||
    cmd.startsWith("P2_AIM ") ||
    cmd.startsWith("P1_DRAG ") ||
    cmd.startsWith("P2_DRAG ")
  );
}

function getCommandChannel(cmd) {
  if (cmd.startsWith("P1_AIM ") || cmd.startsWith("P1_DRAG ")) return "P1_AIMLIKE";
  if (cmd.startsWith("P2_AIM ") || cmd.startsWith("P2_DRAG ")) return "P2_AIMLIKE";
  return "";
}

function enqueueCommand(code, cmd) {
  const q = ensureQueue(code);

  // Para AIM/DRAG, no apilamos infinitos: reemplazamos el último del mismo canal.
  if (isCoalescableCommand(cmd)) {
    const channel = getCommandChannel(cmd);

    for (let i = q.length - 1; i >= 0; i--) {
      const existing = q[i];
      if (getCommandChannel(existing) === channel) {
        q[i] = cmd;
        return;
      }

      // Si ya apareció un FIRE/DRAG_END más nuevo, no seguir tocando atrás.
      if (
        existing.startsWith("P1_FIRE") ||
        existing.startsWith("P2_FIRE") ||
        existing.startsWith("P1_DRAG_END") ||
        existing.startsWith("P2_DRAG_END")
      ) {
        break;
      }
    }
  }

  q.push(cmd);

  // Evita colas absurdamente largas
  if (q.length > 120) {
    q.splice(0, q.length - 120);
  }
}

function applyMetaStateFromCommand(st, cmd) {
  switch (cmd) {
    case "P1_PLAY":
    case "P2_PLAY":
      clearResultState(st);
      setActiveFromCmd(st, cmd);
      st.stage = "level";
      touchState(st);
      return true;

    case "P1_TRAILER":
    case "P2_TRAILER":
      clearResultState(st);
      setActiveFromCmd(st, cmd);
      st.stage = "trailer";
      touchState(st);
      return true;

    case "P1_HOME":
    case "P2_HOME":
      clearResultState(st);
      st.active = "";
      st.stage = "start";
      touchState(st);
      return true;

    case "P1_RESTART":
    case "P2_RESTART":
      clearResultState(st);
      setActiveFromCmd(st, cmd);
      st.stage = "level";
      touchState(st);
      return true;

    case "P1_NEXTLEVEL":
    case "P2_NEXTLEVEL":
      clearResultState(st);
      setActiveFromCmd(st, cmd);
      st.stage = "level";
      touchState(st);
      return true;

    case "P1_LEFT":
    case "P2_LEFT":
    case "P1_RIGHT":
    case "P2_RIGHT":
      clearResultState(st);
      setActiveFromCmd(st, cmd);
      st.stage = "select";
      touchState(st);
      return true;

    case "P1_EXIT":
    case "P2_EXIT":
      touchState(st);
      return true;

    default:
      return false;
  }
}

function applyGameplayStateFromCommand(st, cmd) {
  if (
    cmd.includes("_SLOT") ||
    cmd.includes("_HAT") ||
    cmd.includes("_DRAG_BEGIN") ||
    cmd.includes("_DRAG ") ||
    cmd.endsWith("_DRAG") ||
    cmd.includes("_DRAG_END") ||
    cmd.includes("_AIM") ||
    cmd.includes("_FIRE") ||
    cmd.includes("_POWER") ||
    cmd.includes("_LINDA_") ||
    cmd.includes("_LINDA_M1")
  ) {
    setActiveFromCmd(st, cmd);

    if (st.stage !== "end") {
      st.stage = "level";
    }

    touchState(st);
    return true;
  }

  return false;
}

function applyResultCommand(st, cmd) {
  // RESULT_WIN_3
  // RESULT_LOOSE_0
  const parts = cmd.split("_");
  const result = (parts[1] || "").toUpperCase();
  const stars = parseInt(parts[2] || "0", 10) || 0;

  st.stage = "end";
  st.result = result === "LOSE" ? "LOOSE" : result;
  st.stars = Math.max(0, Math.min(3, stars));
  touchState(st);
}

// -------- Health --------
app.get("/ping", (req, res) => res.status(200).send("ok"));

// -------- API: state --------
// Unity puede actualizar stage/active si quiere
app.post("/api/state", (req, res) => {
  const code = normCode(req.body?.code);
  if (!code) return res.status(400).json({ ok: false, error: "missing code" });

  const st = ensureState(code);

  const stage = (req.body?.stage || "").trim();
  const active = (req.body?.active || "").trim();
  const result = (req.body?.result || "").trim().toUpperCase();
  const starsRaw = req.body?.stars;

  if (stage) st.stage = stage;
  if (active) st.active = active;
  if (result) st.result = result === "LOSE" ? "LOOSE" : result;
  if (typeof starsRaw === "number") st.stars = Math.max(0, Math.min(3, starsRaw));

  touchState(st);
  return res.json({ ok: true });
});

app.get("/api/state", (req, res) => {
  const code = normCode(req.query?.code);
  if (!code) return res.status(400).json({ ok: false, error: "missing code" });

  const st = ensureState(code);
  return res.json({
    ok: true,
    stage: st.stage,
    active: st.active,
    ts: st.ts,
    result: st.result,
    stars: st.stars,
    playersCount: st.playersCount,
  });
});

// -------- API: send command --------
app.post("/api/send", (req, res) => {
  const code = normCode(req.body?.code);
  const cmd = (req.body?.cmd || "").trim().toUpperCase();

  if (!code) return res.status(400).json({ ok: false, error: "missing code" });
  if (!cmd) return res.status(400).json({ ok: false, error: "missing cmd" });

  const st = ensureState(code);

  markPlayerSeenFromCmd(st, cmd);

  // Si Unity manda el resultado final al remoto
  if (cmd.startsWith("RESULT_")) {
    applyResultCommand(st, cmd);
    return res.json({ ok: true });
  }

  // Actualizar estado meta/UI
  if (applyMetaStateFromCommand(st, cmd)) {
    enqueueCommand(code, cmd);
    return res.json({ ok: true });
  }

  // Actualizar estado de gameplay normal
  if (applyGameplayStateFromCommand(st, cmd)) {
    enqueueCommand(code, cmd);
    return res.json({ ok: true });
  }

  // Si no reconocimos nada especial, igual lo encolamos
  touchState(st);
  enqueueCommand(code, cmd);
  return res.json({ ok: true });
});

// alias /api/cmd -> /api/send
app.post("/api/cmd", (req, res) => {
  req.url = "/api/send";
  app._router.handle(req, res);
});

// -------- API: poll (Unity) --------
app.get("/api/poll", (req, res) => {
  const code = normCode(req.query?.code);
  if (!code) return res.status(400).json({ ok: false, error: "missing code" });

  const q = ensureQueue(code);
  const cmd = q.length > 0 ? q.shift() : "";
  return res.json({ ok: true, cmd });
});

// -------- Static: serve index --------
const publicDir = path.join(__dirname, "public");
const rootIndex = path.join(__dirname, "index.html");
const publicIndex = path.join(publicDir, "index.html");

if (fs.existsSync(publicDir)) {
  app.use(express.static(publicDir));
}

app.get("/", (req, res) => {
  if (fs.existsSync(publicIndex)) return res.sendFile(publicIndex);
  if (fs.existsSync(rootIndex)) return res.sendFile(rootIndex);
  return res.status(404).send("index.html not found");
});

const PORT = process.env.PORT || 10000;
app.listen(PORT, () => {
  console.log("Remote server running on port", PORT);
});
