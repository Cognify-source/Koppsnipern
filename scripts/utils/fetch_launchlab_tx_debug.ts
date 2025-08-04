// scripts/utils/fetch_launchlab_tx_debug.ts
import fs from 'fs';
import https from 'https';
import dotenv from 'dotenv';
dotenv.config();

const BITQUERY_ENDPOINT = 'https://graphql.bitquery.io';
const OUTPUT_FILE = 'launchlab_tx_debug.json';
const TX_HASH = '3Nhj22zJNR2s83W6dD5HySg9jUqqEB2LFezzjLGbsWKassRyphinzHoCmCLz2J2AUHbVRBs3rmkW7Zd8exZDGpJt';

const query = JSON.stringify({
  query: `{
    solana(network: solana) {
      instructions(
        where: {
          Transaction: { Signature: { is: "${TX_HASH}" } }
        }
      ) {
        Block { Time }
        Transaction { Signer Signature }
        Instruction {
          Program { Name Address }
          Accounts { Name Address Index }
          Arguments {
            Name
            Value {
              ... on Solana_ABI_String_Value_Arg { string }
              ... on Solana_ABI_U64_Value_Arg { u64 }
              ... on Solana_ABI_PublicKey_Value_Arg { publicKey }
            }
          }
        }
      }
    }
  }`
});

async function fetchTransactionInstructions() {
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
        fs.writeFileSync(OUTPUT_FILE, JSON.stringify(raw, null, 2));
        console.log(`✅ Sparade instruktioner till ${OUTPUT_FILE}`);
      } catch (e) {
        console.error('❌ JSON parse error:', e);
      }
    });
  });

  req.on('error', console.error);
  req.write(query);
  req.end();
}

fetchTransactionInstructions();
