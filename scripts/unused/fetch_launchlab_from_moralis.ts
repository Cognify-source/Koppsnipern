// scripts/utils/fetch_launchlab_from_moralis.ts
import fs from 'fs';
import https from 'https';
import dotenv from 'dotenv';
dotenv.config();

const OUTPUT_FILE = 'launchlab_pools.json';
const MORALIS_API_KEY = process.env.MORALIS_API_KEY || '';
const BASE_URL = 'https://solana-gateway.moralis.io';
const DAYS_BACK = 30;

if (!MORALIS_API_KEY) {
  console.error('❌ MORALIS_API_KEY saknas i .env');
  process.exit(1);
}

function isRecent(timestamp: number): boolean {
  const since = Date.now() - DAYS_BACK * 86400 * 1000;
  return timestamp >= since;
}

async function fetchPairs(): Promise<any[]> {
  return new Promise((resolve, reject) => {
    const options = {
      method: 'GET',
      headers: {
        'X-API-Key': MORALIS_API_KEY
      }
    };

    https.get(`${BASE_URL}/v0/liquidity/pools?network=mainnet`, options, res => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        try {
          const json = JSON.parse(data);
          const recent = json.result?.filter((p: any) => isRecent(Date.parse(p.createdAt))) || [];
          resolve(recent);
        } catch (err) {
          reject(err);
        }
      });
    }).on('error', reject);
  });
}

async function main() {
  try {
    const pairs = await fetchPairs();
    const output = pairs.map(p => ({
      createdAt: p.createdAt,
      address: p.address,
      dex: p.dex,
      baseToken: p.baseToken,
      quoteToken: p.quoteToken,
      liquidity: p.liquidity,
      volume24h: p.volume24h
    }));
    fs.writeFileSync(OUTPUT_FILE, JSON.stringify(output, null, 2));
    console.log(`✅ Sparade ${output.length} pooler till ${OUTPUT_FILE}`);
  } catch (e) {
    console.error('❌ Kunde inte hämta från Moralis:', e);
  }
}

main();
