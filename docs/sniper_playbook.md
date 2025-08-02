# Sniper-Playbook v2.0 (Uppdaterad 2025-08-02)

## A · Storlek ↔ WSOL-LP

| WSOL-likviditet | Trade-size (SOL) | Slippage | Priority-fee (µlamports) |
|-----------------|------------------|----------|--------------------------|
| 20 – 40 SOL     | 2                | ≤ 4%     | 12 000                   |
| 40 – 60 SOL     | 3                | ≤ 4%     | 15 000                   |
| 60 – 100 SOL    | 5                | 2–3%     | 20 000                   |
| 100 – 150 SOL   | 8                | ≤ 3%     | 20 000                   |
| > 150 SOL       | 10 (max)         | ≤ 4%     | 25 000                   |

*Storlek, slippage och fee enligt trappa ovan.*

---

## B · Priority-fee autotuning

- Startvärde enligt tabell ovan.
- Autotune: +2 000 µlamports om `slot_lag > 1` tre trades i rad.
- Minska –1 000 µlamports om `slot_lag_p90 == 0` och fee > 3% av nettovinsten.
- Fee: min/max 8 000 / 35 000.

---

## C · Filtrering och triggers (Cupsyy-triggered entry, optimerad för minimal lagg)

1. **Direkt efter pool-creation:**
   - All analys och filtrering görs så fort poolen dykt upp:
     - Minst 5 SOL i likviditet  
     - Slippage < 8% (för filter/urval, **ej exekvering**)  
     - Inga rug-signaler  
     - Godkänd metadata och verifiering  
     - Creator fee får inte överstiga 5%  
     - Rug-score måste vara **≥ 70**  
     - Blockera wash-trading/spoofing  
     - Flagga deployer utan historik  
   - Om poolen klarar alla filter:
     - **Förbered köptransaktion** (signera/förbered payload, ställ i kö etc) **i förväg**

2. **Exekvering – “Cupsyy-trigger”:**
   - Snipern lyssnar i realtid efter köp från Cupsyy (`suqh5sHtr8HyJ7q8scBimULPkPpA557prMG47xCHQfK`)
   - **Så fort Cupsyy har köpt:**  
     - **skicka köpet omedelbart** (utan ytterligare väntan/analys)
   - Målet är att **hinna före alla copytraders** – därför ska **all logik/kod vara optimerad för minimal lagg**

---

## D · Exit- & Riskregler

- **Stop-loss:** −4% eller 45 sekunder
- **Take-profit:** Lås +6% när priset är ≥ +12%
- **Partial sells:** 1–2 transaktioner för att undvika prispåverkan
- **Ingen DCA**
- **Daglig risk-cap:** 50 SOL
- **Max två öppna positioner**

---

## E · Metadata & verifiering

- Köp ej tokens utan giltig metadata, ikon och verifiering.

---

## F · Observationsmönster från Cupsyy (för referens)

- Cupsyy köper ofta exakt 0.5 SOL
- Går in inom 3 sekunder från LP-add
- Undviker tokens utan metadata/ikon/verifiering

---

*Denna playbook gäller för all kod och logik relaterad till snipern och ska följas strikt.*
