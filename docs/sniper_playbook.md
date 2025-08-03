# Sniper-Playbook v2.8 (Uppdaterad 2025-08-03)

## A · Trade-size & slippage (Cupsyy-anpassad)

| WSOL-likviditet | Trade-size (SOL) | Slippage | Priority-fee (µlamports) |
|-----------------|------------------|----------|--------------------------|
| ≥ 20 SOL        | 2–3              | ≤ 3%     | 12 000–20 000            |

**Regel:**  
Pooler med mindre än 20 SOL i WSOL-LP ignoreras. Trade-size är alltid 2–3 SOL.  
Slippage vid exekvering är ≤ 3 %, men vid filtrering kan upp till 8 % tillåtas (för att kunna preppa innan exekvering).

---

## B · Priority-fee autotuning

- Start: 12 000–15 000
- +2 000 om `slot_lag > 1` tre gånger i rad
- –1 000 om `slot_lag_p90 == 0` och fee > 3 % av vinsten
- Begränsning: 8 000 – 35 000

---

## C · Filtrering & triggers (Cupsyy-mode)

### 1. Pool-filter (innan latency, slippage, ML):
- WSOL-LP ≥ 20 SOL
- Slippage-estimat < 8 %
- Creator fee ≤ 5 %
- Metadata + ikon måste finnas
- Mint/freeze måste vara revoked
- Owner balance < 5 %
- Deployern måste ha historik
- Deployern ej blacklistad
- **Rug-check:**  
  - `is_safe == true` och `rug_score ≥ 70`
- Rug-check sker parallellt med metadata och feature extraction
- Timeout: 500 ms → om ingen respons → pool ignoreras
- Inget “best effort” – osäkra eller ofullständiga pooler blockeras direkt

### 2. Dev-trigger (måste uppfyllas):
- Dev-köp ≥ 1 SOL inom 10 sek från pool creation
- Dev-wallet ≥ 72h gammal, ≥ 5 buys över 0.5 SOL
- Wallet ej ny, ej anonym
- Samma deployer-wallet använt i fler än 1 projekt

### 3. Förbered trade (innan Cupsyy):
- Estimera slippage, latency
- Kör feature extraction
- Risk-score via ML
- Skapa swap-transaktion (utan att skicka)

### 4. Cupsyy-signal:
- Cupsyy (wallet: `suqh5sHtr8HyJ7q8scBimULPkPpA557prMG47xCHQfK`) köper in
- Vi skickar vår trade direkt

---

## D · Exit- & riskregler

- **Stop-loss (SL):**  
  −4 % eller 45 sek hålltid (gäller om ROI < +20 %)

- **Trailing TP (safe):**
  - Aktiveras vid +12 %
  - Initial SL sätts på +7 %
  - SL följer toppen med –3 %

  Exempel:
  - Vid +25 % → SL = +22 %
  - Vid +60 % → SL = +57 %

- **Risk cap:**
  - Max 50 SOL risk per dag (per orchestrator)
  - Återställs 00:00 UTC

- **Position control:**
  - Max 2 öppna trades per wallet
  - Undvik att gå in i samma pool från flera bots

---

## E · Exekveringssekvens (optimerad för säkerhet & timing)

```text
[Ny pool upptäckt via Geyser WS]
 → Kontroll: WSOL ≥ 20 SOL, creator fee ≤ 5 %
 → Metadata, ikon, mint/freeze, owner bal?
 → Rug-check (is_safe & rug_score ≥ 70)?
 → Deployer-historik & ej blacklistad?
 → Dev-trigger (≥ 1 SOL inom 10 sek, wallet-valid)?
     → JA:
        → Kör feature-extraktion, latency-mätning, slippage-estimat
        → Skapa förberedd swap (ej skickad)
        → Vänta på att Cupsyy köper
 → Cupsyy köper?
     → JA → Skicka swap direkt
```

---

## F · Mönster (Cupsyy-liknande)

- Köper inom sekunder efter dev
- Håller 5–25 sek
- Tar vinst vid +30–75 %
- Ignorerar volym (vi är först)
- Undviker deployers med ≥ 3 wallets på <24h
- Accepterar viss rug-risk om andra signaler är starka

---

## G · Teknisk edge

- gRPC-nod (10 ms latency)
- Asynkron analys
- Pre-buildade swap-transaktioner
- Rug-check + metadata cache
- Dynamisk slippage fallback
- Multi-bot stöd
- AI/ML-anomali-filter
- Metrics-stöd och health-check redo

---

*Denna playbook är strikt och måste följas vid all kod, test och exekveringslogik.*
