import express from "express";
import path from "path";

const app = express();
const PORT = process.env.PORT || 3000;

// servir archivos estáticos
app.use(express.static("public"));

// ruta raíz (IMPORTANTE)
app.get("/", (req, res) => {
  res.sendFile(path.resolve("public/index.html"));
});

// endpoint de comandos (ejemplo)
app.post("/command", express.json(), (req, res) => {
  console.log("CMD:", req.body);
  res.json({ ok: true });
});

app.listen(PORT, () => {
  console.log("Server running on port", PORT);
});
