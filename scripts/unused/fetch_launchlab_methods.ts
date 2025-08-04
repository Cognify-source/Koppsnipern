// scripts/utils/fetch_launchlab_methods.ts
import fs from 'fs';
import https from 'https';
import dotenv from 'dotenv';
dotenv.config();

const BITQUERY_ENDPOINT = 'https://graphql.bitquery.io';
const LAUNCHLAB_PROGRAM = 'LanMV9sAd7wArD4vJFi2qDdfnVhFxYSUg6eADduJ3uj';
const OUTPUT_FILE = 'launchlab_methods.json';

const query = JSON.stringify({
  query: `{
    solana(network: solana) {
      instructions(
        limit: 1000,
        where: {
          Instruction: { Program: { Address: { is: "${LAUNCHLAB_PROGRAM}" } } }
        }
      ) {
        Instruction {
          Method
        }
      }
    }
  }`
});

function countBy(arr: any[], key: string): Record<string, number> {
  return arr.reduce((acc, item) => {
    const val = item?.Instruction?.Method || 'UNKNOWN';
    acc[val] = (acc[val] || 0) + 1;
    return acc;
  }, {} as Record<string, number>);
}

async function fetchMethods() {
  const token = process.env.BITQUERY_ACCESS_TOKEN || '';
  if (!token) {
    console.error('❌ Ingen BITQUERY_ACCESS_TOKEN satt i .env');
    process.exit(1);
  }

  const options = {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${token}`
    },
  };

  const req = https.request(BITQUERY_ENDPOINT, options, res => {
    let data = '';
    res.on('data', chunk => data += chunk);
    res.on('end', () => {
      if (res.statusCode !== 200) {
        console.error(`❌ Bitquery API fel (${res.statusCode}):\n${data}`);
        return;
      }
      try {
        const json = JSON.parse(data);
        const raw = json?.data?.solana?.instructions || [];
        const counts = countBy(raw, 'Method');
        fs.writeFileSync(OUTPUT_FILE, JSON.stringify(counts, null, 2));
        console.log(`✅ Metodlista sparad till ${OUTPUT_FILE}`);
      } catch (e) {
        console.error('❌ JSON parse error:', e);
      }
    });
  });

  req.on('error', console.error);
  req.write(query);
  req.end();
}

fetchMethods();
