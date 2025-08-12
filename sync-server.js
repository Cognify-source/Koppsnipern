const express = require("express");
const { execSync } = require("child_process");

const app = express();
app.use(express.json());

app.post("/webhook", (req, res) => {
  try {
    const commitSha = req.body?.after || "okänd";
    console.log(`🔔 Push-event mottaget – commit: ${commitSha}`);
    execSync("git fetch origin main && git reset --hard origin/main", { stdio: "inherit" });
    console.log("✅ Synk klar");
    res.status(200).send("✅ Synk klar");
  } catch (err) {
    console.error("❌ Synk misslyckades:", err.message);
    res.status(500).send("Synk misslyckades");
  }
});

const PORT = 3000;
app.listen(PORT, () => {
  const codespaceName = process.env.CODESPACE_NAME;
  if (codespaceName) {
    console.log(`🚀 Sync-server lyssnar på port ${PORT}`);
    console.log(`🌐 Publik webhook-URL: https://${codespaceName}-${PORT}.app.github.dev/webhook`);
  } else {
    console.log(`🚀 Sync-server lyssnar på port ${PORT} (lokalt)`);
  }
});
