# 🏹 Koppsnipern – Master Prompt (Uppstart & Arbetscykel)

**Version:** 1.2  
**Senast uppdaterad:** 2025-08-08

## 1. Syfte
Detta dokument är den **enda startprompten** för Koppsnipern.  
Den ersätter `docs/startprompt.txt` och kombinerar nyckelinsikter från:
- `docs/handover.md` (roadmap & status)
- `docs/sniper_playbook.md` (tradingregler)

Målet är att snabbt och träffsäkert starta och driva utvecklingen utan att växla mellan flera styrdokument.

---

## 2. Vid ny session
1. **Läs in roadmapen** i `handover.md`.
2. **Kontrollera senaste status** i *Senaste aktivitet*.
3. **Identifiera nästa punkt** i roadmapen.
4. Lista och kartlägg alla filer som berör nästa steg (rekursivt).
5. **Hämta senaste 5 commits** från GitHub och lista ändringar i roadmap-relaterade filer.
6. Starta arbetet direkt.

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
- **Formatteringsregel för dokument:**  
  - Alla kodblock som delas i chatten ska vara *en enda sammanhängande kodruta* från början till slut.  
  - Inga inre backticks (```) får förekomma i filerna vid export.  
  - Diagram, exempel och JSON i filer ska visas som **indragen text** (4 mellanslag) eller med alternativa avgränsare.

---

## 5. Felhantering
- Om GitHub-API, Solana RPC eller `.env` saknas → avbryt analys/trade.
- Om modul kraschar (ex. SafetyService) → logga till Discord & avbryt botten.
- **Fallback:** Vid RPC-fel → försök ansluta mot sekundär RPC/JITO-endpoint innan avbrott.

---

## 6. Efter varje steg
1. Uppdatera `handover.md` med ny status.
2. Gå vidare till nästa roadmap-punkt utan att vänta på manuell input.

---

## 7. Dokumentrelation
- **Master Prompt (detta dokument):** Startinstruktioner + arbetsflöde.
- **handover.md:** Roadmap & aktuell status.
- **sniper_playbook.md:** Fullständig strategi och riskregler.

---

## 8. Kort formatterings-checklista vid filutskick
1. En kodruta per fil (hela filen omsluten av en triple-backtick-ruta).  
2. Inga inre backticks – använd indragen text istället.  
3. Diagram & ASCII-flöden som indragen text.  
4. JSON-exempel som indragen text (4 mellanslag).  
5. Visuell helhetskoll: rutan får inte brytas.  
6. Använd korrekt språkmarkering (`markdown`, `ts`, `json` etc.).
