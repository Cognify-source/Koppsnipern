// webhook-server.js
const express = require("express");
const { exec } = require("child_process");

const app = express();
app.use(express.json({ type: "*/*" })); // Hantera alla typer av payload

const PORT = process.env.WEBHOOK_PORT || 3000;
const SECRET = process.env.WEBHOOK_SECRET || ""; // Kan användas för signaturverifiering

app.post("/github-webhook", (req, res) => {
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
});
