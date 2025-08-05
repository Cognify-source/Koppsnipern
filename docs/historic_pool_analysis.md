# 📊 Historic Pool Analysis – Koppsnipern

Denna fil dokumenterar analyskedjan för att identifiera Cupsyys LaunchLab-pooler och backtesta snipertaktik enligt `sniper_playbook.md`.

---

## 🔁 Analyskedja (wallet-baserad)

1. **Transaktionsskanning:**
   - Script: `trace_cupsyy_history.ts`
   - Hämtar Cupsyys historik via Chainstack (RPC)
   - Filtrerar på LaunchLab-program-ID
   - Begränsat till 2025-07-24 till 2025-08-04
   - Undviker dubbletter (via mint-set)
   - Sparar asynkront till `cupsyy_pools.json` var 100:e ny pool

2. **Prisfönsteranalys:**
   - Script: `fetch_price_window.ts`
   - Hämtar alla transaktioner per pool i 120 sekunder efter mint-slot
   - Identifierar relevanta transaktioner och prisrörelser
   - Output: `price_window.md`

3. **Strategibacktest:**
   - Script: `backtest_strategy.ts`
   - Utvärderar ROI enligt sniper_playbookens filter
   - Input: `price_window.md`
   - Output: `backtest_results.json`

---

## 📦 Outputfiler

| Fil                     | Innehåll                                 |
|-------------------------|------------------------------------------|
| `cupsyy_pools.json`     | Upptäckta LaunchLab-pooler från Cupsyy   |
| `price_window.md`       | Transaktions- och prisdata per pool      |
| `backtest_results.json` | Precision, ROI och träffanalys           |

---

## 🧰 Metodik & Verktyg

- Körs via `npx ts-node scripts/utils/<filnamn>.ts`
- RPC: Chainstack archive node
- JSON-/markdown-baserad utdata
- Resumable & minnesoptimerat (GC + batchad skrivning)
- En pool definieras som en unik mint kopplad till en LaunchLab-trade från Cupsyy

---

## 🔜 Nästa steg

- Slutföra och verifiera backtest-script
- Automatisera precision/ROI-rapportering per filter
- Identifiera mönster för false positives/negatives
