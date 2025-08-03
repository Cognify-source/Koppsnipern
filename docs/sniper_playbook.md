# Sniper-Playbook v3.3 (Koppsnipern)

---

## 🎯 SYFTE OCH STRATEGI

Sniper-bot för Solana LaunchLab-pooler. Exekverar strax efter Cupsyy.
Primärmål:

* 90–95 % precision
* Latens < 350 ms (E2E)
* Stabil daglig nettovinst, max 50 SOL risk per dag

**Modell:**

1. Prediktiv filtrering (ML + feature rules)
2. Bekräftelse: Cupsyy-signatur
3. Exekvering: Jito-bundle innan copytraders

---

## 📈 TRADEPIPELINE

1. Pool upptäcks via Geyser
2. Feature extraction → ML-score (om tillgänglig)
3. Skapa signerade swap-transaktioner (flera fees)
4. Vänta på Cupsyy-signal
5. Skicka optimal Jito bundle
6. Exit enligt regler (→ se EXITREGLER nedan)
7. Validera att poolen är en faktisk LaunchLab:
   → Raydium `Initialize`-event måste ske inom **10 sekunder** från pool-creation

**Precision-definition:**
Andel trades där Cupsyy köpt ≤ 10s innan vår exekvering och ROI ≥ 0 %

---

## 🧪 FILTER & TRIGGERS

### Hårda regler (måste uppfyllas):

* WSOL-LP ≥ 20 SOL
* Creator fee ≤ 5 %
* Revoked mint/freeze
* Dev-trigger:

  * Dev-köp ≥ 1 SOL inom 10 sek

### Rug-check (endast loggning & analys):

* `is_safe == true` *(extra trygghet – valfri)*
* `rug_score ≥ 30` *(mjuk gräns, loggas vid avvikelse)*

### Tillägg:

* ML-score `P(Cupsyy) ≥ 0.8` (om modell är laddad)
  → *Fallback: om ML-score saknas → fortsätt om övriga filter godkända*
* RTT ≤ 150 ms mot Jito (avser realtidsfördröjning vid exekvering – stoppa om > 3 trades i följd)
* Filter-exekvering ≤ 500 ms
* Slippage-estimat < 3 % (för aktuell storlek, kontrolleras även vid sändning)

---

## 💰 KAPITAL & SKALNING

* **Start:** 0.1–0.5 SOL (testfas)
* **Skalning:** endast efter 100 trades med:

  * ≥ 95 % precision
  * Nettopositiv ROI
* **Trade-size (enligt WSOL-LP):**

  * 20–40 SOL → 2 SOL
  * 40–60 SOL → 3 SOL
  * 60–100 SOL → 5 SOL
  * 100–150 SOL → 8 SOL
  * > 150 SOL → 10 SOL (hårt tak)
* **Slippage-krav:** ≤ 3 % för vald storlek

---

## 🔐 RISKKONTROLL

Bot pausar automatiskt vid:

* [ ] Precision (senaste 50 trades) < 85 %
* [ ] Dags-P\&L < –2 % av walletbalans
* [ ] RTT > 150 ms i 3 trades i följd
* [ ] Exekveringspris > 120 % av init-pris

**Maxpositioner:** 2 samtidiga trades per wallet
**Riskcap:** 50 SOL per orchestrator/dag (återställs 00:00 UTC)

---

## 📤 EXITREGLER

* **Stop-loss (SL):**

  * –4 % eller 45 sek timeout
  * *Timeout-regeln gäller endast om TP ej är aktiv – vid aktiv TP gäller trailing exit nedan*

* **Trailing TP:**

  * Aktiveras vid +12 %
  * Lås vinster på +6 %
  * SL följer toppen med –3 %

Ex: vid +30 % → SL = +27 %, vid +60 % → SL = +57 %

---

## 🧠 ML & LOGGNING

*Obs: Rug-check (`rug_score`, `is_safe`) används endast för loggning och analys, inte för att blockera trades.*

* **Per trade loggas:**

  * `slot_lag`, `fee_ratio`, `rug_score`, `latency`, `outcome`
* **Nattlig rapport:**

  * Median ROI, fee, slot lag, precision
  * Rek: skickas till Discord/webhook
* **ML-modell:**

  * Retränas var 10\:e dag
  * Alias-listor uppdateras parallellt
  * Om ML-score saknas → fortsätt ändå

---

## ⚙️ DRIFT & ÖVERVAKNING

**Dagliga rutiner:**

* Backup av privata nycklar + ML-konfig
* Driftstatus-check varje morgon:

  * gRPC-anslutning aktiv
  * RTT mot Jito < 40 ms (övervakningsmål – inte samma som triggergräns)
  * CPU/heap inom gräns
  * Bundle-fel under tröskel

**Latencybudget (mål):**

* Geyser → bot: < 150 ms
* Pre-signering + sändning: < 50 ms
* Jito-bundle-fördröjning: < 100 ms

---

## 🚀 FÖRBEREDANDE STEG

Checklista inför drift:

* [ ] `.env` med `RPC_URL`, `PRIVATE_KEY`, `JITO_AUTH`
* [ ] `gitignore` korrekt konfigurerad
* [ ] Tip-wallet för Jito innehåller minst 0.1 SOL
* [ ] Utför testköp med 0.1 SOL för latency-mätning
* [ ] Säkerställ logging av varje trade (inkl PnL)

---

## ✅ IMPLEMENTERINGSPRINCIPER

* Strict filter → inga “best effort”-trades
* Exekvering först efter bekräftad signal
* All logik testas i torrsim innan live
* Skala endast när precision och ROI är validerade

---

## 📎 APPENDIX

* **Cupsyy wallet:** `suqh5sHtr8HyJ7q8scBimULPkPpA557prMG47xCHQfK`
* **Dev-trigger-villkor:** se ovan
* **Testmiljö:** forkad mainnet / Devnet fallback
* **Slottid-krav:** `slot_lag_p90 ≤ 1`

### Exempelscenario – Lönsamhetsberäkning

* Totalt lanserade LaunchLab-pooler/månad: \~1 200
* Cupsyy-trades/månad: \~210
* Möjliga träffar (efter filter & latens): \~140–170
* Lyckade trades (≥ 0 % ROI): \~110–150
* Snitt trade size: 2–5 SOL
* Snittvinst/trade: \~3–7 % (efter slippage)
* Vinst per trade: 0.06–0.35 SOL
* Estimerad månadsvinst: 11–38 SOL
* Risk per månad: max 50 SOL
