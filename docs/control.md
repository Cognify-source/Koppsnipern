# 📘 Koppsnipern – Operativt Styrdokument (Förenklad & Förtydligad Version)

**Version:** 1.5 (förslag – förbättrad struktur, borttagen redundans, klargjorda regler)

---

## 1. Syfte & Strategi

Koppsnipern är en sniper-bot för Solana LaunchLab-pooler, optimerad för att agera strax efter Cupsyy och maximera vinst med minimal risk.

**Målsättning:**

* Precision: 90–95 %
* End-to-end-latens: < 350 ms
* Stabil daglig nettovinst
* Max risk: 50 SOL/dag

**Kärnstrategi:**

* Cupsyy-trigger + regelbaserad filtrering
* Säkerhet (rug checks) prioriteras före hastighet
* Skalning sker först efter validerad precision

---

## 2. Operativt Flöde

1. Upptäck ny pool via Geyser/WebSocket.
2. Bekräfta LaunchLab-initiering (Raydium `Initialize`) inom 2 sekunder.
3. Kör hårda filter och rug checks.
4. Förbered signerad swap.
5. Vänta på Cupsyy-signal (10–45 sek efter poolskapande).
6. Skicka transaktion som Jito-bundle.
7. Exit enligt exitregler.

---

## 3. Filter & Scoring

### 3.1 Hårda Filter (måste uppfyllas)

* **WSOL-LP:** ≥ 20 SOL
* **Creator fee:** ≤ 5 %
* **Mint authority:** none
* **Freeze authority:** none
* **Dev-trigger:** ≥ 1 SOL köpt inom 10 sek
* **Slippage-estimat:** ≤ 3 %
* **RTT:** ≤ 150 ms
* **Max positioner:** 2 trades/wallet

*(Utvecklingsläge: Fler källor tillåtna, vissa filter kan vara avstängda för fler träffar.)*

### 3.2 Scoring-formel

```
score = (LP_norm * 0.4) + (dev_trigger * 0.3) + (rug_score/100 * 0.2) + (ROI_est * 0.1)
```

* LP\_norm: LP normaliserat 0–1 (min=20, max=150)
* Dev-trigger: binärt (1 eller 0)

---

## 4. Risk & Exitregler

**Paus vid:**

* Precision (senaste 50 trades) < 85 %
* Dags-P\&L < –2 % av wallet
* RTT > 150 ms i 3 trades i rad
* Daglig riskcap nådd (50 SOL)

**Exit:**

* Stop Loss: –4 % eller 45 sek timeout
* Trailing TP:

  * Aktiveras vid +12 % ROI
  * Lås vinst vid +6 %
  * SL följer toppen med –3 %

---

## 5. Roadmap (Prioriterad)

1. SafetyService (rug checks, metadata, blacklist)
2. TradePlanner (Cupsyy-trigger, latency, pre-swap)
3. BundleSender-integration
4. CI med Devnet-integrationstester
5. Health-check + metrics
6. Backtest mot historiska Cupsyy-pooler

---

## 6. Tekniska Krav & Latensbudget

* Prestandakritisk kod körs i Node-process.
* Modulstruktur: StreamListener, SafetyService, TradePlanner, TradeService, RiskManager, BundleSender.

**Latencybudget:**

* Geyser → bot: < 150 ms
* Signering + sändning: < 50 ms
* Jito-bundle-exekvering: < 100 ms

---

## 7. Felhantering & Fallback

* Vid modulfel → logga till Discord och stoppa bot.
* Vid RPC/JITO-fel → växla till sekundär endpoint.
* Vid dubbel endpoint-fail → stoppa bot.

---

## 8. Loggning

**Endast SAFE-pooler ska loggas**, både i Discord och i lokal fil.

**Discord:** Klartext. Webhook-URL ska hämtas från `.env`.

**Lokal JSON:**

```
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
```

---

## 9. Formatteringsregler

* En kodruta per fil
* Inga inre backticks
* Språkmarkering (`markdown`, `ts`, `json`)
* Diagram & ASCII: indragna textblock
* JSON-exempel: 4 mellanslag
* Kodrutor får ej brytas upp

---

## 10. Självtest vid Uppstart

* Kör simulerad trade mot Devnet/mock-pool.
* Logga resultat till Discord och lokal JSON.
* Vid fail → stoppa trading och logga `SELFTEST_FAIL`.

**JSON-format:**

```
{
    "timestamp": "ISO8601",
    "selftest": "PASS|FAIL",
    "latency": "ms",
    "remarks": "string"
}
```

---

## 11. Konflikthantering

* Högsta säkerhetsnivå gäller alltid.
* Vid osäkerhet → ingen trade, logga händelsen.

---

## 12. Kodändringspolicy

1. Ändra filer endast på begäran.
2. Presentera kodförslag, invänta godkännande.
3. All annan kommunikation måste ske i chatten.
4. Spara tokens genom att visa endast relevanta avsnitt.
5. Logga alltid ändringar.
6. Använd checkpoints vid större steg.
