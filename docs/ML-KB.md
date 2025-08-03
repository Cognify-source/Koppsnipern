# ML-KB – Modelllogik och retrain-policy

Denna fil dokumenterar hur `mlService.ts` arbetar med scoringen för nya pooler.

---

## 📥 Inputfeatures

Modellen tar emot följande features från `featureService.ts`:

- `deployer_tx_count` – antal transaktioner deployern har gjort
- `has_metadata` – bool (0/1)
- `liquidity_sol` – SOL i poolen
- `pool_age_seconds` – tid sedan skapande
- `tx_per_minute` – senaste 60 sek

---

## 📤 Output

- `score: number` mellan `0.0` (helt säker) och `1.0` (hög risk)
- Modell: LightGBM, binär klassificering
- Score används för logg, inte köpbeslut

---

## 🔁 Retrain-policy

- Retrain var 10:e dag via cron eller CLI (`scripts/retrain.py`)
- Träningsdata loggas till `ml/logs/`
- Senaste modellen sparas i `ml/models/latest.pkl`
- Modell laddas in vid init av `mlService.ts`

---

## 🧠 TODO (senare)

- Lägg till viktning mellan features
- Skilj på “no metadata” och “default metadata”
- Logga prediktioner till `ml/predictions.jsonl` för analys

---

*Denna fil uppdateras när modellens struktur, inputs eller retrain-flöde ändras.*
