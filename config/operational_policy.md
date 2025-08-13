# Koppsnipern — Operativ policy (version 1.8)

**Syfte:**
Denna policy styr drift och utveckling av Koppsnipern, som är en sniper-bot vars syfte är att snipa nyskapade solana pools. Din uppgift är att bistå vid utvecklingen av denna bot.
Den beskriver mål, prioriteringar, handelsflöde, hårda filter, risk- och felhantering samt dokumentrutiner.

---

* **Huvudprincip:** Säkerhet före hastighet.
* **Mål (precision):** 90–95 %.
* **Mål (latens E2E):** < 350 ms.
* **Mål (max risk/dag):** 50 SOL.

---

## Startvillkor
* **Självtest:** Måste passera. Vid fel: avbryt start och logga `SELFTEST_FAIL`.

---

## Handelsflöde
1.  **Upptäckt:** Lyssna på Geyser/WebSocket för nya pooler (mål: Launchlab, Pump V1, Pump AMM).
2.  **Verifiering:** Bekräfta att poolen är initierad (< 2 sekunder).
3.  **Säkerhetskontroll:** Validera mot hårda filter och rug‑checks.
4.  **Förberedelse:** Pre-signera swap-transaktion.
5.  **Signal:** Invänta trigger från Cupsyy-wallet (`suqh5sHtr8HyJ7q8scBimULPkPpA557prMG47xCHQfK`).
    **Tidsfönster:* 10–45 sekunder efter pool-initiering.
6.  **Exekvering:** Skicka transaktion via Jito bundle.
7.  **Avslut:** Hantera position enligt definierade exit-regler.

---

## Obligatoriska filter
*En pool måste passera samtliga filter för att handel ska kunna initieras.*

- **Likviditet (WSOL):** > 10 SOL
- **Creator Fee:** < 5 %
- **Mint Authority:** Avsagd (`None`)
- **Freeze Authority:** Avsagd (`None`)
- **Slippage (estimerad):** < 3 %
- **Round-Trip Time (RTT):** < 150 ms
- **Öppna Positioner:** < 2 (per wallet)

---

## Risk & Exit
*Regler som styr avslut av trades och paus av boten.*

### Globala skyddsregler (trading pausas)
*Om något av följande inträffar pausas all ny trading.*
- **Precision:** < 85 % (baserat på senaste `max(50 trades, 24h)`).
- **Kapitalförlust:** < -2 % av total wallet (per dag).
- **Latens (RTT):** > 150 ms (för 3 trades i rad).
- **Risk-tak (förlust):** 50 SOL (per dag).

### Exit-regler (per trade)
*Varje position hanteras enligt följande regler.*
1.  **Hard Stop-Loss:**
    - Sälj omedelbart om ROI når -4 %.

2.  **Trailing Take-Profit (TTP):**
    - **a) Aktivering:** TTP aktiveras när ROI når +12 %.
    - **b) Initialt vinstlås:** Vid aktivering flyttas stop-loss direkt till +6 % ROI.
    - **c) Medföljande stopp:** Därefter flyttas stop-loss uppåt och hålls alltid 3 % under den högsta uppnådda ROI. (Ex: om ROI når +20 %, är stop-loss +17 %)

---

## Felhantering
*Hantering av kritiska tekniska fel under drift.*

- **Vid internt modul-fel:**
    1. Logga felinformation till Discord.
    2. Stoppa boten omedelbart.

- **Vid anslutningsfel (RPC/Jito):**
    1. Växla automatiskt till sekundär endpoint.
    2. Om sekundär endpoint också misslyckas: stoppa boten.
	
---

## Kärnstrategi: Lead-Trading
Botens primära strategi är att agera som "lead-trader" genom att systematiskt placera en köporder omedelbart efter en känd, inflytelserik trader ("Cupsyy"), men före dennes community av copy-traders. Målet är att kapitalisera på den förväntade prisuppgång som följarna skapar.

Strategin exekveras i fem steg:

1.  **Prediktion:** Boten övervakar kontinuerligt nya Solana-pooler och tillämpar ett prediktivt filter baserat på Cupsyy's kända investeringsmönster (t.ex. min. LP, dev-aktivitet). Pooler som matchar mönstret flaggas som potentiella mål.

2.  **Förberedelse (Staging):** För varje potentiellt mål förbereds och pre-signeras en komplett köptransaktion. Dessa transaktioner hålls redo för omedelbar exekvering.

3.  **Trigger:** Den enda händelsen som utlöser en köporder är en bekräftad transaktion från Cupsyy's plånbok (`suqh5sHtr8HyJ7q8scBimULPkPpA557prMG47xCHQfK`) i en av de förberedda målpoolerna.

4.  **Exekvering:** Vid en giltig trigger skickas den förberedda transaktionen omedelbart via en Jito-bundle. Detta görs för att optimera hastigheten och öka sannolikheten för att transaktionen inkluderas i blocket direkt efter Cupsyy's.

5.  **Exit:** Positionen hanteras enligt definierade exit-regler (se sektion "Risk & Exit"), med en grundinställning mot snabba exits för att realisera vinst från den initiala volatiliteten.

----

## Teknisk arkitektur & prestanda

### Systemkrav
- **Runtime:** Prestandakritisk logik körs i en Node.js-process.
- **Infrastruktur:** Boten driftas på en dedikerad VPS co-located nära Solanas RPC-servrar (t.ex. Frankfurt) för att minimera nätverkslatens.
- **Anslutning:** Använder en privat, låglatens RPC-endpoint och gRPC via Geyser.

### Modulär design
Boten består av följande logiska moduler:
- **dexPoolListener:** Tar emot och avkodar data från Geyser.
- **PredictionEngine:** Analyserar pooler, applicerar filter och hanterar "staged" trades.
- **SafetyService:** Utför rug-checks och validerar säkerhet.
- **ExecutionService:** Övervakar trigger-plånboken och skickar transaktioner via Jito.
- **RiskManager:** Applicerar globala och trade-specifika riskregler.

### Latensbudget (end-to-end)
*Målet är att gå från pool-upptäckt till skickad bundle på **under 100 ms**.*
- **Geyser → Bot:** < 40 ms
- **Intern processering (prediktion & signering):** < 10 ms
- **Trigger-detektion → Skickad bundle:** < 50 ms

---

## Loggning & Övervakning

### Logg-nivåer och syfte
- **Interna loggar (DEBUG):** Detaljerad information om varje steg i processen, inklusive prediktionslogik, "staged" trades och trigger-events. Används för felsökning. Mål: `logs/internal_debug.log`.
- **Transaktionsloggar (INFO):** En post för varje slutförd, misslyckad eller skippad trade. Används för prestanda-analys. Mål: `logs/trades.json`.
- **Publika notiser (NOTIFY):** Lättlästa notiser till Discord för realtidsövervakning av viktiga händelser (t.ex. lyckad trade, aktivering av skyddsregel).

### JSON-schema för transaktionslogg (`trades.json`)
*Alla fält är obligatoriska.*
- `timestamp` (string, ISO8601)
- `poolAddress` (string)
- `outcome` (string: `SUCCESS | FAIL_RPC | FAIL_RISK | SKIPPED_FILTER | SKIPPED_NO_TRIGGER`)
- `latencyMs`:
    - `prediction` (number)
    - `execution` (number)
- `roiPercent` (number)
- `isLeadTrade` (boolean): `true` om triggad av Cupsyy.
- `triggerTx` (string, optional): Transaktions-ID för Cupsyy's köp.
- `slotLag` (number)

---

## Policy-hantering
*Denna policy är ett levande dokument och ska hållas uppdaterad.*

**Vid ändringar:**
1.  **Versionera:** Öka versionsnumret (t.ex., 1.8 → 1.9).
2.  **Logga:** Skriv en kort sammanfattning av ändringen, med datum, i en changelog.
3.  **Arkivera:** Spara den föregående versionen av dokumentet.

*Policyn fungerar som kravspecifikation. Kod och konfiguration måste uppdateras för att reflektera ändringar innan de anses vara i drift.*

---

## Gyllene regel: Säkerhet först
*Detta är min viktigaste princip och övertrumfar alla andra regler.*

Vid minsta osäkerhet gällande en pools säkerhet, data-integritet eller ett trade-beslut: **AVBRYT**. Logga händelsen för manuell granskning. Ingen trade är bättre än en dålig trade.

---

## Checklista före start
*En sista kontroll innan boten aktiveras i live-läge.*

- **[ ] Startvillkor:** Har självtestet kört och passerat utan fel?
- **[ ] Anslutning:** Är primär och sekundär RPC-endpoint bekräftat nåbara och snabba?
- **[ ] Övervakning:** Är systemet för health-checks och metrics aktivt och synligt?
- **[ ] Riskstatus:** Är alla globala skyddsregler (precision, daglig P&L) inom sina normala gränser?
- **[ ] Policy-synk:** Om policyn nyligen ändrats, är versionsnummer och changelog uppdaterade?

---

## Roadmap: Prioriterade utvecklingsfaser
*Boten utvecklas iterativt med fokus på testbarhet, säkerhet och hastighet för att framgångsrikt kunna agera "lead-trader".*

**Fas 1: Infrastruktur & Validering**
1.  **Backtesting-ramverk:** Bygg ett system för att köra och validera vår prediktionsmodell och handelsstrategi mot historisk data. *Mål: Riskfri finjustering av strategin.*
2.  **CI & Devnet-tester:** Sätt upp en automatiserad test-pipeline (Continuous Integration) mot Devnet. *Mål: Garantera kodkvalitet och tillförlitlighet kontinuerligt.*

**Fas 2: Kärnlogik & Exekvering**
3.  **Kärnmoduler (Prediction & Safety):** Utveckla `dexPoolListener` och `safetyService` för att identifiera och säkerhetsgranska potentiella målpooler enligt vår strategi. *Validering: Testas löpande mot backtesting-ramverket.*
4.  **Exekvering (Jito):** Integrera `tradeService` för att hantera "staging" av transaktioner och omedelbar exekvering via Jito när triggern (`suqh5s...`) detekteras. *Validering: Testas mot Devnet via CI-pipelinen.*

**Fas 3: Drift & Övervakning**
5.  **Metrics & Health Checks:** Implementera detaljerad realtidsövervakning av prestanda (latens, P&L) och systemhälsa. *Mål: Full insyn under live-drift.*