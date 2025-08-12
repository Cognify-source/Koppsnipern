const express = require("express");
const { exec } = require("child_process");
const crypto = require("crypto");

const WEBHOOK_SECRET = process.env.WEBHOOK_SECRET;
const PORT = 3000;
const app = express();

// Behåll rå body för signaturverifiering
app.use(express.json({
  verify: (req, res, buf) => {
    req.rawBody = buf;
  }
}));

function verifySignature(req) {
  const signature = req.headers["x-hub-signature-256"];
  if (!signature) return false;
  const hmac = crypto.createHmac("sha256", WEBHOOK_SECRET);
  const digest = "sha256=" + hmac.update(req.rawBody).digest("hex");
  return crypto.timingSafeEqual(Buffer.from(signature), Buffer.from(digest));
}

app.post("/webhook", (req, res) => {
  if (!verifySignature(req)) {
    console.warn("⚠️ Ogiltig signatur – avvisar request");
    return res.status(401).send("Invalid signature");
  }

  const commitSha = req.body?.after || "okänd";
  console.log(`🔔 Push-event mottaget – commit: ${commitSha}`);

  // Svara GitHub direkt
  res.status(200).send("OK");

  // Kör synken i bakgrunden
  exec("git fetch origin main && git reset --hard origin/main", (error, stdout, stderr) => {
    if (error) {
      console.error(`❌ Synk misslyckades: ${error.message}`);
      return;
    }
    console.log(`✅ Synk klar ${new Date().toLocaleTimeString()} – commit: ${commitSha}`);
    if (stdout) console.log(stdout);
    if (stderr) console.error(stderr);
  });
});

app.listen(PORT, () => {
  const codespaceName = process.env.CODESPACE_NAME;
  if (codespaceName) {
    console.log(`🚀 Sync-server lyssnar på port ${PORT}`);
    console.log(`🌐 Publik webhook-URL: https://${codespaceName}-${PORT}.app.github.dev/webhook`);
  } else {
    console.log(`🚀 Sync-server lyssnar på port ${PORT} (lokalt)`);
  }
});
