const express = require("express");
const app = express();

app.use(express.json());

// ===== Memoria simple (FREE) =====
// guardamos “colas” de comandos por sessionCode
const queues = new Map(); // session -> [{t, cmd, data}, ...]

function getQueue(session) {
  if (!queues.has(session)) queues.set(session, []);
  return queues.get(session);
}

// ===== UI del teléfono (la página principal) =====
app.get("/", (req, res) => {
  // puedes cambiar el HTML por tu UI real
  res.setHeader("Content-Type", "text/html; charset=utf-8");
  res.end(`<!doctype html>
<html>
<head>
  <meta name="viewport" content="width=device-width, initial-scale=1"/>
  <title>Angry Remote</title>
  <style>
    body{font-family:sans-serif;background:#111;color:#fff;margin:0;padding:16px}
    .row{display:flex;gap:10px;flex-wrap:wrap;margin-bottom:10px}
    button{padding:14px 16px;font-size:16px;border-radius:12px;border:0;cursor:pointer}
    .big{width:100%}
    .ok{background:#7c3aed;color:#fff}
    .g{background:#222;color:#fff}
    input{padding:12px;border-radius:10px;border:1px solid #444;background:#000;color:#fff;width:160px}
  </style>
</head>
<body>
  <h2>Angry Remote</h2>
  <div class="row">
    <div>Session:</div>
    <input id="s" placeholder="ABCD" />
    <button class="ok" onclick="save()">Conectar</button>
  </div>

  <div class="row">
    <button class="g" onclick="send('P1_PLAY')">P1 Play</button>
    <button class="g" onclick="send('P1_EXIT')">P1 Exit</button>
    <button class="g" onclick="send('P1_TRAILER')">P1 Trailer</button>
    <button class="g" onclick="send('P1_HOME')">P1 Home</button>
  </div>

  <div class="row">
    <button class="g" onclick="send('P2_PLAY')">P2 Play</button>
    <button class="g" onclick="send('P2_EXIT')">P2 Exit</button>
    <button class="g" onclick="send('P2_TRAILER')">P2 Trailer</button>
    <button class="g" onclick="send('P2_HOME')">P2 Home</button>
  </div>

  <button class="ok big" onclick="send('TAP')">TAP (Poder / Click)</button>

<script>
  function save(){
    const v = document.getElementById('s').value.trim().toUpperCase();
    localStorage.setItem('session', v);
    alert('Session guardada: '+v);
  }
  function session(){
    return (document.getElementById('s').value.trim().toUpperCase()
      || localStorage.getItem('session') || 'ABCD');
  }

  async function send(cmd){
    const s = session();
    await fetch('/api/send', {
      method:'POST',
      headers:{'Content-Type':'application/json'},
      body: JSON.stringify({ session: s, cmd })
    });
    // feedback simple
    navigator.vibrate?.(30);
  }

  // autocompletar con localStorage
  document.getElementById('s').value = (localStorage.getItem('session') || 'ABCD');
</script>

</body>
</html>`);
});

// ===== API: enviar comando desde el teléfono =====
app.post("/api/send", (req, res) => {
  const { session, cmd, data } = req.body || {};
  if (!session || !cmd) return res.status(400).json({ ok: false });

  const q = getQueue(String(session).toUpperCase());
  q.push({ t: Date.now(), cmd: String(cmd), data: data ?? null });
  // limite simple para que no crezca infinito
  if (q.length > 200) q.splice(0, q.length - 200);

  res.json({ ok: true });
});

// ===== API: Unity “poll” para recibir comandos =====
app.get("/api/poll", (req, res) => {
  const session = String(req.query.session || "").toUpperCase();
  if (!session) return res.status(400).json({ ok: false, commands: [] });

  const q = getQueue(session);
  const commands = q.splice(0, q.length); // consume todo
  res.json({ ok: true, commands });
});

// ===== Keep-alive / health =====
app.get("/health", (req, res) => res.send("ok"));

const PORT = process.env.PORT || 8080;
app.listen(PORT, () => console.log("Server listening on", PORT));
