import express from "express";
import path from "path";
import fs from "fs";
import { fileURLToPath } from "url";

const app = express();
app.use(express.json());

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Rutas posibles para index.html
const publicDir = path.join(__dirname, "public");
const indexInPublic = path.join(publicDir, "index.html");
const indexInRoot = path.join(__dirname, "index.html");

// --- Estado simple en memoria (demo) ---
/**
 * sessions[code] = {
 *   lastCmd: { cmd: string, at: number } | null
 * }
 */
const sessions = new Map();

function ensureSession(code) {
  if (!sessions.has(code)) sessions.set(code, { lastCmd: null });
  return sessions.get(code);
}

// --- API ---
app.get("/ping", (req, res) => res.type("text").send("pong"));

app.post("/api/send", (req, res) => {
  const { code, cmd } = req.body || {};
  if (!code || !cmd) return res.status(400).json({ ok: false, error: "Missing code/cmd" });

  const s = ensureSession(code);
  s.lastCmd = { cmd: String(cmd), at: Date.now() };
  return res.json({ ok: true });
});

// Unity hace polling para leer el último comando
app.get("/api/poll", (req, res) => {
  const code = String(req.query.code || "");
  if (!code) return res.status(400).json({ ok: false, error: "Missing code" });

  const s = ensureSession(code);

  const out = s.lastCmd ? { cmd: s.lastCmd.cmd, at: s.lastCmd.at } : null;
  s.lastCmd = null; // lo consumimos
  return res.json({ ok: true, data: out });
});

// --- Static + UI ---
if (fs.existsSync(publicDir)) {
  app.use(express.static(publicDir));
}

// Home: sirve index.html sí o sí (public primero, root después)
app.get("/", (req, res) => {
  if (fs.existsSync(indexInPublic)) return res.sendFile(indexInPublic);
  if (fs.existsSync(indexInRoot)) return res.sendFile(indexInRoot);

  res
    .status(200)
    .type("html")
    .send(`
      <html>
        <body style="font-family: sans-serif; padding: 24px;">
          <h2>Remote UI</h2>
          <p>No encuentro <b>public/index.html</b> ni <b>index.html</b>.</p>
          <p>Solución: creá la carpeta <b>public</b> y mové ahí tu <b>index.html</b>.</p>
        </body>
      </html>
    `);
});

// Render usa process.env.PORT
const PORT = process.env.PORT || 10000;
app.listen(PORT, () => {
  console.log("Remote running on port", PORT);
});




