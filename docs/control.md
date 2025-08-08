# 📘 Koppsnipern – Operativt Styrdokument
**Version:** 1.4 (uppdaterad för nya loggregler och utvecklingsläge, 2025-08-08)  
**Source of Truth:** Detta dokument är den enda källan för alla operativa regler, filter, roadmap och formateringskrav.  

---

## 1. Syfte & Strategi
Koppsnipern är en sniper-bot för Solana LaunchLab-pooler, designad för att agera strax efter Cupsyy och maximera lönsamhet med minimal risk.  

**Målsättning:**
- 90–95 % precision
- End-to-end latens < 350 ms
- Stabil daglig nettovinst
- Max risk: 50 SOL per dag

**Kärnstrategi:**
- Regelbaserad filtrering + Cupsyy-trigger
- Prioritera säkerhet (rug checks) före hastighet
- Skala först efter validerad precision

---

## 2. Operativt huvudflöde
1. Upptäck ny pool via Geyser/WebSocket  
2. Bekräfta LaunchLab-initiering (Raydium `Initialize`) inom 2 sekunder  
3. Kör hårda filter och rug checks  
4. Förbered signerad swap  
5. Vänta på Cupsyy-signal (10–45 sek från poolskapande)  
6. Skicka transaktion som Jito-bundle  
7. Exit enligt definierade exitregler  

---

## 3. Filter, triggers & scoring

### 3.1 Hårda filter (måste uppfyllas)
- **WSOL-LP:** ≥ 20 SOL
- **Creator fee:** ≤ 5 %
- **Mint authority:** none
- **Freeze authority:** none
- **Dev-trigger:** ≥ 1 SOL köpt inom 10 sek
- **Slippage-estimat:** ≤ 3 %
- **RTT:** ≤ 150 ms
- **Maxpositioner:** 2 trades per wallet

*(Utvecklingsläge: Temporärt bredare källor – LaunchLab, Raydium, Orca, Meteora, Aldrin – och vissa filter kan vara avstängda för att få fler träffar.)*

### 3.2 Scoring-algoritm
Viktning:
- LP: 40 %
- Dev-trigger: 30 %
- Rug-score: 20 %
- ROI-estimat: 10 %

Formel (LP_norm är LP normaliserat till 0–1, min=20, max=150):

    score = (LP_norm * 0.4) + (dev_trigger * 0.3) + (rug_score/100 * 0.2) + (ROI_est * 0.1)

---

## 4. Risk- & exitregler

### 4.1 Riskkontroll
Pausa botten vid:
- Precision (senaste 50 trades) < 85 %
- Dags-P&L < –2 % av wallet
- RTT > 150 ms i 3 trades i följd
- Max riskcap: 50 SOL/dag

### 4.2 Exitregler
- **Stop Loss:** –4 % eller 45 sek timeout (om TP ej aktiverad)
- **Trailing Take Profit:**
  - Aktiveras vid +12 % ROI
  - Lås vinst vid +6 %
  - SL följer toppen med –3 %

---

## 5. Roadmap & Status

### 5.1 Status (2025-08-08)
- SafetyService: påbörjad, ej komplett
- TradePlanner: påbörjad, ej komplett
- BundleSender: klar i stub, ej integrerad i pipeline
- Metrics/monitoring: saknas

### 5.2 Prioriterad roadmap
1. Implementera SafetyService (rug checks, metadata, blacklist)
2. Implementera TradePlanner (Cupsyy-trigger, latency, pre-swap)
3. Integrera BundleSender i orchestratorn
4. CI med integrationstester på Devnet
5. Health-check + metrics
6. Backtest mot historiska Cupsyy-pooler

---

## 6. Tekniska krav & latencybudget
- All prestandakritisk kod ska köras i Node-process
- Modulär kodstruktur: StreamListener, SafetyService, TradePlanner, TradeService, RiskManager, BundleSender

**Latencybudget:**
- Geyser → bot: < 150 ms
- Signering + sändning: < 50 ms
- Jito-bundle exekvering: < 100 ms

---

## 7. Felhantering & fallback
- Om modul kraschar (ex. SafetyService) → logga till Discord och avbryt botten
- Fallback: försök ansluta mot sekundär RPC/JITO-endpoint innan avbrott
- Om båda endpoints misslyckas → avbryt omedelbart

---

## 8. Loggstruktur
Alla loggar till Discord ska vara **klartext** (lättlästa statusmeddelanden).  
JSON-format används endast för lokal loggfil, enligt följande struktur:

    {
        "timestamp": "ISO8601",
        "pool_address": "string",
        "rug_score": "number",
        "latency": "ms",
        "outcome": "SUCCESS|FAIL|SKIPPED",
        "slot_lag": "number",
        "fee_ratio": "number",
        "roi": "percentage"
    }

---

## 9. Formatterings- & outputregler
1. **En kodruta per fil** – hela filinnehållet omsluten av en enda triple-backtick-ruta från början till slut.
2. **Inga inre backticks** – använd indragna textblock (4 mellanslag) för JSON, exempeldata, diagram, ASCII-flöden.
3. **Språkmarkering** ska anges (`markdown`, `ts`, `json` etc.).
4. **Diagram och ASCII**: alltid indragna textblock.
5. **JSON-exempel**: indrag med 4 mellanslag.
6. Kodrutan får inte brytas eller delas upp.
7. Vid export till fil: inga specialtaggar eller metadata som kan orsaka formatfel.

---

## 10. Självtest vid uppstart
- Vid varje start ska botten utföra en simulerad trade mot Devnet eller intern mock-pool.
- Resultatet loggas till Discord (klartext) och sparas som JSON i loggfil:

    {
        "timestamp": "ISO8601",
        "selftest": "PASS|FAIL",
        "latency": "ms",
        "remarks": "string"
    }
- Om självtest misslyckas → starta inte trading och logga `"SELFTEST_FAIL"`.

---

## 11. Konflikthantering mellan regler
- Vid konflikt mellan två regler i detta dokument gäller alltid högsta säkerhetsnivå.
- Om osäkerhet kvarstår → ingen trade utförs och händelsen loggas.

---

## 12. Kodändringsflöde
Vid arbete med kod i Canvas ska ChatGPT endast uppdatera filer när användaren uttryckligen ber om det eller godkänner nästa steg.  
Flöde:
1. Presentera uppdaterad fil eller kodförslag.  
2. Vänta på användarens feedback och godkännande.  
3. Föreslå nästa steg.  
4. Vid godkännande leverera ny kod.  

Syfte: undvika onödiga filskrivningar, spara tokens och hålla chatten responsiv.
