# 📊 Historic Pool Analysis – Koppsnipern

Denna fil dokumenterar analyskedjan för att identifiera LaunchLab-pooler där Cupsyy handlat, och förbereda dessa för prisanalys och backtesting enligt sniper_playbook.md.

---

## 🔁 Översikt: Processflöde

1. **Scanna poolskapelser (RPC)**
   - `scan_launchlab_rpc.ts`
   - Går igenom slots, letar efter transaktioner som anropar LaunchLab-programmet (`LanMV9...`)
   - Output: `{ slot, signature }[]` → `launchlab_pools_*.json`

2. **Filtrera transaktioner signerade av Cupsyy**
   - `filter_cupsyy_participation.ts`
   - Går igenom transaktionerna i `launchlab_pools`
   - Output: `cupsyy_pools.json`

3. **Identifiera faktiska swaps av Cupsyy**
   - `scan_cupsyy_swaps.ts`
   - Skannar 120 slots efter varje match
   - Loggar transaktioner där Cupsyy faktiskt swappat
   - Output: `cupsyy_swaps.json`

4. **Prisanalys (kommande)**
   - `extract_price_movements.ts`
   - Analyserar prisrörelse första 60 sekunder efter varje Cupsyy-swap
   - Input: `cupsyy_swaps.json`
   - Output: `price_movements.json`

---

## 📦 Outputfiler

| Fil                     | Innehåll                                     |
|-------------------------|----------------------------------------------|
| `launchlab_pools_*.json`| Poolskapelser via LaunchLab-programmet       |
| `cupsyy_pools.json`     | Transaktioner signerade av Cupsyy            |
| `cupsyy_swaps.json`     | Transaktioner där Cupsyy faktiskt handlat    |
| `price_movements.json`  | Prisutveckling per pool (under utveckling)   |
| `backtest_results.json` | Resultat av strategi-backtest (kommande)     |

---

## 🧰 Verktyg

- Alla script körs via `npx ts-node scripts/utils/<filnamn>.ts`
- RPC används för all datahämtning via Chainstack
- Inget behov av Bitquery eller Moralis längre

---

## 🧭 Nästa steg

- Samla in mer data: scanna fler slots (upp till 30 dagar)
- När tillräcklig mängd Cupsyy-swaps hittats:
  - Kör `extract_price_movements.ts` (att skapa)
  - Påbörja strategiutvärdering

---

## 🔄 Notering

Vi har övergett Bitquery och Moralis p.g.a. bristande stöd för LaunchLab-händelser. All data hämtas nu direkt från Solana via RPC.
