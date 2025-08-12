const express = require("express");
const { execSync } = require("child_process");

const app = express();
app.use(express.json());

app.post("/webhook", (req, res) => {
  try {
    console.log("🔔 Push-event mottaget – drar senaste kod...");
    execSync("git fetch origin main && git reset --hard origin/main", { stdio: "inherit" });
    res.status(200).send("✅ Synk klar");
  } catch (err) {
    console.error("❌ Synk misslyckades:", err.message);
    res.status(500).send("Synk misslyckades");
  }
});

const PORT = 3000;
app.listen(PORT, () => console.log(`🚀 Sync-server lyssnar på port ${PORT}`));
