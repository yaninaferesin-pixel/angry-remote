const express = require("express");
const path = require("path");

const app = express();
const PORT = process.env.PORT || 3000;

app.use(express.json({ limit: "1mb" }));
app.use(express.urlencoded({ extended: true }));
app.use(express.static(path.join(__dirname, "public")));

const gameState = {
  code: "CULA",
  stage: "start",        // start | trailer | select | level | end
  active: "",            // P1 | P2 | ""
  ts: Date.now(),
  playersCount: 0,
  result: "",            // WIN | LOOSE | ""
  stars: 0,              // 0..3
  lastCommand: "",
  seenPlayers: {
    P1: false,
    P2: false
  }
};

function touchState() {
  gameState.ts = Date.now();
}

function normalizeCmd(value) {
  return String(value || "").trim().toUpperCase();
}

function markPlayerSeenFromCmd(cmd) {
  if (cmd.startsWith("P1_")) gameState.seenPlayers.P1 = true;
  if (cmd.startsWith("P2_")) gameState.seenPlayers.P2 = true;

  gameState.playersCount =
    (gameState.seenPlayers.P1 ? 1 : 0) +
    (gameState.seenPlayers.P2 ? 1 : 0);
}

function clearResultState() {
  gameState.result = "";
  gameState.stars = 0;
}

function setStage(stage) {
  gameState.stage = stage;
  touchState();
}

function setActiveFromCmd(cmd) {
  if (cmd.startsWith("P1_")) gameState.active = "P1";
  else if (cmd.startsWith("P2_")) gameState.active = "P2";
}

function handleResultCommand(cmd) {
  // RESULT_WIN_3
  // RESULT_LOOSE_0
  const parts = cmd.split("_");
  const result = (parts[1] || "").toUpperCase();
  const stars = parseInt(parts[2] || "0", 10) || 0;

  gameState.stage = "end";
  gameState.result = result === "LOSE" ? "LOOSE" : result;
  gameState.stars = Math.max(0, Math.min(3, stars));
  touchState();
}

function handleMetaCommand(cmd) {
  switch (cmd) {
    case "P1_PLAY":
    case "P2_PLAY":
      clearResultState();
      setActiveFromCmd(cmd);
      setStage("level");
      return true;

    case "P1_TRAILER":
    case "P2_TRAILER":
      clearResultState();
      setActiveFromCmd(cmd);
      setStage("trailer");
      return true;

    case "P1_HOME":
    case "P2_HOME":
      clearResultState();
      gameState.active = "";
      setStage("start");
      return true;

    case "P1_RESTART":
    case "P2_RESTART":
      clearResultState();
      setActiveFromCmd(cmd);
      setStage("level");
      return true;

    case "P1_EXIT":
    case "P2_EXIT":
      // el remoto solo registra el estado; Unity hace el quit real
      touchState();
      return true;

    case "P1_NEXTLEVEL":
    case "P2_NEXTLEVEL":
      clearResultState();
      setActiveFromCmd(cmd);
      setStage("level");
      return true;

    case "P1_LEFT":
    case "P2_LEFT":
    case "P1_RIGHT":
    case "P2_RIGHT":
      clearResultState();
      setActiveFromCmd(cmd);
      setStage("select");
      return true;

    default:
      return false;
  }
}

function handleGameplayCommand(cmd) {
  // selección / drag / powers / linda
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
    setActiveFromCmd(cmd);

    // si todavía no estamos en end, mantenemos level
    if (gameState.stage !== "end") {
      setStage("level");
    } else {
      touchState();
    }

    return true;
  }

  return false;
}

app.get("/api/state", (req, res) => {
  const code = String(req.query.code || "").trim().toUpperCase();

  if (code && code !== gameState.code) {
    return res.json({
      ok: true,
      stage: "start",
      active: "",
      ts: Date.now(),
      playersCount: 0,
      result: "",
      stars: 0
    });
  }

  return res.json({
    ok: true,
    stage: gameState.stage,
    active: gameState.active,
    ts: gameState.ts,
    playersCount: gameState.playersCount,
    result: gameState.result,
    stars: gameState.stars,
    lastCommand: gameState.lastCommand
  });
});

app.post("/api/send", (req, res) => {
  const rawCmd = req.body && req.body.cmd ? req.body.cmd : "";
  const rawCode = req.body && req.body.code ? req.body.code : gameState.code;

  const cmd = normalizeCmd(rawCmd);
  const code = String(rawCode || "").trim().toUpperCase();

  if (!cmd) {
    return res.status(400).json({ ok: false, error: "Missing cmd" });
  }

  gameState.code = code || gameState.code;
  gameState.lastCommand = cmd;

  markPlayerSeenFromCmd(cmd);

  if (cmd.startsWith("RESULT_")) {
    handleResultCommand(cmd);
    return res.json({ ok: true, state: gameState });
  }

  if (handleMetaCommand(cmd)) {
    return res.json({ ok: true, state: gameState });
  }

  if (handleGameplayCommand(cmd)) {
    return res.json({ ok: true, state: gameState });
  }

  touchState();
  return res.json({ ok: true, state: gameState });
});

app.get("*", (req, res) => {
  res.sendFile(path.join(__dirname, "public", "index.html"));
});

app.listen(PORT, () => {
  console.log(`Angry Remote escuchando en http://localhost:${PORT}`);
});
