# Koppsnipern UPDATED Sniper Bot – Handover Playbook

## 1. ÖVERGRIPANDE STATUS

- **Kodbas**: Typescript-projekt under `src/ts`, med Jest-tester under `tests/unit/ts` + `tests/integration`.
- **Bygg & Test**: 
  - `npm run build` kompilerar allt till `dist/`
  - `npm run test:unit` kör alla unit-tester
  - `npm run test:integration` kör stub-E2E + Devnet om nyckel finns
- **Miljö**: `.env` laddas via `dotenv.config()` i `index.ts`
- **CI-förslag**: GitHub Actions med build → unit → integration (skippa Devnet om `PAYER_SECRET_KEY` saknas)

## 2. KLARA HUVUDFUNKTIONER

- **Orchestrator** (`src/ts/index.ts`): stub-loop vs WS/Geyser-flöde
- **StreamListener**: testad Devnet-WS
- **Latency-mätning**: `utils/latency.ts`
- **TradeService**: bygger Raydium-swap, unit-testad
- **RiskManager**: PnL, latency, risk, unit-testad
- **FeatureService + MLService**: Python-anrop LightGBM, mockade tester
- **BundleSender**: Jito API stub (testad)

## 3. PÅBÖRJADE MEN EJ FÄRDIGA DELAR

- Devnet-test (`tradeService.devnet.test.ts`) kräver `.env`
- Airdrop-skript (`scripts/airdrop.ts`) klart men ej i CI
- BundleSender ej kopplad till pipeline
- ML-skript (Python) ej färdigtränade
- Metrics/monitoring saknas
- Inget Docker-stöd än

## 4. KÄNDA BUGGAR & BLOCKERARE

- Stub-test hängde pga `index.ts` key-parsing (åtgärdat)
- JSON-parse-krascher vid ogiltiga `.env`
- TS-paths för Raydium fixade via `paths` + `d.ts`
- `orchestratorTrade.test.ts` uppdaterad (enklare inputs)

## 5. AKTIVA TODOs

- [ ] IMPLEMENTERA: `services/featureService.ts` – spawn Python, IO, fel
- [ ] IMPLEMENTERA: `services/mlService.ts` – load modell, predict, cache
- [ ] KOPPLA IN: `services/bundleSender.ts` till orchestratorn
- [ ] INTEGRERA: `scripts/airdrop.ts` i CI
- [ ] SKAPA: `Dockerfile` med Node.js + Python
- [ ] LÄGG TILL: Express endpoint `/health`, `/metrics`
- [ ] SKRIV: retrain-script för ML-modell var 10:e dag
- [ ] SKAPA: `services/safetyService.ts` – rugcheck, metadata, blacklists
- [ ] SKAPA: `services/tradePlanner.ts` – dev-trigger, latency, pre-swap

## 6. DESIGNBESLUT & KOMPROMISSER

- Stub-mode initieras tidigt (före .env-load)
- `TradeServiceOptions` har `poolJson` i konstruktorn
- Raydium-typer stubbas via `tsconfig.paths`
- `resolveJsonModule` används i Jest + typfil

## 7. NYCKELFILERS PRIORITET

1. `src/ts/index.ts` – orchestratorn
2. `services/tradeService.ts` – swap-logik
3. `tsconfig.json`, typer i `src/types/`
4. `tests/integration/orchestrator.test.ts` – stub-E2E
5. `tests/integration/tradeService.devnet.test.ts`
6. `.env.example` – miljövariabler

## 8. MODULÖVERSIKT & ANSVAR

Modulnamn | Fil | Ansvar
----------|-----|-------
**StreamListener** | `services/streamListener.ts` | Tar emot Geyser-events, triggar `onNewPool`
**safetyService** | `services/safetyService.ts` (NY) | Rug-checks, metadata, blacklist
**tradePlanner** | `services/tradePlanner.ts` (NY) | Dev-trigger, latency, pre-swap
**TradeService** | `services/tradeService.ts` | Skapar & skickar swaps
**RiskManager** | `services/riskManager.ts` | Stop-loss, riskcap, TP
**MLService** | `services/mlService.ts` | Scoring via LightGBM
**FeatureService** | `services/featureService.ts` | Feature extraction via Python
**BundleSender** | `services/bundleSender.ts` | Jito bundle stub
**orchestrator** | `src/ts/index.ts` | Huvudflöde

## 9. PÅBÖRJADE HALVFÄRDIGA KODAVSNITT

- `rawEvent = {}` i `index.ts` – ska ersättas med Geyser-parser
- `RiskManager.recordPrices(0,0)` är placeholder
- `BundleSender` ännu ej inkopplad i mainloop

## 10. LESSONS LEARNED

- Fallbacka `JSON.parse` vid .env-fel
- Stub-läge måste initieras tidigt
- `typeRoots`, `paths` m.m. krävs för TS-stubs
- `--detectOpenHandles`/`--forceExit` i Jest

## 11. ROADMAP

1. ✅ Feature/ML subprocess
2. 🔄 Aktivera riktig `rawEvent` via Geyser
3. ⏳ Jito Bundle integration
4. ⏳ CI med airdrop & Devnet
5. ⏳ Express health-check + metrics
6. ⏳ Docker-miljö
7. ⏳ ML retrain-script (var 10:e dag)

## 12. ARBETSFLÖDE

- All projektstatus sparas i `handover.md`
- Ny session:  
  > “Läs in `docs/handover.md` och `docs/sniper_playbook.md`”

## 13. SENASTE AKTIVITET

- ✅ Punkt 1 klar: Feature/ML subprocess
- 🕒 Startpunkt: Geyser `rawEvent`

---

*Denna handover är alltid aktuell och ska hållas uppdaterad efter varje steg.*
