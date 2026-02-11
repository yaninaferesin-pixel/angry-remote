// ---------- PRESENCE / STAGE (Unity -> server -> phone) ----------
// Unity postea: { code:"CULA", stage:"start|select|level|wait", active:"P1|P2|WAIT" }
// El teléfono lee y cambia UI automático.

app.post("/api/presence", (req, res) => {
  const code = normCode(req.body.code);
  if (!code) return res.status(400).json({ ok: false, error: "Missing code" });

  const stage = String(req.body.stage || "start").toLowerCase();
  const active = String(req.body.active || "P1").toUpperCase();

  const s = ensureSession(code);
  s.presence = {
    stage,
    active,
    t: Date.now()
  };

  res.json({ ok: true });
});

app.get("/api/presence", (req, res) => {
  const code = normCode(req.query.code);
  if (!code) return res.status(400).json({ ok: false, error: "Missing code" });

  const s = ensureSession(code);
  res.json({ ok: true, presence: s.presence || null });
});
