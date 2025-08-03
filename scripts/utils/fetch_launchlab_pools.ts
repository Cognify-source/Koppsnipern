// scripts/utils/fetch_launchlab_pools.ts
import fs from 'fs';
import https from 'https';
import dotenv from 'dotenv';
dotenv.config();

const BITQUERY_ENDPOINT = 'https://graphql.bitquery.io';
const LAUNCHLAB_PROGRAM = 'LanMV9sAd7wArD4vJFi2qDdfnVhFxYSUg6eADduJ3uj';
const DAYS_BACK = 30;
const OUTPUT_FILE = 'launchlab_pools.json';

const since = new Date(Date.now() - DAYS_BACK * 86400 * 1000).toISOString();

const query = JSON.stringify({
  query: `{
    solana(network: solana) {
      instructions(
        limit: 3000,
        where: {
          Transaction: { Result: { Success: true }, Block: { Time: { greaterThan: "${since}" } } },
          Instruction: {
            Program: { Address: { is: "${LAUNCHLAB_PROGRAM}" } },
            Method: { is: "PoolCreateEvent" }
          }
        }
      ) {
        Block { Time }
        Transaction { Signer Signature }
        Instruction {
          Accounts { Address }
          Arguments {
            Name
            Value {
              ... on Solana_ABI_String_Value_Arg { string }
            }
          }
        }
      }
    }
  }`
});

async function fetchLaunchlabPools() {
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
        const compact = raw.map((e: any) => {
          const time = e.Block?.Time;
          const signer = e.Transaction?.Signer;
          const poolAddress = e.Instruction?.Accounts?.[4]?.Address;
          const mintArg = e.Instruction?.Arguments?.find((a: any) => a.Name === 'base_mint_param');
          const mint = mintArg?.Value?.string;
          return { time, signer, mint, poolAddress };
        });
        fs.writeFileSync(OUTPUT_FILE, JSON.stringify(compact, null, 2));
        console.log(`✅ ${compact.length} pooler sparade till ${OUTPUT_FILE}`);
      } catch (e) {
        console.error('❌ JSON parse error:', e);
      }
    });
  });

  req.on('error', console.error);
  req.write(query);
  req.end();
}

fetchLaunchlabPools();
