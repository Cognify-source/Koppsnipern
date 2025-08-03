// scripts/utils/fetch_launchlab_from_dexscreener.ts
import fs from 'fs';
import https from 'https';

const DEXSCREENER_ENDPOINT = 'https://api.dexscreener.com/latest/dex/pairs/solana';
const OUTPUT_FILE = 'launchlab_pools.json';
const DAYS_BACK = 30;

function fetchDexPairs(): Promise<any> {
  return new Promise((resolve, reject) => {
    https.get(DEXSCREENER_ENDPOINT, res => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        try {
          const json = JSON.parse(data);
          resolve(json?.pairs || []);
        } catch (e) {
          reject(e);
        }
      });
    }).on('error', reject);
  });
}

function isRecent(timestampMs: number): boolean {
  const daysAgo = Date.now() - DAYS_BACK * 86400 * 1000;
  return timestampMs >= daysAgo;
}

async function main() {
  try {
    const allPairs = await fetchDexPairs();
    const recent = allPairs.filter((p: any) => {
      return p.pairCreatedAt && isRecent(Number(p.pairCreatedAt));
    });

    const output = recent.map((p: any) => ({
      createdAt: new Date(Number(p.pairCreatedAt)).toISOString(),
      pairAddress: p.pairAddress,
      baseToken: p.baseToken,
      quoteToken: p.quoteToken,
      url: p.url,
      priceUsd: p.priceUsd,
      txns: p.txns,
      liquidity: p.liquidity,
      volume: p.volume
    }));

    fs.writeFileSync(OUTPUT_FILE, JSON.stringify(output, null, 2));
    console.log(`✅ Sparade ${output.length} launchlab-liknande pooler till ${OUTPUT_FILE}`);
  } catch (e) {
    console.error('❌ Misslyckades att hämta pooler:', e);
  }
}

main();
