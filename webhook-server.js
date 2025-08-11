// webhook-server.js (minimal)
const express = require("express");
const { spawn } = require("child_process");
const crypto = require("crypto");

const app = express();
app.use(express.json({ type: "*/*", verify: (req, res, buf) => { req.rawBody = buf; }}));

const PORT = process.env.WEBHOOK_PORT || 3000;
const SECRET = process.env.WEBHOOK_SECRET || "";

function verifySignature(req) {
  if (!SECRET) return true;
  const signature = req.headers["x-hub-signature-256"];
  if (!signature) return false;
  const hmac = crypto.createHmac("sha256", SECRET);
  hmac.update(req.rawBody);
  const expected = `sha256=${hmac.digest("hex")}`;
  return signature === expected;
}

app.post("/github-webhook", (req, res) => {
  if (!verifySignature(req)) return res.status(401).send("Invalid signature");
  if (req.headers["x-github-event"] === "push" && req.body.ref === "refs/heads/main") {
    const pull = spawn("git", ["pull"], { cwd: process.cwd() });
    pull.on("close", () => {});
  }
  res.status(200).send("OK");
});

app.listen(PORT, "0.0.0.0");
