// webhook-server.js
const express = require("express");
const { exec } = require("child_process");
const crypto = require("crypto");

const app = express();

// Läser in raw body för signaturverifiering
app.use(express.json({ type: "*/*", verify: (req, res, buf) => { req.rawBody = buf; }}));

const PORT = process.env.WEBHOOK_PORT || 3000;
const SECRET = process.env.WEBHOOK_SECRET || "";

// Verifiera GitHub-signatur
function verifySignature(req) {
  if (!SECRET) return true; // Ingen secret -> hoppa verifiering

  const signature = req.headers["x-hub-signature-256"];
  if (!signature) return false;

  const hmac = crypto.createHmac("sha256", SECRET);
  hmac.update(req.rawBody);
  const expected = `sha256=${hmac.digest("hex")}`;

  try {
    return crypto.timingSafeEqual(Buffer.from(signature), Buffer.from(expected));
  } catch {
    return false;
  }
}

app.post("/github-webhook", (req, res) => {
  if (!verifySignature(req)) {
    console.log("❌ Ogiltig signatur – förfrågan nekas");
    return res.status(401).send("Invalid signature");
  }

  const event = req.headers["x-github-event"];
  const branch = req.body.ref;

  console.log(`📩 Webhook mottagen: ${event}, branch: ${branch}`);

  if (event === "push" && branch === "refs/heads/main") {
    console.log("🔄 Push till main detekterad, kör git pull...");
    exec("git pull", { cwd: process.cwd() }, (err, stdout, stderr) => {
      if (err) {
        console.error(`❌ Fel vid git pull: ${stderr}`);
      } else {
        console.log(`✅ git pull klart:\n${stdout}`);
      }
    });
  }

  res.status(200).send("OK");
});

app.listen(PORT, () => {
  console.log(`🚀 Webhookserver lyssnar på port ${PORT}`);
  if (SECRET) {
    console.log("🔒 Secret-verifiering är aktiverad");
  } else {
    console.log("⚠️ Ingen secret satt – verifiering avstängd");
  }
});
