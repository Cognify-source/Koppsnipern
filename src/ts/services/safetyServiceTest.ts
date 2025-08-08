// safetyServiceTest.ts
// Enkel testkörning av SafetyService v1 i TypeScript
// Justerad importväg för att matcha placeringen i /src/ts/services

import { checkPoolSafety } from './safetyService';
import fetch from 'node-fetch';
import dotenv from 'dotenv';

// Ladda in variabler från .env
dotenv.config();

const DISCORD_WEBHOOK_URL: string = process.env.DISCORD_WEBHOOK_URL || '';

const colors = {
  reset: '\x1b[0m',
  bright: '\x1b[1m',
  fgGreen: '\x1b[32m',
  fgRed: '\x1b[31m',
  fgYellow: '\x1b[33m',
  fgCyan: '\x1b[36m'
};

async function runTest() {
  console.log(colors.fgCyan + 'Kör SafetyService test med mock-data...' + colors.reset);
  console.log(colors.fgYellow + 'Nuvarande arbetsmapp:' + colors.reset, process.cwd());
  console.log(colors.fgYellow + 'Kör från projektroten med:' + colors.reset, 'npx ts-node src/ts/services/safetyServiceTest.ts');

  const mockPool = {
    address: 'TestPool123',
    mint: 'TestMintABC',
    mintAuthority: null,
    freezeAuthority: null,
    lpSol: 42,
    creatorFee: 3,
    estimatedSlippage: 2.5
  };

  try {
    const result = await checkPoolSafety(mockPool as any);

    // Terminalutskrift
    console.log('\n📊 ' + colors.bright + 'Säkerhetskontrollresultat:' + colors.reset);
    console.log(colors.fgCyan + JSON.stringify(result, null, 2) + colors.reset);
    if (result.status === 'SAFE') {
      console.log('\n✅ ' + colors.fgGreen + 'Poolen passerade alla säkerhetskontroller.' + colors.reset);
    } else {
      console.log('\n⛔ ' + colors.fgRed + 'Poolen blockerades av följande skäl:' + colors.reset);
      result.reasons.forEach((reason, index) => {
        console.log(colors.fgRed + `  ${index + 1}. ${reason}` + colors.reset);
      });
    }

    // Skicka till Discord
    if (DISCORD_WEBHOOK_URL) {
      const discordMessage = {
        content: `**Säkerhetskontrollresultat**\n\nStatus: ${result.status === 'SAFE' ? '✅ SAFE' : '⛔ BLOCKED'}\n\n\`\`\`json\n${JSON.stringify(result, null, 2)}\n\`\`\``
      };
      await fetch(DISCORD_WEBHOOK_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(discordMessage)
      });
      console.log(colors.fgCyan + '\n📤 Resultat skickat till Discord.' + colors.reset);
    } else {
      console.log(colors.fgYellow + '\n⚠️ Ingen Discord-webhook angiven. Hoppar över Discord-loggning.' + colors.reset);
    }
  } catch (err) {
    console.error(colors.fgRed + 'Fel vid körning av SafetyService:' + colors.reset, err);
  }
}

runTest();
