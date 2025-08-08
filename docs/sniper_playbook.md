# Sniper-Playbook v4.0 (Koppsnipern)

**Version:** 4.0  
**Senast uppdaterad:** 2025-08-08

## 1. 🎯 SYFTE OCH STRATEGI
Sniper-bot för Solana LaunchLab-pooler. Exekverar strax efter Cupsyy.  
Primärmål:
- 90–95 % precision  
- Latens < 350 ms (E2E)  
- Stabil daglig nettovinst, max 50 SOL risk per dag

**Huvudflöde:**
1. Pool upptäcks via Geyser  
2. Bekräfta LaunchLab (Raydium `Initialize` inom 2 sekunder)  
3. Filtrera med statiska rug checks  
4. Förbered signerade swappar  
5. Vänta på Cupsyy-signal  
6. Skicka Jito-bundle  
7. Exit enligt regler

**Precision-definition:**  
Cupsyy köpt ≤ 10s innan + ROI ≥ 0 %

---

## 2. 🧪 FILTER & TRIGGERS

### 2.1 Hårda regler
- WSOL-LP ≥ 20 SOL  
- Creator fee ≤ 5 %  
- Mint authority = none  
- Freeze authority = none  
- Dev-trigger: köp ≥ 1 SOL inom 10 sek

### 2.2 Rug-check (endast loggning)
- `is_safe == true` (valfri)
- `rug_score ≥ 30` (loggas)

### 2.3 Tekniska krav
- RTT ≤ 150 ms (pausa om >3 trades i följd)
- Filterkörning ≤ 500 ms
- Slippage-estimat < 3 %

---

## 3. 💰 KAPITAL & SKALNING
- **Start:** 0.1–0.5 SOL
- **Skalning:** efter 100 trades med ≥95 % precision & positiv ROI
- **Trade-size (WSOL-LP):**
  - 20–40 → 2 SOL
  - 40–60 → 3 SOL
  - 60–100 → 5 SOL
  - 100–150 → 8 SOL
  - >150 → 10 SOL (max)
- Slippagekrav: ≤ 3 %

---

## 4. 🔐 RISKKONTROLL
Bot pausar vid:
- Precision (50 senaste) < 85 %
- Dags-P&L < –2 % av wallet
- RTT > 150 ms i 3 trades
- Exekveringspris > 120 % av init
- Maxpositioner: 2 trades per wallet  
- Riskcap: 50 SOL/dag

---

## 5. 📤 EXITREGLER
- **SL:** –4 % eller 45 sek timeout (om TP ej aktiv)
- **Trailing TP:**  
  - Aktiv vid +12 %  
  - Lås vinst vid +6 %  
  - SL följer toppen med –3 %

---

## 6. 🧾 LOGGNING
Logga per trade:
- `slot_lag`, `fee_ratio`, `rug_score`, `latency`, `outcome`

Nattrapport (till Discord):
- Median ROI, fee, lag, precision

---

## 7. ⚙️ DRIFT & ÖVERVAKNING
Dagliga rutiner:
- Backup av nycklar
- Kontroll:
  - gRPC-anslutning
  - RTT < 40 ms
  - CPU/heap OK
  - Bundle-fel inom gräns

Latencybudget:
- Geyser → bot < 150 ms  
- Signering+sändning < 50 ms  
- Jito-bundle < 100 ms

---

## 8. 🚀 FÖRBEREDANDE STEG
Checklista:
- [ ] `.env` komplett
- [ ] `gitignore` korrekt
- [ ] Tip-wallet ≥ 0.1 SOL
- [ ] Testköp 0.1 SOL
- [ ] Logging fungerar

---

## 9. ✅ IMPLEMENTERINGSPRINCIPER
- Strikt filter
- Vänta på signal
- Allt testas torrt innan live
- Skala först efter validerad precision

### 9.1 Exempelscenario – lönsamhet
- LaunchLab-pooler/mån: ~1 200  
- Cupsyy-trades: ~210  
- Möjliga träffar: 140–170  
- Lyckade: 110–150  
- Snitt trade: 2–5 SOL  
- Snittvinst: 3–7 %  
- Estimerad vinst: 11–38 SOL  
- Maxrisk: 50 SOL

---

## 10. 📁 FILHANTERING & STRUKTUR
- TS-tjänster: `src/ts/services/`  
- Typer: `src/types/`  
- Testdata: `tests/integration/data/`  
- Stubtester: `tests/unit/ts/`

---

## 11. 📎 APPENDIX
- **Cupsyy wallet:** `suqh5sHtr8HyJ7q8scBimULPkPpA557prMG47xCHQfK`  
- **Dev-trigger:** se 2.1  
- **Miljö:** forkad mainnet eller Devnet fallback  
- **Slot-krav:** `slot_lag_p90 ≤ 1`

---

## 12. 📊 TRADE-PRIORITERINGSALGORITM (Pseudokod)

    function scoreTrade(pool):
        lp_score = normalize(pool.wsollp, min=20, max=150)
        dev_trigger_score = 1 if pool.dev_trigger >= 1 SOL within 10s else 0
        rug_score_adj = pool.rug_score / 100
        roi_estimate = estimateROI(pool)

        # Viktning: LP 40%, Dev-trigger 30%, Rug-score 20%, ROI 10%
        total_score = (lp_score * 0.4) + (dev_trigger_score * 0.3) + (rug_score_adj * 0.2) + (roi_estimate * 0.1)
        return total_score

    function selectBestTrade(trades):
        return max(trades, key=scoreTrade)

- **normalize():** Skalar värden till 0–1 baserat på förväntade intervall  
- Algoritmen körs efter att alla hårda filter passerats.
