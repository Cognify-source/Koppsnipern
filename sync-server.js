require("dotenv").config();
const express = require("express");
const { exec } = require("child_process");
const crypto = require("crypto");

const WEBHOOK_SECRET = process.env.WEBHOOK_SECRET;
if (!WEBHOOK_SECRET) {
  console.error("❌ Ingen WEBHOOK_SECRET hittades. Sätt den i .env eller som miljövariabel.");
  process.exit(1);
}

const PORT = 3000;
const app = express();

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
    return res.status(401).send("Invalid signature");
  }
  res.status(200).send("OK");
  exec("git fetch origin main && git reset --hard origin/main");
});

app.listen(PORT, () => {
  const codespaceName = process.env.CODESPACE_NAME;
  if (codespaceName) {
    console.log(`🚀 Sync-server igång (port ${PORT})`);
    console.log(`🌐 Publik webhook-URL: https://${codespaceName}-${PORT}.app.github.dev/webhook`);
  } else {
    console.log(`🚀 Sync-server igång lokalt (port ${PORT})`);
  }
});
