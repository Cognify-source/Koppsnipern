# 📘 Koppsnipern – Operativt Styrdokument
**Version:** 1.1 (sammanfogad 2025-08-08)

---

## 1. Syfte & Strategi
Koppsnipern är en sniper-bot för Solana LaunchLab-pooler, designad för att exekvera strax efter Cupsyy och maximera lönsamhet med minimal risk.

**Målsättning:**
- 90–95 % precision
- End-to-end latens < 350 ms
- Stabil daglig nettovinst
- Maximal risk: 50 SOL per dag

**Kärnstrategi:**
- Regelbaserad filtrering + Cupsyy-trigger
- Prioritera säkerhet (rug checks) före hastighet
- Skala först efter validerad precision

---

## 2. Startsekvens vid ny session
1. Läs roadmap och nuvarande status (se avsnitt 6)
2. Identifiera nästa steg i roadmapen
3. Lista alla filer som berör steget och hämta senaste commits
4. Starta arbete omedelbart enligt prioritet
5. Vid fel (GitHub-API, RPC, .env) → avbryt

---

## 3. Operativt huvudflöde
1. Upptäck ny pool via Geyser/WebSocket
2. Bekräfta LaunchLab-initiering (Raydium `Initialize`) inom 2 sekunder
3. Kör hårda filter och rug checks
4. Förbered signerad swap
5. Vänta på Cupsyy-signal (10–45 sek från poolskapande)
6. Skicka transaktion som Jito-bundle
7. Exit enligt definierade exitregler

---

## 4. Filter, triggers & scoring

### 4.1 Hårda filter (måste uppfyllas)
- **WSOL-LP:** ≥ 20 SOL
- **Creator fee:** ≤ 5 %
- **Mint authority:** none
- **Freeze authority:** none
- **Dev-trigger:** ≥ 1 SOL köpt inom 10 sek
- **Slippage-estimat:** ≤ 3 %
- **RTT:** ≤ 150 ms
- **Maxpositioner:** 2 trades per wallet

### 4.2 Scoring-algoritm (för kvalificerade pooler)
Viktning:
- LP: 40 %
- Dev-trigger: 30 %
- Rug-score: 20 %
- ROI-estimat: 10 %

Formel (LP_norm är LP normaliserat till 0–1, min=20, max=150):

    score = (LP_norm * 0.4) + (dev_trigger * 0.3) + (rug_score/100 * 0.2) + (ROI_est * 0.1)

---

## 5. Risk- & exitregler

### 5.1 Riskkontroll
Botten pausar vid:
- Precision (senaste 50 trades) < 85 %
- Dags-P&L < –2 % av wallet
- RTT > 150 ms i 3 trades i följd
- Max riskcap: 50 SOL/dag

### 5.2 Exitregler
- **Stop Loss:** –4 % eller 45 sek timeout (om TP ej aktiverad)
- **Trailing Take Profit:**
  - Aktiveras vid +12 % ROI
  - Lås vinst vid +6 %
  - SL följer toppen med –3 %

---

## 6. Roadmap & nuvarande status

### 6.1 Status (2025-08-08)
- SafetyService: påbörjad, ej komplett
- TradePlanner: påbörjad, ej komplett
- BundleSender: klar i stub, ej integrerad i pipeline
- Metrics/monitoring: saknas

### 6.2 Prioriterad roadmap
1. Implementera SafetyService (rug checks, metadata, blacklist)
2. Implementera TradePlanner (Cupsyy-trigger, latency, pre-swap)
3. Integrera BundleSender i orchestratorn
4. CI med integrationstester på Devnet
5. Health-check + metrics
6. Backtest mot historiska Cupsyy-pooler

---

## 7. Tekniska krav & latencybudget
- All prestandakritisk kod ska köras i Node-process
- Modulär kodstruktur med separata tjänster (StreamListener, SafetyService, TradePlanner, TradeService, RiskManager, BundleSender)

**Latencybudget:**
- Geyser → bot: < 150 ms
- Signering + sändning: < 50 ms
- Jito-bundle exekvering: < 100 ms

---

## 8. Felhantering & fallback
- Om GitHub-API, Solana RPC eller `.env` saknas → avbryt analys/trade
- Om modul kraschar (ex. SafetyService) → logga till Discord och avbryt botten
- Fallback: försök ansluta mot sekundär RPC/JITO-endpoint innan avbrott

---

## 9. Loggstruktur
Alla loggar till Discord ska följa JSON-formatet nedan (indraget):

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

- **timestamp:** UTC ISO8601
- **latency:** End-to-end, ms
- **outcome:** Resultatklassificering

---

## 10. Formatterings- & outputregler
För all textoutput som genereras i samband med utveckling, analys eller koddelning:

1. **En kodruta per fil** – hela filinnehållet omsluten av en enda triple-backtick-ruta från början till slut.
2. **Inga inre backticks** inom filinnehållet – använd istället indragna textblock (4 mellanslag) för JSON, exempeldata, diagram och ASCII-flöden.
3. **Språkmarkering** ska anges i öppningen av kodrutan (`markdown`, `ts`, `json` etc.).
4. **Diagram och ASCII**: alltid indragna textblock (ej kodruta om inte explicit behövs för körning).
5. **JSON-exempel**: indrag med 4 mellanslag, ej kodruta med backticks.
6. **Visuell helhetskoll**: Kodrutan får inte brytas eller delas upp.
7. Vid export till fil: inga specialtaggar, metadata eller extra symboler som kan orsaka formatfel.

---
