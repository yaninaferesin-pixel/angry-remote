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

// Healthcheck
app.get("/ping", (req, res) => res.send("pong"));

// El telefono llama esto al tocar
app.post("/tap", (req, res) => {
  const code = (req.body?.code || "").toString().trim().toUpperCase();
  if (!code) return res.status(400).json({ ok: false, error: "Missing code" });

  const s = getSession(code);
  s.taps += 1;
  s.lastTapAt = Date.now();

  return res.json({ ok: true });
});

// Unity consulta esto (poll) para consumir taps pendientes
app.get("/poll", (req, res) => {
  const code = (req.query.code || "").toString().trim().toUpperCase();
  if (!code) return res.status(400).json({ ok: false, error: "Missing code" });

  const s = getSession(code);
  const taps = s.taps;
  s.taps = 0; // consumir

  return res.json({ ok: true, taps, serverTime: Date.now() });
});

app.listen(PORT, () => {
  console.log(`Listening on ${PORT}`);
});
