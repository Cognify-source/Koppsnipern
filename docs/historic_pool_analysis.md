# Koppsnipern – Backtest Pipeline Sammanfattning

Denna fil sammanfattar processen för att hämta, filtrera och backtesta LaunchLab-pooler som Cupsyy deltagit i – i syfte att testa snipingstrategin enligt sniper\_playbook.md.

## 🔁 Översikt: Processflöde

1. **Hämta alla LaunchLab-pooler (senaste 30 dagar)**
   → `fetch_launchlab_pools.ts`

2. **Filtrera fram pooler Cupsyy köpt från**
   → `filter_cupsyy_pools.ts`

3. **Hämta prisrörelse första minuten för varje pool**
   → `fetch_price_movement.ts`

4. **Simulera vår strategi mot prisrörelsen**
   → `backtest_strategy.ts`

---

## 📁 Filöversikt

| Fil                                      | Syfte                                             |
| ---------------------------------------- | ------------------------------------------------- |
| `scripts/utils/fetch_launchlab_pools.ts` | Hämtar LaunchLab-pooler via Bitquery GraphQL      |
| `scripts/utils/filter_cupsyy_pools.ts`   | Filtrerar på Cupsyys signeraddress                |
| `scripts/utils/fetch_price_movement.ts`  | Hämtar trades för varje mint under första minuten |
| `scripts/utils/backtest_strategy.ts`     | Simulerar strategi (entry, trailing TP/SL, exit)  |

---

## 📦 Outputfiler

| Fil                     | Innehåll                           |
| ----------------------- | ---------------------------------- |
| `launchlab_pools.json`  | Alla LaunchLab-pooler (rådata)     |
| `cupsyy_pools.json`     | Pooler där Cupsyy tradat           |
| `price_movements.json`  | Prisdata för dessa pooler 0–60 sek |
| `backtest_results.json` | Resultat för simulering per pool   |

---

## ⚙️ Förutsättningar

* `.env` måste innehålla giltig `BITQUERY_API_KEY`
* Kör kommandon från projektroten
* Använd `npx ts-node` om `ts-node` ej är globalt installerad

---

## 🧪 Exempel: Stegvis körning

```bash
npx ts-node scripts/utils/fetch_launchlab_pools.ts
npx ts-node scripts/utils/filter_cupsyy_pools.ts
npx ts-node scripts/utils/fetch_price_movement.ts
npx ts-node scripts/utils/backtest_strategy.ts
```

---

## 🔜 Nästa steg (valfritt)

* Skapa `scripts/run_all.sh` för att automatisera
* Visualisera `backtest_results.json` (CLI eller graf)
* Lagra resultat i databas för vidare analys
