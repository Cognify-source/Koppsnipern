# 🏹 Koppsnipern – Master Prompt (Uppstart & Arbetscykel)

## 1. Syfte
Detta dokument är den **enda startprompten** för Koppsnipern.  
Den ersätter `docs/startprompt.txt` och kombinerar nyckelinsikter från:
- `docs/handover.md` (roadmap & status)
- `docs/sniper_playbook.md` (tradingregler)
- `docs/GPT-INSTRUKTIONER.txt` (arbetsinstruktioner)

Målet är att snabbt och träffsäkert starta och driva utvecklingen utan att växla mellan flera styrdokument.

---

## 2. Vid ny session
1. **Läs in roadmapen** i `handover.md`.
2. **Kontrollera senaste status** i *Senaste aktivitet*.
3. **Identifiera nästa punkt** i roadmapen.
4. Lista och kartlägg alla filer som berör nästa steg (rekursivt).
5. Starta arbetet direkt.

---

## 3. Hårda tekniska regler (ur Playbooken)
- **LP:** WSOL-LP ≥ 20 SOL  
- **Creator fee:** ≤ 5 %  
- **Mint authority:** none  
- **Freeze authority:** none  
- **Dev-trigger:** ≥ 1 SOL inom 10 sek  
- **RTT:** ≤ 150 ms  
- **Slippage:** ≤ 3 %  
- **Riskcap:** 50 SOL/dag  
- **Maxpositioner:** 2 trades/wallet

---

## 4. Kodprinciper
- Följ alltid reglerna i `sniper_playbook.md`.
- Modulärt och prestandaeffektivt (Node-process för kritiska delar).
- Säkerställ att **SafetyService**, **TradePlanner** och **BundleSender** utvecklas enligt roadmap-prioritet.
- Ny kod ska alltid inkludera:
  - Filtreringslogik enligt hårda regler.
  - Loggning av `rug_score`, `latency`, `outcome`.
  - Fail-safe-hantering vid avvikelser.

---

## 5. Efter varje steg
1. Uppdatera `handover.md` med ny status.
2. Gå vidare till nästa roadmap-punkt utan att vänta på manuell input.

---

## 6. Dokumentrelation
- **Master Prompt (detta dokument):** Startinstruktioner + arbetsflöde.
- **handover.md:** Roadmap & aktuell status.
- **sniper_playbook.md:** Fullständig strategi och riskregler.
- **GPT-INSTRUKTIONER.txt:** Djupgående arbetsinstruktioner och repo-hantering.

---

**Version:** 1.1