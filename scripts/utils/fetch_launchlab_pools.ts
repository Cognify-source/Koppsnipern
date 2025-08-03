// scripts/utils/fetch_launchlab_pools.ts
import fs from 'fs';
import https from 'https';
import dotenv from 'dotenv';
dotenv.config();

const BITQUERY_ENDPOINT = 'https://graphql.bitquery.io';
const LAUNCHLAB_PROGRAM = "LanMV9sAd7wArD4vJFi2qDdfnVhFxYSUg6eADduJ3uj";
const OUTPUT_FILE = 'launchlab_pools.json';

const query = JSON.stringify({
  query: `{
    solana(network: solana) {
      instructions(
        limit: 1000
        where: {
          Transaction: { Result: { Success: true } },
          Instruction: {
            Program: { Address: { is: "${LAUNCHLAB_PROGRAM}" }, Method: { is: "PoolCreateEvent" } }
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
      'Authorization': `Bearer ${token}`,
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
        const compact = raw.map((entry: any) => {
          const time = entry?.Block?.Time;
          const signer = entry?.Transaction?.Signer;
          const poolAddress = entry?.Instruction?.Accounts?.[4]?.Address;
          const mintArg = entry?.Instruction?.Arguments?.find((a: any) => a?.Name === 'base_mint_param');
          const mint = mintArg?.Value?.string;
          return { time, signer, poolAddress, mint };
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
