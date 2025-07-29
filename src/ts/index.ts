// src/ts/index.ts

/**
 * Huvudingång för boten.
 * Just nu returnerar vi bara true och loggar en uppstartsmeddelande.
 */
export function startBot(): boolean {
  console.log("🤖 Bot uppstartad!");
  return true;
}

// Om du skulle vilja köra det direkt:
// (obs: i produktion kommer du istället importera startBot i ett annat script)
if (require.main === module) {
  startBot();
}
