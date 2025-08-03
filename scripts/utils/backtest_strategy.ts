// scripts/utils/backtest_strategy.ts
import fs from 'fs';

const INPUT_FILE = 'price_movements.json';
const OUTPUT_FILE = 'backtest_results.json';

interface PricePoint {
  quotePrice: number;
  baseAmount: number;
  quoteAmount: number;
  timeInterval: { minute: string };
}

function simulate(prices: PricePoint[]): { entry: number, exit: number, pnl: number } | null {
  if (prices.length === 0) return null;

  const entry = prices[0].quotePrice;
  const peak = Math.max(...prices.map(p => p.quotePrice));
  const trailingTrigger = entry * 1.12;
  const trailingStop = peak >= trailingTrigger ? peak * 0.97 : entry * 0.96;

  const exit = prices.find(p => p.quotePrice <= trailingStop)?.quotePrice
    || prices[prices.length - 1].quotePrice;

  const pnl = ((exit - entry) / entry) * 100;
  return { entry, exit, pnl };
}

function main() {
  const raw = JSON.parse(fs.readFileSync(INPUT_FILE, 'utf-8'));
  const results = raw.map((entry: any) => {
    const prices = entry?.result?.data?.solana?.dexTrades || [];
    const sim = simulate(prices);
    return {
      mint: entry.mint,
      time: entry.time,
      ...sim,
    };
  });
  fs.writeFileSync(OUTPUT_FILE, JSON.stringify(results, null, 2));
  console.log(`📊 Backtest-resultat sparade till ${OUTPUT_FILE}`);
}

main();
