# Koppsnipern — Operativ policy (version 2.0)

**Syfte:**
Denna policy styr utveckling och drift av Koppsnipern, som är en sniper-bot vars syfte är att snipa nyskapade solana pools. 
Den beskriver mål, prioriteringar, handelsflöde, hårda filter, risk- och felhantering samt dokumentrutiner. 

---

* **Huvudprincip:** Säkerhet först, hastighet tätt därefter.
* Mål (precision): 90–95 %.
* Mål (latens E2E): < 350 ms.
* Mål (max risk/dag): 50 SOL.
* Mål (max slippage/trade) 15%

---

## Startvillkor
* **Självtest:** Måste passera. Vid fel: avbryt start och logga `SELFTEST_FAIL`.

---

## Handelsflöde
1. Upptäckt: Lyssna på Geyser/WebSocket för nya pooler (mål: Launchlab, Pump V1, Pump AMM och Meteora DBC/Virtual Curve).
2. Verifiering: Bekräfta att poolen är initierad (< 2 sekunder).
3. Säkerhetskontroll: Validera mot hårda filter och rug‑checks (se nästa sektion).
4. Förberedelse: Pre-signera swap-transaktion.
5. Signal: Invänta trigger från Cupsyy-wallet (`suqh5sHtr8HyJ7q8scBimULPkPpA557prMG47xCHQfK`).
   Tidsfönster: 5–45 sekunder efter pool-initiering.
6. Exekvering: Skicka transaktion via Jito bundle.
7. Avslut: Hantera position enligt definierade exit-regler.

---

## Obligatoriska filter 
* En pool måste passera samtliga filter för att handel ska kunna initieras.
* Filter parallellverifieras i den mån det är möjligt

* Likviditet (WSOL): > 20 SOL
* Creator Fee: < 5 %
* Mint Authority: Avsagd (`None`)
* Freeze Authority: Avsagd (`None`)
* Simulerad säljtransaction: Framgångsrik
* Dev måste ha köpt för minst 1 SOL
* Top 10 holders äger < 10%
* RTT < 150 ms

---

## Risk & Exit
*Regler som styr avslut av trades och paus av boten.*

### Globala skyddsregler (trading pausas)
*Om något av följande inträffar pausas all ny trading.*
* Precision: < 85 % (baserat på senaste `max(50 trades, 24h)`).
* Kapitalförlust: < -2 % av total wallet (per dag).
* Latens (RTT): > 150 ms (för 3 trades i rad).
* Risk-tak (förlust): 50 SOL (per dag).

### Exit-regler (per trade)
*Varje position hanteras enligt följande regler.*
1.  **Hard Stop-Loss:**
    - Sälj omedelbart om ROI når -4 %.

2.  **Trailing Take-Profit (TTP):**
    - A) Aktivering: TTP aktiveras när ROI når +12 %.
    - B) Initialt vinstlås: Vid aktivering flyttas stop-loss direkt upp +6 % ROI.
    - C) Medföljande stopp: Därefter flyttas stop-loss uppåt och hålls alltid 3 % under den högsta uppnådda ROI. (Ex: om ROI når +20 %, är stop-loss +17 %)
	
---
	
## Max antal öppna trades simultant
* Max 2 trades öppna per wallet samtidigt.	

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
Botens primära strategi är att agera som "lead-trader" genom att systematiskt placera en köporder omedelbart efter en känd, inflytelserik trader ("Cupsyy"), men före dennes community av copy-traders. 
Målet är att kapitalisera på den förväntade prisuppgång som följarna skapar.

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

**Kärnmoduler:**
- **connectionManager:** Centraliserad RPC-hantering med global kö och rate limiting (100ms delay). Hanterar både HTTP och WebSocket-anslutningar med persistent connection pooling.
- **dexPoolListener:** Koordinerar alla DEX-specifika listeners och distribuerar pool-upptäckter.
- **safetyService:** Utför rug-checks och validerar säkerhet. Integrerad i alla listeners för realtids-säkerhetsbedömning.
- **notifyService:** Hanterar all loggning - terminal (färgkodad), Discord-notifikationer och filloggning (safe_pools.json, blocked_pools.jsonl).

**DEX-specifika listeners:**
- **pumpV1Listener:** Lyssnar på Pump.fun V1 (6EF8rrecthR5Dkzon8Nwu78hRvfCKubJ14M5uBEwF6P) via WebSocket, detekterar nya pooler genom tomma preTokenBalances.
- **pumpAmmListener:** Parsar CreatePoolEvent från Pump.fun AMM (pAMMBay6oceH9fJKBRHGP5D4bD4sWpmSwMn52FMfXEA).
- **launchLabListener:** Detekterar CreatePool-instruktioner från LaunchLab (LanMV9sAd7wArD4vJFi2qDdfnVhFxYSUg6eADduJ3uj).
- **meteoraDbcListener:** Lyssnar på InitializeVirtualPoolWithSplToken från Meteora DBC (dbcij3LWUppWqq96dh6gJWwBifmcGfLSB5D4DuSMaqN).

**Trading & Risk:**
- **tradePlanner:** Förbered och signerar transaktioner via Jito.
- **bundleSender:** Skickar Jito-bundles för snabb exekvering.
- **tradeService:** Genomför trades. TradeServiceBase är basen, med specialiserade underservices för varje DEX.
- **riskManager:** Applicerar globala och trade-specifika riskregler.

**Arkitektur-principer:**
- Staggered execution: Varje listener har unika intervaller (600-720ms) för att undvika RPC-konflikter.
- No-batching approach: En transaktion per RPC-anrop för maximal Chainstack-kompatibilitet.
- Ultra-stable queue management: Håller RPC-kön på 0-2 requests för optimal stabilitet.

### Latensbudget (end-to-end)
*Målet är att gå från pool-upptäckt till skickad bundle på **under 100 ms**.*
- **Geyser → Bot:** < 40 ms
- **Intern processering (prediktion & signering):** < 10 ms
- **Trigger-detektion → Skickad bundle:** < 50 ms

---

## Loggning & Övervakning

### Realtids Pool Detection Logging
**Format:** `[YYMMDD-HH:MM:SS] SOURCE | CA:ADDRESS | LP:VALUE | MINT_STATUS | FREEZE_STATUS | SAFETY_STATUS`

**Exempel:**
```
[250816-17:00:12] PumpV1 | CA:51KQraATtk22MQj4wHC24wzn4iQVBJszQABoZmfbGzqX | LP:0 | NO_MINT | FREEZE | BLOCKED
[250816-17:00:15] PumpAMM | CA:7MHpvp3tGizWNFxmTukxf4dCY64kjWjKCpJ9MM8r79Dz | LP:2.5 | NO_MINT | NO_FREEZE | SAFE
```

**Färgkodning (terminal):**
- Timestamp: Vit
- Källa (PumpV1/PumpAMM/LaunchLab/MeteoraDBC): Vit
- CA text + adress: Grön
- LP text + värde: Vit
- Mint/Freeze authorities: Röd=dåligt (har authority), Grön=bra (ingen authority)
- Safety status: Röd=BLOCKED, Grön=SAFE

### Automatisk filloggning
- **SAFE pools:** `logs/safe_pools.json` - Strukturerad JSON för säkra pooler
- **BLOCKED pools:** `logs/blocked_pools.jsonl` - JSONL-format med blockningsorsaker

### Traditionella logg-nivåer
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
*Detta är botens viktigaste princip och övertrumfar alla andra regler.*

Vid minsta osäkerhet gällande en pools säkerhet, data-integritet eller ett trade-beslut: **AVBRYT**. Logga händelsen för manuell granskning. Hellre ingen trade än en dålig trade.

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

**✅ Fas 1: Pool Detection & Logging (SLUTFÖRD - Aug 2025)**
1.  **✅ DEX Listeners:** Implementerat alla fyra DEX-listeners (PumpV1, PumpAMM, LaunchLab, MeteoraDBC) med WebSocket-baserad pool-detektion.
2.  **✅ RPC Optimization:** Centraliserad RPC-hantering med global kö, rate limiting (100ms), och ultra-stabil queue management.
3.  **✅ Safety Integration:** SafetyService integrerat i alla listeners för realtids-säkerhetsbedömning.
4.  **✅ Professional Logging:** Färgkodad terminal-loggning och automatisk filloggning (safe_pools.json, blocked_pools.jsonl).

**🔄 Fas 2: Trading Infrastructure (PÅGÅENDE)**
5.  **Cupsyy Trigger Detection:** Implementera realtids-övervakning av Cupsyy's wallet för att detektera köp-signaler.
6.  **Transaction Staging:** Pre-signering och staging av transaktioner för omedelbar exekvering vid trigger.
7.  **Jito Integration:** Komplett integration med Jito för snabb bundle-exekvering.

**📋 Fas 3: Risk Management & Optimization**
8.  **Risk Controls:** Implementera alla globala skyddsregler (precision, P&L, latens-trösklar).
9.  **Exit Strategy:** Trailing take-profit och stop-loss logik enligt policy.
10. **Performance Monitoring:** Detaljerad realtidsövervakning av prestanda (latens, P&L) och systemhälsa.

**🔮 Fas 4: Advanced Features**
11. **Backtesting Framework:** System för att validera strategier mot historisk data.
12. **CI/CD Pipeline:** Automatiserad test-pipeline mot Devnet.
13. **Multi-Wallet Support:** Stöd för flera wallets och position management.

**Aktuell status:** Pool detection och logging är komplett och stabil. Systemet detekterar framgångsrikt nya pooler från alla fyra DEX-källor med professionell loggning och säkerhetsbedömning.

---

## Data Sources & Listeners

Boten använder en modulär design för att lyssna på nya pooler från olika källor. Varje källa har sin egen listener-klass:

* `PumpV1Listener`:** Upptäcker nya pooler genom att prenumerera på loggar från Pump.fun V1-programmet och analysera transaktionens token-balanser.
* `PumpAmmListener`:** Upptäcker nya pooler genom att manuellt parsa `CreatePoolEvent` från loggdata som emitteras av Pump.fun AMM-programmet.
* `LaunchLabListener`:** Upptäcker nya pooler genom att hitta `CreatePool` instruktionen i loggar och sedan analysera transaktionens konton för att extrahera pool-data.
* `MeteoraDbcListener`:** Använder samma metod som LaunchLab-listenern, men letar efter `InitializeVirtualPoolWithSplToken`-instruktionen.

---

# INFO OM HUR NYA POOLER SKAPAS PÅ PUMP AMM, PUMP V1, LAUNCHLAB OCH METEORA DBC (VIRTUAL CURVE)

Metoder för att skapa nya pooler (och framförallt tracka dem i boten):
Alla metoder lyssnar på loggar via en websocket-anslutning till min Solana RPC-nod. 
Datan parsas för att leta efter specifika events, eller i vissa fall, en kedja av events.

1. Pump AMM:
Program-ID: pAMMBay6oceH9fJKBRHGP5D4bD4sWpmSwMn52FMfXEA
Metod: CreatePoolEvent.

2. Pump V1 (pump.fun):
Program-ID: 6EF8rrecthR5Dkzon8Nwu78hRvfCKubJ14M5uBEwF6P
Metod: Allt sker i en enda stor transaktion med tre steg:
* Den anropar programmet med en Create-instruktion
* Token skapas med InializeMint2
* Första Buy-anropet görs.
Det absolut tydligaste och enklaste tecknet är en transaktion som anropar programmet 6EF8rrecthR5Dkzon8Nwu78hRvfCKubJ14M5uBEwF6P och där preTokenBalances-listan i transaktionsdatan är tom. Jag vet inte om det räcker med att lyssna efter InitializeMint2, men det kan vi lista ut.

3. Launchlab:
Program-ID: LanMV9sAd7wArD4vJFi2qDdfnVhFxYSUg6eADduJ3uj
Metod: PoolCreateEvent.

4. Meteora DBC (Virtual Curve):
Program-ID: dbcij3LWUppWqq96dh6gJWwBifmcGfLSB5D4DuSMaqN
Metod: InitializeVirtualPoolWithSplToken.
