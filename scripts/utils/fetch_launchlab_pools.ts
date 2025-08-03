// scripts/utils/fetch_launchlab_pools.ts
import fs from 'fs';
import https from 'https';

const LAUNCHLAB_PROGRAM = "LanMV9sAd7wArD4vJFi2qDdfnVhFxYSUg6eADduJ3uj"; 
const DAYS_BACK = 30;

const START_DATE = new Date(Date.now() - DAYS_BACK * 86400 * 1000).toISOString();
const BITQUERY_ENDPOINT = 'https://graphql.bitquery.io';

async function fetchLaunchlabPools() {
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
      'X-API-KEY': process.env.BITQUERY_API_KEY || '',
    },
  };

  const req = https.request(BITQUERY_ENDPOINT, options, res => {
    let data = '';
    res.on('data', chunk => data += chunk);
    res.on('end', () => {
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
