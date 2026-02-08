const express = require("express");
const cors = require("cors");
const path = require("path");

const app = express();
app.use(cors());
app.use(express.json());

// =======================
// In-memory "mailbox" por sesión
// =======================
const sessions = new Map(); // code -> { lastCmd, updatedAt }

function getOrCreateSession(code) {
  if (!sessions.has(code)) {
    sessions.set(code, { lastCmd: null, updatedAt: Date.now() });
  }
  return sessions.get(code);
}

// =======================
// Static + Home
// =======================
app.get("/", (req, res) => {
  res.sendFile(path.join(__dirname, "index.html"));
});

// (opcional) servir assets si después agregás css/js
app.use("/static", express.static(__dirname));

app.get("/ping", (req, res) => {
  res.type("text/plain").send("pong");
});

// =======================
// API: enviar comando (telefono -> servidor)
// POST /api/cmd { code, player, action, payload? }
// =======================
app.post("/api/cmd", (req, res) => {
  const { code, player, action, payload } = req.body || {};
  if (!code || !action) {
    return res.status(400).json({ ok: false, error: "Missing code or action" });
  }

  const s = getOrCreateSession(String(code).toUpperCase());
  s.lastCmd = {
    code: String(code).toUpperCase(),
    player: player ?? "unknown",
    action: String(action),
    payload: payload ?? null,
    t: Date.now()
  };
  s.updatedAt = Date.now();

  res.json({ ok: true });
});

// =======================
// API: leer último comando (Unity -> servidor)
// GET /api/poll?code=XXXX
// devuelve { ok, cmd } donde cmd puede ser null
// =======================
app.get("/api/poll", (req, res) => {
  const code = String(req.query.code || "").toUpperCase();
  if (!code) return res.status(400).json({ ok: false, error: "Missing code" });

  const s = getOrCreateSession(code);
  const cmd = s.lastCmd;
  // Importante: vaciamos para que sea “consumible”
  s.lastCmd = null;

  res.json({ ok: true, cmd });
});

// =======================
const PORT = process.env.PORT || 10000;
app.listen(PORT, () => {
  console.log("Remote running on port", PORT);
});


