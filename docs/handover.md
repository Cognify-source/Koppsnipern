Koppsnipern UPDATED Sniper Bot – Handover Playbook
===========================================

1. ÖVERGRIPANDE STATUS
----------------------
- **Kodbas**: Typescript-projekt under `src/ts`, med Jest-tester under `tests/unit/ts` + `tests/integration`.
- **Bygg & Test**: 
  - `npm run build` kompilerar allt till `dist/`.
  - `npm run test:unit` kör alla unit-tester.
  - `npm run test:integration` kör stub-E2E + valfri Devnet-integration (skippas om nyckel saknas).
- **Miljö**: `.env`-fil (ej committad) laddas med `dotenv.config()` i `index.ts`.  
- **CI-förslag**: GitHub Actions som kör build → unit → integration (skippa Devnet-test om `PAYER_SECRET_KEY` saknas).

2. KLARA HUVUDFUNKTIONER
------------------------
- **Orchestrator** (`src/ts/index.ts`):  
  - Stub-mode: loopar över `STUB_SLOTS`, loggar slot, ping, “📦 Bundle skickad”.  
  - Riktigt mode: öppnar WebSocket (via `StreamListener`), mäter latency, feature→ML→risk→swap.
- **StreamListener** (`services/streamListener.ts`):  
  - Stub‐E2E testad via Devnet WebSocket E2E-test.
- **Latency-mätning** (`utils/latency.ts`):  
  - Wrapper runt timestamp för att mäta round-trip.  
- **TradeService** (`services/tradeService.ts`):  
  - Bygger Raydium-swap via `@raydium-io/raydium-sdk`.  
  - Unit-testad med mockad SDK som stubbar `fetchInfo`, `computeAmountOut`, `makeSwapTransaction`.
- **RiskManager** (`services/riskManager.ts`):  
  - Rullar precision, daily PnL, latency, blockhash‐ålder och prisslippage.  
  - Unit-testad.
- **FeatureService & MLService** (`services/featureService.ts`, `services/mlService.ts`):  
  - Kör Python-skript (LightGBM) för feature-extraktion & prediction.  
  - Unit-testar mockar bara `extract()` respektive `predict()`.
- **BundleSender** (`services/bundleSender.ts`):  
  - Jito Block Engine stub, används ej i trade-pipeline men testad.

3. PÅBÖRJADE MEN EJ FÄRDIGA DELAR
---------------------------------
- **Devnet-integration**: 
  - Testskript `tests/integration/tradeService.devnet.test.ts` finns, men kräver `.env` med JSON-array för `PAYER_SECRET_KEY` och `TRADE_POOL_JSON`.  
  - Airdrop via Web3.ts (`scripts/airdrop.ts`) är skrivet men ej integrerat i CI.
- **Jito Block Bundle**:  
  - `BundleSender` stubb finns, men ej kopplat i riktiga orchestrator‐flödet.
- **ML/feature‐skript**:  
  - Själva Python-scripts `extract_features.py` och `predict_model.py` ligger i `src/py/` men behöver implementeras, tränas och byggas in.
- **Metrics/monitoring**:  
  - Ej implementerat (hälsokontroll-endpoint, Prometheus-metrics, etc).
- **Dockerfile & Deployment**: 
  - Ej påbörjat. Inga instruktioner för container eller server‐provisioning.

4. KÄNDA BUGGAR & BLOCKERARE
----------------------------
- **Stub-test timeout**:  
  - `orchestrator.test.ts` hängde tidigare pga key‐parsing i `index.ts`; fixat genom att köra stub-loop före secret-setup.  
- **JSON-parse-fel**:  
  - Env-variabler måste vara JSON-arrays, annars kraschar `JSON.parse`.  
  - Devnet-test skippar nu om nyckel saknas.
- **TS-paths & type stubs**:  
  - Flera iterationer av `tsconfig.json` och `src/types/raydium-sdk/index.d.ts` för att få TypeScript att hitta `makeSwapTransaction`.
- **Testinnehåll**:  
  - `orchestratorTrade.test.ts` uppdaterad så `executeSwap` anropas med bara `0.1` (ej `PublicKey`).

5. AKTIVA TODOs
---------------
- **services/featureService.ts**  
  - IMPLEMENTERA: spawn av Python‐skript, hantera IO, felhantering.  
- **services/mlService.ts**  
  - IMPLEMENTERA: laddning av LightGBM-modell, batch-predict, caching.  
- **services/bundleSender.ts**  
  - KOPPLA IN: ersätta stub i orchestrator för riktiga Jito API‐anrop.  
- **scripts/airdrop.ts**  
  - INTEGRERA i CI: kör före Devnet-test.  
- **Dockerfile**  
  - SKAPA: containerbild med Node.js, Python, deps.  
- **Metrics endpoint**  
  - LÄGG TILL: `express`-server för `/health`, `/metrics`.  
- **ML re-training**  
  - SKRIV: script för att samla event, reträna modell var 10:e dag.

6. DESIGNBESLUT & KOMPROMISSER
-----------------------------
- **Stub-mode tidigt**:  
  - Flytt av stub-loop före all env‐parsing för att isolera E2E stub‐test från env‐dependencies.
- **TradeServiceOptions**:  
  - Lagt till `poolJson` i konstruktorn (istället för separat API‐anrop) för enklare testbarhet.
- **TS-stubs**:  
  - Använt `paths` i `tsconfig.json` för att peka `@raydium-io/raydium-sdk` mot lokala typfiler.
- **JSON‐import i Jest**:  
  - `resolveJsonModule` + `src/types/json.d.ts` för att kunna `import poolJson from "./*.json"`.

7. NYCKELFILERS PRIORITET & RELEVANS
------------------------------------
1. **`src/ts/index.ts`** – hjärtat i orchestratorn, stub vs riktig loop.  
2. **`src/ts/services/tradeService.ts`** – Raydium-swap‐logik, viktig för Devnet.  
3. **`tsconfig.json`** + **`src/types/raydium-sdk/index.d.ts`**, **`src/types/json.d.ts`** – TypeScript-stubs.  
4. **`tests/integration/orchestrator.test.ts`** – stub‐E2E, validerar orchestrator stub-läget.  
5. **`tests/integration/tradeService.devnet.test.ts`** – Devnet-integration, kräver env-setup.  
6. **`.env.example`** (lämpligen skapas) – dokumentation av alla nödvändiga env-vars.

8. PÅBÖRJADE HALVFÄRDIGA KODAVSNITT
----------------------------------
- **`rawEvent`** i `index.ts` är hårdkodat dummy‐data; bör ersättas med riktig event‐parsing från Geyser.  
- **RiskManager.recordPrices(0,0)** och `recordDailyPnl(0)` är placeholders.  
- **Jito BundleSender** är stubb, ingen riktig endpointintegrering.

9. LESSONS LEARNED & PATTERNs
-----------------------------
- **Guard JSON.parse**: alltid fallback till `{}` om env saknas.  
- **Stub tidigt**: isolera stub-läge innan resurs-initiering (keys, nätverk).  
- **TS stub modules**: `paths` + `typeRoots` är effektiva för att injicera custom‐d.ts.  
- **Jest async handles**: använd `--detectOpenHandles` / `--forceExit` för att få nedhängande handles att dö.

---

### 10. Roadmap – Nästa utvecklingssteg

1. **Python-koppling för feature/ML**  
   Implementera subprocess-anrop i `featureService.ts` och `mlService.ts`. Hantera fallback, fel, timeouts.

2. **Aktivera riktiga `rawEvent` från Geyser**  
   Byt ut dummy `rawEvent = {}` i orchestratorn. Skapa parser för realtidshändelser.

3. **Integrera Jito Block Bundle**  
   Ersätt stub i `bundleSender.ts` med riktiga API-anrop. Använd i `TradeService` eller direkt i orchestratorn.

4. **CI: Airdrop + Devnet-tests**  
   Lägg till `scripts/airdrop.ts` som steg i GitHub Actions. Skapa säker fallback om `.env` saknas.

5. **Health-check och metrics**  
   Lägg till Express-server med `/health`, `/metrics`. Logga latency, PnL, antal swaps etc.

6. **Dockerfile och build-miljö**  
   Skapa en container med Node.js + Python. Möjliggör lokal och molnbaserad körning.

7. **Retraining-skript för ML-modell**  
   Samla data efter varje trade. Schemalägg retraining var 10:e dag.

---

### 11. Arbetsflöde för iterativ utveckling

För att möjliggöra effektiv utveckling av snipern över flera sessions och chattar används följande strategi:

#### 🧠 Kontextminne & Token-effektivitet
- All viktig kontext och projektstatus sparas i `handover.md`
- Ny chatt = be GPT:  
  > “Läs in `docs/handover.md` och `docs/sniper_playbook.md`. Vi fortsätter därifrån.”

#### 🔁 Roadmap & progress-logg
- `Roadmap` (sektion 10) visar nästa steg
- Använd ✅, 🔄, ❌ framför varje punkt för att visa status:
  - ✅ = Klar
  - 🔄 = Pågående
  - ❌ = Avbruten / Pausad

#### 📌 Best practice
- Lägg till ny information i `handover.md` direkt efter avslutad implementation eller beslut
- Håll filen koncis – inga stora kodblock eller loggar
- Vid nya funktioner: dokumentera beslut och koppla till relaterade filer

---

Den här playbooken ger Koppsnipern UPDATED GPT full överblick på arkitektur, setup, befintlig testsvit, kända fallgropar och var de påbörjade delarna finns. Samtidigt är TODO-listan tydlig så next GPT direkt kan fortsätta implementera Python-integration, Jito Bundle, metrics, Docker, CI-airdrop och ML-retraining.```