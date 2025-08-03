// scripts/utils/fetch_launchlab_pools.ts
import fs from 'fs';
import https from 'https';
import dotenv from 'dotenv';
dotenv.config();

const LAUNCHLAB_PROGRAM = "LanMV9sAd7wArD4vJFi2qDdfnVhFxYSUg6eADduJ3uj"; 
const DAYS_BACK = 30;

const START_DATE = new Date(Date.now() - DAYS_BACK * 86400 * 1000).toISOString();
const BITQUERY_ENDPOINT = 'https://graphql.bitquery.io';

async function fetchLaunchlabPools() {
  const token = process.env.BITQUERY_ACCESS_TOKEN || '';
  if (!token) {
    console.error('❌ Ingen BITQUERY_ACCESS_TOKEN satt i .env');
    process.exit(1);
  }

  const query = JSON.stringify({
    query: `{
      solana {
        instructions(
          where: {
            instruction: {
              program: { address: { is: \"${LAUNCHLAB_PROGRAM}\" }, method: { is: \"PoolCreateEvent\" } },
              block: { time: { greaterThan: \"${START_DATE}\" } }
            }
          }
        ) {
          block { time }
          transaction { signer signature }
          argument { base_mint_param curve_param vesting_param }
        }
      }
    }`
  });

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
        fs.writeFileSync('launchlab_pools.json', JSON.stringify(json, null, 2));
        console.log(`✅ Pooldata sparad till launchlab_pools.json`);
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
