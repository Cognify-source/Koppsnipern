// src/ts/services/notifyService.ts

import fetch from "node-fetch";

export async function notifyDiscord(message: string): Promise<void> {
  const url = process.env.DISCORD_WEBHOOK_URL;
  if (!url) return;

  try {
    await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ content: message }),
    });
  } catch (err) {
    console.error("⚠️ Discord-ping misslyckades:", err);
  }
}
