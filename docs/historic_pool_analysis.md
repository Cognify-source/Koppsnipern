# 📊 Historic Pool Analysis – Koppsnipern

Denna fil dokumenterar analyskedjan för att identifiera LaunchLab-, Bonk- och Raydium CPMM-trades från Cupsyys wallethistorik, för att sedan analysera prisrörelse och backtesta strategin enligt sniper\_playbook.md.

---

## 🔁 Översikt: Ny process (wallet-baserad)

1. **Scanna Cupsyys transaktionshistorik**

   * Nytt script: `trace_cupsyy_history.ts`
   * Hämtar transaktioner bakåt i tiden från Cupsyys wallet via `getSignaturesForAddress`
   * Output: `cupsyy_history.json`

2. **Filtrera relevanta program**

   * Inspektera varje transaktion:

     * LaunchLab (`LanMV9sAd7wArD4vJFi2qDdfnVhFxYSUg6eADduJ3uj`)
     * Bonk Launchpad
     * Raydium CPMM
   * Märk varje post med `poolType`
   * Output: `cupsyy_trades.json`

3. **Prisanalys** *(kommande)*

   * `extract_price_movements.ts`
   * Analyserar prisrörelse första 60 sekunder efter varje trade
   * Input: `cupsyy_trades.json`
   * Output: `price_movements.json`

4. **Strategiutvärdering** *(kommande)*

   * Körs via `backtest_strategy.ts`
   * Input: `price_movements.json`
   * Output: `backtest_results.json`

---

## 📦 Outputfiler

| Fil                     | Innehåll                                 |
| ----------------------- | ---------------------------------------- |
| `cupsyy_history.json`   | Råa transaktioner signerade av Cupsyy    |
| `cupsyy_trades.json`    | Filtrerade trades (LaunchLab/Bonk/CPMM)  |
| `price_movements.json`  | Prisutveckling per trade (kommande)      |
| `backtest_results.json` | Resultat av strategi-backtest (kommande) |

---

## 🧰 Verktyg

* Alla script körs via `npx ts-node scripts/utils/<filnamn>.ts`
* Data hämtas direkt via Solana RPC (Chainstack)
* Bitquery och Moralis används inte

---

## 🔜 Nästa steg

* Skapa `trace_cupsyy_history.ts`
* Därefter `extract_price_movements.ts` och `backtest_strategy.ts`
