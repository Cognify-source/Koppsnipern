// scripts/utils/filter_cupsyy_pools.ts
import fs from 'fs';

const CUPSYY_WALLET = 'suqh5s...'; // Fyll i fullständiga adressen
const INPUT_FILE = 'launchlab_pools.json';
const OUTPUT_FILE = 'cupsyy_pools.json';

function loadJSON(path: string): any {
  return JSON.parse(fs.readFileSync(path, 'utf-8'));
}

function extractCupsyyPools(data: any): any[] {
  const all = data?.data?.solana?.instructions || [];
  return all.filter((entry: any) => {
    return entry?.transaction?.signer === CUPSYY_WALLET;
  });
}

function main() {
  const raw = loadJSON(INPUT_FILE);
  const filtered = extractCupsyyPools(raw);
  fs.writeFileSync(OUTPUT_FILE, JSON.stringify(filtered, null, 2));
  console.log(`✅ ${filtered.length} Cupsyy-relaterade pooler sparade till ${OUTPUT_FILE}`);
}

main();
