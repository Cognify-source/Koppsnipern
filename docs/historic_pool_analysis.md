# 📊 Historic Pool Analysis – Koppsnipern

Denna fil dokumenterar nuvarande analyskedja för att identifiera och analysera Cupsyys LaunchLab-trades via wallethistorik, samt backtesta strategin enligt sniper_playbook.md.

---

## 🔁 Ny analyskedja (wallet-baserad)

1. **Scanna Cupsyys transaktionshistorik**
   - Script: `trace_cupsyy_history.ts`
   - Hämtar *alla* transaktioner bakåt i tiden från Cupsyys wallet (via Chainstack archive node)
   - Batchar och filtrerar direkt på program-ID
   - Output: `cupsyy_pools.json` (endast relevanta trades)

2. **Prisanalys** *(kommande steg)*
   - Script: `fetch_price_window.ts`
   - Hämtar prisrörelse första 60 sekunder efter varje trade
   - Input: `cupsyy_pools.json`
   - Output: `price_window.json`

3. **Strategiutvärdering**
   - Script: `backtest_strategy.ts`
   - Input: `price_window.json`
   - Output: `backtest_results.json`

---

## 📦 Outputfiler

| Fil                     | Innehåll                                 |
| ----------------------- | ---------------------------------------- |
| `cupsyy_pools.json`    | Filtrerade trades (LaunchLab/Bonk/CPMM)  |
| `price_window.json`  | Prisutveckling per trade (kommande)      |
| `backtest_results.json` | Resultat av strategi-backtest (kommande) |

---

## 🧰 Verktyg och Metodik

- Kör script via `npx ts-node scripts/utils/<filnamn>.ts`
- Data hämtas direkt från Chainstack archive node (Solana RPC)
- Batchad filtrering av program-ID sker innan djupanalys för att minska datamängd och öka fart
- **Endast relevanta signatures sparas** för vidare analys

---

## 🔜 Nästa steg

- Vidareutveckla scriptet för batchad program-filtrering och effektiv trade-extraktion
- Implementera och köra prisanalys och backtest på filtrerade trades
