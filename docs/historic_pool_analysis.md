# 📊 Historic Pool Analysis – Koppsnipern

Denna fil dokumenterar analyskedjan för att identifiera Cupsyys LaunchLab-pooler och backtesta snipertaktik enligt `sniper_playbook.md`.

---

## 🔁 Analyskedja (wallet-baserad)

1. **Transaktionsskanning:**
   - Script: `trace_cupsyy_history.ts`
   - Hämtar Cupsyys historik via Chainstack (RPC)
   - Filtrerar på LaunchLab-program-ID
   - Tidsintervall: 2025-07-24 till 2025-08-04
   - Undviker dubbletter (via mint-set)
   - Asynkron skrivning till `cupsyy_pools.json` var 100:e ny pool

2. **Prisfönsteranalys:**
   - Script: `fetch_price_window.ts`
   - För varje pool (mint): hämtar blockdata i 120 sekunder efter mint-slot
   - Extraherar transaktioner där Cupsyy deltar eller mint-token förekommer
   - Per-slot analys: blockTime, tx-antal, cupsyy-träffar, tidsåtgång
   - Output: JSON-fil per pool i `data/pool_chunks/`

3. **Strategibacktest (kommande):**
   - Script: `backtest_strategy.ts`
   - Utvärderar ROI, delay-sensitivitet och sniper-filter
   - Input: `data/pool_chunks/`
   - Output: `backtest_results.json` + filterbaserad analys

---

## 📦 Outputfiler

| Fil                          | Innehåll                                       |
|------------------------------|------------------------------------------------|
| `cupsyy_pools.json`          | Upptäckta LaunchLab-pooler från Cupsyy         |
| `cupsyy_pool_prices.json`    | Per-pool observationsdata                      |
| `backtest_results.json`      | Precision, ROI och filteranalys (planerad)     |

---

## 🧰 Metodik & Verktyg

- Script körs via: `npx ts-node scripts/utils/<filnamn>.ts`
- RPC: Chainstack archive node via `.env`-nyckel
- JSON-baserad output per pool
- Minnesoptimerad: GC + filskrivning per pool
- Tydlig loggning av block, tx, träffar, och tidsåtgång
- Observation = transaktion med mint-token (ev. med Cupsyy)

---

## 🔜 Nästa steg

1. 🧪 Implementera `backtest_strategy.ts` för att analysera observationsfilerna
2. 📈 Visualisera och summera precision och ROI per filter enligt `sniper_playbook.md`
3. 🚫 Identifiera återkommande mönster för false positives/negatives
