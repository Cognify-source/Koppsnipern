# Koppsnipern – Backtest Pipeline Sammanfattning

Denna fil sammanfattar processen för att hämta, filtrera och backtesta LaunchLab-pooler som Cupsyy deltagit i – i syfte att testa snipingstrategin enligt sniper_playbook.md.

---

## 🔁 Översikt: Processflöde

1. **Hämta alla LaunchLab-pooler (senaste 30 dagar)**  
   → `fetch_launchlab_pools.ts` (via Bitquery, metod: PoolCreateEvent)  
   ⚠️ För närvarande returneras 0 träffar. Bitquery verkar inte indexera dessa korrekt.

2. **Alternativa datakällor testade**
   - DEX Screener → saknar historiskt sökbar endpoint
   - Moralis API → visar inga LaunchLab-pooler
   - Bitquery per transaktion → returnerar tomt resultat, även på äldre tx

3. **Verifikation via Solana RPC**
   - Script `inspect_mint_origin.ts` skapades
   - Bekräftade att transaktioner *använder LaunchLab-programmet* (LanMV9...)
   - Men Bitquery returnerar ändå `[]` för dessa transaktioner

4. **Klassificering av pooltyp**
   → Viktigt eftersom Cupsyy tradar både:
     - LaunchLab
     - Bonk Launchpad
     - Raydium CPMM  
   → Framtida strategi bör inkludera `identify_pool_source.ts`

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

* `.env` måste innehålla giltig `BITQUERY_ACCESS_TOKEN`
* Kör kommandon från projektroten
* Använd `npx ts-node` om `ts-node` ej är globalt installerad

---

## 📌 Nästa steg

1. Skriv `identify_pool_source.ts`  
   → Givet en transaktion, avgör: LaunchLab, Bonk, CPMM

2. Välj annan metod än Bitquery för att få ut historiska pooler  
   → Ev. genom att indexera token-mint och program-ID via RPC

3. När data finns:
   - Filtrera Cupsyy via signer
   - Dra prisrörelse första minuten
   - Kör `backtest_strategy.ts`

---

