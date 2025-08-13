# Koppsnipern — Operativ policy (version 1.8)

**Syfte:**
Denna policy styr drift av Koppsnipern, som är en sniper-bot vars syfte är att snipa nyskapade solana pools. 
Den beskriver mål, prioriteringar, handelsflöde, hårda filter, risk- och felhantering samt dokumentrutiner. Policyn gäller endast botens realtidsdrift.


## Kort sammanfattning
* **Prioritering:** säkerhet och hastighet.
* **Precisionmål:** 90–95 % (formel: `(framgångsrika_trades / totala_trades) * 100`).
* **Latensmål (end‑to‑end):** 350 ms.
* **Max daglig risk:** 50 SOL.

## Initiering
* Vid misslyckad självtest: **stoppa trading** och logga `SELFTEST_FAIL`.

## Operativt handelsflöde (steg för steg)
1. Upptäckt: ny pool hittas via Geyser/WebSocket. Vi scannar efter Launchlab, Pump V1 och Pump AMM.
2. Bekräftelse: verifiera pool‑initiering inom **2 sekunder**.
3. Kör hårda filter och rug‑checks.
4. Förbered och signera swap‑transaktionen (pre‑signed).
5. Vänta på Cupsyy‑signal (wallet suqh5sHtr8HyJ7q8scBimULPkPpA557prMG47xCHQfK) — normalt **10–45 sek** efter poolskapande (justerbart).
6. Skicka transaktionen som en Jito‑bundle.
7. Exit: följ exit‑regler (se Risk & Exit).
8. Varje trade loggas till fil logs/finished_trades.json med info om insats, PnL, timestamp och vilken pool det gäller.

## Hårda filter (måste passeras)
* Minimalt WSOL‑LP:** 10 SOL.
* Max creator fee:** 5 %.
* Mint authority:** måste vara `none` (annars skippas pool).
* Freeze authority:** måste vara `none` (annars skippas pool).
* Max slippage‑estimat:** 3 %.
* RTT (round‑trip time) max:** 150 ms.
* Max öppna positioner per wallet:** 2.

(Om något filter missas → avbryt handel för den poolen.)

---

## Riskhantering & exitregler

**Paus-/safety‑villkor (stoppa trading):**

* Precision senaste `max(50 trades, 24 h)` < 85%.
* Daglig P\&L <−2% av wallet.
* RTT > 150 ms i 3 trades i rad.
* Daglig riskcap: 50 SOL nådd.

**Exitregler per trade:**

**Stop‑loss:**
Sälj vid −4% eller om trade når 45s timeout.

**Trailing take‑profit:**

* Aktivera vid ROI ≥ 12%.
* Lås vinst vid +6%.
* Stop‑loss följer med med 3% från toppen efter aktivering.

---

## Felhantering
* Modul‑fel:** logga till Discord och stoppa boten.
* RPC eller Jito‑fel: växla automatiskt till sekundär endpoint.
* Både primär och sekundär endpoint misslyckas:** stoppa boten.

---

## Roadmap (prioriteringar)

*Senast uppdaterad: \[fyll i datum]* — prioriterade items:

1. SafetyService (rug‑checks, metadata, blacklist).
2. TradePlanner (Cupsyy‑trigger, latens, pre‑swap).
3. BundleSender‑integration (Jito).
4. CI med Devnet‑integrationstester.
5. Health‑checks och metrics.
6. Backtest mot historiska Cupsyy‑pooler.

---

## Tekniska krav

* Prestandakritisk logik körs i Node‑process.
* Moduler: StreamListener, SafetyService, TradePlanner, TradeService, RiskManager, BundleSender.
* Latensbudget (ms):

  * Geyser → bot: **150 ms**.
  * Signera & skicka: **50 ms**.
  * Jito bundle execution: **100 ms**.
    (Totalt mål ≈ 300–350 ms.)

---

## Loggning

* All handel loggas internt.
* Publika loggar visar endast säkra pools.
* Discord‑notiser i klartext.
* Lokalt JSON‑schema för loggar (fält):

  * `timestamp` (ISO8601)
  * `pool_address` (string)
  * `rug_score` (number)
  * `latency_ms` (number)
  * `outcome` (SUCCESS | FAIL | SKIPPED)
  * `slot_lag` (number)
  * `fee_ratio` (number)
  * `roi_percent` (number)

---

## Dokumenthantering

* Dokumentet är **versionerat och iterativt**.
* Uppdateringsprotokoll:

  * Versionera vid ändring (t.ex. 1.8 → 1.9).
  * Arkivera tidigare versioner.
  * Skriv kort changelog med datum och ansvarig.
  * OP är referens för utveckling — ändringar påverkar inte drift förrän kod/konfig uppdaterats.
* Review: minst en gång per utvecklingscykel eller vid större arkitekturändring.

---

## Konflikthantering

* Högsta säkerhetsnivå gäller alltid.
* Vid osäkerhet → **ingen trade**, logga för manuell granskning.

---

## Snabb‑checklista innan drift

* [ ] Självtest grönt (annars stoppa).
* [ ] Kontrollera precision (50 trades / 24 h).
* [ ] Primär + sekundär RPC konfigurerad och testad.
* [ ] Health‑checks och metrics aktiva.
* [ ] Changelog/version uppdaterad i repo.

---

**Anmärkning:** Detta dokument fungerar som drift‑referens. Vid ändringar: uppdatera versionsnummer, skriv changelog och kör fullständiga integrationstester (gärna mot Devnet) innan release.
