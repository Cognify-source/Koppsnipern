# Sniper-Playbook v2.4 (Uppdaterad 2025-08-03)

## A · Trade-size & slippage (Cupsyy-anpassad)

| WSOL-likviditet | Trade-size (SOL) | Slippage | Priority-fee (µlamports) |
|-----------------|------------------|----------|--------------------------|
| ≥ 20 SOL        | 2–3              | ≤ 3%     | 12 000–20 000            |

**Regel:**  
Pooler med mindre än 20 SOL i WSOL-LP ignoreras. Trade-size är alltid 2–3 SOL. Ingen skalning uppåt.

---

## B · Priority-fee autotuning

- Start: 12 000–15 000
- +2 000 om `slot_lag > 1` tre gånger i rad
- –1 000 om `slot_lag_p90 == 0` och fee > 3 % av vinsten
- Begränsning: 8 000 – 35 000

---

## C · Filtrering & triggers (Cupsyy-mode)

1. **Pool-filter:**
   - Min 20 SOL WSOL-LP
   - Slippage < 8% (för filtrering)
   - Rug-score ≥ 70
   - Creator fee ≤ 5 %
   - Godkänd metadata + ikon
   - Mint/freeze revoked
   - Owner balance < 5 %
   - Blockera deployers utan historik

2. **Exekvering:**
   - Vänta på att Cupsyy köper (wallet: `suqh5sHtr8HyJ7q8scBimULPkPpA557prMG47xCHQfK`)
   - Skicka direkt när signal triggas
   - Ingen ny analys i kritiskt path

---

## D · Exit- & riskregler

- **Stop-loss:**  
  −4 % eller max 45 sekunders hålltid  
  *(gäller endast om ROI < +20 %)*  
  Om ROI ≥ +20 % → håll vidare enligt trailing TP

- **Konservativ Take-Profit (safe trailing):**
  - Första vinstsäkring aktiveras vid **+12 %**
  - Då sätts en **trailing stop-loss på +7 %**
  - Därefter följer TP toppen med ett avstånd på **−3 %**
  - Exempel:  
    - Vid +25 % → SL på +22 %  
    - Vid +60 % → SL på +57 %  
    - Vid +1000 % → SL på +997 %

- **Övrigt:**
  - Max två öppna positioner
  - Daglig risk-cap: 50 SOL

---

## E · Dev-trigger & volymlogik

- Vi köper bara om deployer/dev köpt före oss
- Volym ignoreras – vi *är* volymen

---

## F · Beteendemönster (härlett från Cupsyy)

- Entry-size: alltid 2–3 SOL (~475 USD)
- Hålltid: 3–25 s, max 45 s
- Sälj: oftast efter +30–75 % ROI
- Aldrig DCA eller skalning
- Max 2 öppna tokens
- Dev måste ha köpt före oss

---

## G · Edge & prestanda

- Snabb gRPC-nod (~10 ms)
- All analys sker asynkront
- Minimal tx-payload
- Dynamisk slippage-tweak
- Deployer-blacklistning
- Rug-checks från community (offline-cache)
- On-chain stress skydd (paus eller mindre size)
- AI/ML anomaly-detection (passiv)
- Multi-bot redo

---

*Denna playbook gäller för all kod och logik i snipern och ska följas strikt.*
