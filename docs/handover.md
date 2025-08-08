# Koppsnipern – Handover Playbook

## 1. ÖVERGRIPANDE STATUS

- **Kodbas**: Typescript-projekt under `src/ts`, med Jest-tester under `tests/unit/ts` + `tests/integration`.
- **Bygg & Test**:
  - `npm run build` kompilerar allt till `dist/`
  - `npm run test:unit` kör alla unit-tester
  - `npm run test:integration` kör stub-E2E + Devnet om nyckel finns
- **Miljö**: `.env` laddas via `dotenv.config()` i `index.ts`
- **CI**: Planeras med build → unit → integration (skippa Devnet om `PAYER_SECRET_KEY` saknas)

## 2. KLARA HUVUDFUNKTIONER

- **Orchestrator** (`src/ts/index.ts`): stub-loop vs WS/Geyser-flöde
- **StreamListener**: testad Devnet-WS
- **Latency-mätning**: `utils/latency.ts`
- **TradeService**: bygger Raydium-swap, unit-testad
- **RiskManager**: PnL, latency, risk, unit-testad
- **BundleSender**: Jito API stub (testad)

## 3. PÅBÖRJADE MEN EJ FÄRDIGA DELAR

- Devnet-test (`tradeService.devnet.test.ts`) kräver `.env`
- BundleSender ej kopplad till pipeline
- SafetyService påbörjad men ej komplett
- Metrics/monitoring saknas

## 4. KÄNDA BUGGAR & BLOCKERARE

- JSON-parse-krascher vid ogiltiga `.env`
- `orchestratorTrade.test.ts` uppdaterad (enklare inputs)

## 5. AKTIVA TODOs

- [ ] IMPLEMENTERA: `services/safetyService.ts` – rugcheck, metadata, blacklists
- [ ] IMPLEMENTERA: `services/tradePlanner.ts` – Cupsyy-trigger, latency, pre-swap
- [ ] KOPPLA IN: `services/bundleSender.ts` till orchestratorn
- [ ] LÄGG TILL: Express endpoint `/health`, `/metrics`
- [ ] BACKTEST: filtreringsstrategi mot historiska Cupsyy-pooler

## 6. DESIGNBESLUT

- Regelbaserad filtrering + Cupsyy-trigger är kärnstrategin
- All prestandakritisk kod ska vara i Node-processen

## 7. NYCKELFILERS PRIORITET

1. `src/ts/index.ts` – orchestratorn
2. `services/streamListener.ts` – upptäckt av nya pooler
3. `services/safetyService.ts` – statiska rug checks
4. `services/tradePlanner.ts` – trigger och transaktionsförberedelse
5. `services/tradeService.ts` – swap-logik
6. `services/bundleSender.ts` – Jito-integration

## 8. MODULÖVERSIKT & ANSVAR

Modulnamn | Fil | Ansvar
----------|-----|-------
**StreamListener** | `services/streamListener.ts` | Tar emot Geyser-events, triggar `onNewPool`
**SafetyService** | `services/safetyService.ts` | Kör rug-checks (renounced, mint/freeze revoked, LP-range)
**TradePlanner** | `services/tradePlanner.ts` | Lyssnar på Cupsyy-signal, latency, pre-swap
**TradeService** | `services/tradeService.ts` | Skapar & skickar swaps
**RiskManager** | `services/riskManager.ts` | Stop-loss, riskcap, TP
**BundleSender** | `services/bundleSender.ts` | Jito bundle integration
**Orchestrator** | `src/ts/index.ts` | Huvudflöde

## 9. ROADMAP

1. Implementera SafetyService
2. Implementera TradePlanner med Cupsyy-trigger
3. Koppla in BundleSender
4. CI med integrationstester på Devnet
5. Health-check + metrics
6. Backtest mot historiska data

## 10. SENASTE AKTIVITET

- Säkerställt att huvudstrategin är optimerad för hastighet och enkelhet med regelbaserad filtrering + Cupsyy-trigger.
