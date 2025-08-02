# Sniper-Playbook v1.0 (29 jul 2025)

## A · Storlek ↔ WSOL-LP

| WSOL-likviditet | Trade-size (SOL) | Slippage ≈ | Priority-fee (µlamports) |
|-----------------|-----------------|------------|--------------------------|
| 20 – 40 SOL     | 2               | ≤ 4 %      | 12 000 |
| 40 – 60 SOL     | 3               | ≤ 4 %      | 15 000 |
| 60 – 100 SOL    | 5               | 2–3 %      | 20 000 |
| 100 – 150 SOL   | 8               | ≤ 3 %      | 20 000 |
| > 150 SOL       | 10 (max)        | ≤ 4 %      | 25 000 |

## B · Priority-fee auto-trappa

*Startvärde = tabell ovan.  
Autotune: +2 000 µlamports om `slot_lag > 1` tre trades i rad.  
Minska –1 000 µlamports om `slot_lag_p90 == 0` **och** fee > 3 % av nettovinsten.*

## C · Rug-score (måste ≥ 70)

* mintAuthority == null  
* freezeAuthority == null  
* 1 ≤ LPdev ≤ 25 SOL  
* första dev-swap ≤ 2 s efter init  
* tax/burn < 5 %  
* dev-adress ej på svartlista

## D · Riskregler

* Stop-loss = −4 % eller 45 s timeout  
* Trailing-TP: lås +6 % när pris ≥ +12 %  
* Daglig risk-cap = 50 SOL  
* Max två öppna positioner åt gången

## E · KPI:er & autotune-pseudokod
```python
if slot_lag > 1:
    fee += 2_000
elif slot_lag_p90 == 0 and fee_ratio > 0.03:
    fee -= 1_000
fee = min(max(fee, 8_000), 35_000)