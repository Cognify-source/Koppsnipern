// scripts/utils/inspect_mint_origin.ts
import https from 'https';
import dotenv from 'dotenv';
dotenv.config();

const RPC_ENDPOINT = 'https://api.mainnet-beta.solana.com';
const MINT = process.argv[2]; // t.ex. mint-adress från terminalen
if (!MINT) {
  console.error('⚠️ Ange mint-address som argument');
  process.exit(1);
}

function rpcRequest(method: string, params: any): Promise<any> {
  const payload = JSON.stringify({
    jsonrpc: '2.0',
    id: 1,
    method,
    params
  });

  return new Promise((resolve, reject) => {
    const req = https.request(RPC_ENDPOINT, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(payload)
      }
    }, res => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        try {
          resolve(JSON.parse(data).result);
        } catch (e) {
          reject(e);
        }
      });
    });
    req.on('error', reject);
    req.write(payload);
    req.end();
  });
}

async function main() {
  try {
    const sigs = await rpcRequest('getSignaturesForAddress', [MINT, { limit: 5 }]);
    if (!sigs || !sigs.length) {
      console.error('❌ Inga transaktioner hittades för mint');
      return;
    }

    for (const sig of sigs) {
      const tx = await rpcRequest('getTransaction', [sig.signature, { encoding: 'jsonParsed' }]);
      console.log(`\n🔹 Transaktion: ${sig.signature}`);
      console.log(`🕒 Block time: ${new Date((tx?.blockTime || 0) * 1000).toISOString()}`);
      const ix = tx?.transaction?.message?.instructions || [];
      for (const inst of ix) {
        const prog = inst.programId || inst.programIdIndex;
        const name = inst.parsed?.type || '(unknown)';
        console.log(`  ↳ Program: ${prog}, Instruktion: ${name}`);
      }
    }
  } catch (e) {
    console.error('❌ RPC error:', e);
  }
}

main();
