// scripts/utils/fetch_price_movement.ts
import fs from 'fs';
import https from 'https';

const INPUT_FILE = 'cupsyy_pools.json';
const OUTPUT_FILE = 'price_movements.json';
const BITQUERY_ENDPOINT = 'https://graphql.bitquery.io';

function loadJSON(path: string): any {
  return JSON.parse(fs.readFileSync(path, 'utf-8'));
}

function buildQuery(mint: string, startTime: string): string {
  return JSON.stringify({
    query: `{
      solana {
        dexTrades(
          time: { after: \"${startTime}\", till: \"${new Date(Date.parse(startTime) + 60_000).toISOString()}\" },
          exchangeName: { is: \"Raydium\" },
          baseCurrency: { is: \"${mint}\" }
        ) {
          timeInterval { minute }
          baseAmount
          quoteAmount
          quotePrice
        }
      }
    }`
  });
}

async function fetchPricesForMint(mint: string, time: string): Promise<any> {
  const query = buildQuery(mint, time);
  const options = {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-API-KEY': process.env.BITQUERY_API_KEY || '',
    },
  };
  return new Promise((resolve, reject) => {
    const req = https.request(BITQUERY_ENDPOINT, options, res => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        try {
          const json = JSON.parse(data);
          resolve(json);
        } catch (e) {
          reject(e);
        }
      });
    });
    req.on('error', reject);
    req.write(query);
    req.end();
  });
}

async function main() {
  const entries = loadJSON(INPUT_FILE);
  const out: any[] = [];
  for (const entry of entries) {
    const mint = entry?.argument?.base_mint_param;
    const time = entry?.block?.time;
    if (!mint || !time) continue;
    try {
      const result = await fetchPricesForMint(mint, time);
      out.push({ mint, time, result });
      console.log(`✅ ${mint} @ ${time}`);
    } catch (e) {
      console.warn(`⚠️ Misslyckades för ${mint}:`, e);
    }
  }
  fs.writeFileSync(OUTPUT_FILE, JSON.stringify(out, null, 2));
  console.log(`💾 Sparade till ${OUTPUT_FILE}`);
}

main();
