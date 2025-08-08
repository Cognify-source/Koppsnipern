// safetyServiceTest.ts
// Enkel testkörning av SafetyService v1 i TypeScript
// Justerad importväg för att matcha placeringen i /src/ts/services

import { checkPoolSafety } from './safetyService';

async function runTest() {
  console.log('Kör SafetyService test med mock-data...');
  console.log('Nuvarande arbetsmapp:', process.cwd());
  console.log('Kör från projektroten med: npx ts-node src/ts/services/safetyServiceTest.ts');

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
    console.log('Resultat:', result);
    if (result.status === 'SAFE') {
      console.log('✅ Poolen passerade alla säkerhetskontroller.');
    } else {
      console.log('⛔ Poolen blockerades av följande skäl:', result.reasons.join(', '));
    }
  } catch (err) {
    console.error('Fel vid körning av SafetyService:', err);
  }
}

runTest();