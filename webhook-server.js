// webhook-server.js (debug)
const express = require("express");
const { spawn } = require("child_process");
const crypto = require("crypto");

const app = express();

// Behåller raw body för signaturverifiering
app.use(express.json({ type: "*/*", verify: (req, res, buf) => { req.rawBody = buf; }}));

const PORT = process.env.WEBHOOK_PORT || 3000;
const SECRET = process.env.WEBHOOK_SECRET || "";

// Verifierar GitHub-signaturen och loggar mismatch
function verifySignature(req) {
  if (!SECRET) {
    console.log("⚠️ Ingen secret satt – verifiering avstängd");
    return true;
  }

  const signature = req.headers["x-hub-signature-256"];
  if (!signature) {
    console.log("❌ Ingen signatur mottagen från GitHub");
    return false;
  }

  const hmac = crypto.createHmac("sha256", SECRET);
  hmac.update(req.rawBody);
  const expected = `sha256=${hmac.digest("hex")}`;

  if (signature !== expected) {
    console.log("❌ Signatur mismatch!");
    console.log("   Mottagen signatur:", signature);
    console.log("   Beräknad signatur:", expected);
    return false;
  }

  console.log("✅ Signatur OK");
  return true;
}

app.post("/github-webhook", (req, res) => {
  if (!verifySignature(req)) {
    return res.status(401).send("Invalid signature");
  }

  const event = req.headers["x-github-event"];
  const branch = req.body.ref;

  console.log(`📩 Webhook mottagen: ${event}, branch: ${branch}`);

  if (event === "push" && branch === "refs/heads/main") {
    console.log("🔄 Push till main detekterad, kör git pull...");

    const pull = spawn("git", ["pull"], { cwd: process.cwd() });

    pull.stdout.on("data", (data) => console.log(`git: ${data}`));
    pull.stderr.on("data", (data) => console.error(`git ERR: ${data}`));
    pull.on("close", (code) => console.log(`git pull avslutades med kod ${code}`));
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
