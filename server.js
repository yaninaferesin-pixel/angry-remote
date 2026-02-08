// server.js
import express from "express";
import path from "path";
import { fileURLToPath } from "url";

const app = express();
app.use(express.json());

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Memoria simple: una cola por "code"
const queues = new Map(); // code -> string[]

function getQueue(code) {
  if (!queues.has(code)) queues.set(code, []);
  return queues.get(code);
}

// Healthcheck
app.get("/ping", (req, res) => res.status(200).send("pong"));

// Servir la web (index.html + assets)
app.use(express.static(path.join(__dirname, "public")));

// Enviar comando desde el teléfono
app.post("/api/send", (req, res) => {
  const { code, cmd } = req.body || {};
  if (!code || !cmd) return res.status(400).json({ ok: false, error: "Missing code/cmd" });

  const q = getQueue(String(code).trim());
  // Guardamos el comando (cola)
  q.push(String(cmd));

  return res.json({ ok: true });
});

// Poll desde Unity: devuelve 1 comando y lo consume
app.get("/api/poll", (req, res) => {
  const code = String(req.query.code || "").trim();
  if (!code) return res.status(400).json({ ok: false, error: "Missing code" });

  const q = getQueue(code);
  const cmd = q.length > 0 ? q.shift() : null;
  return res.json({ ok: true, cmd });
});

// SPA fallback: siempre devolver index.html para rutas desconocidas
app.get("*", (req, res) => {
  res.sendFile(path.join(__dirname, "public", "index.html"));
});

const port = process.env.PORT || 3000;
app.listen(port, () => console.log("Remote running on port", port));

