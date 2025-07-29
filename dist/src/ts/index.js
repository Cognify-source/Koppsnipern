"use strict";
// src/ts/index.ts
Object.defineProperty(exports, "__esModule", { value: true });
exports.startBot = void 0;
/**
 * Huvudingång för boten.
 * Just nu returnerar vi bara true och loggar en uppstartsmeddelande.
 */
function startBot() {
    console.log("🤖 Bot uppstartad!");
    return true;
}
exports.startBot = startBot;
// Om du skulle vilja köra det direkt:
// (obs: i produktion kommer du istället importera startBot i ett annat script)
if (require.main === module) {
    startBot();
}
