# Rensar Raydium-loggar på irrelevanta fält för vidare analys
# Används manuellt vid logggranskning

from datetime import datetime, timedelta
import json, csv

# ---- Anpassa här ----
INPUT_FILE = "raydium_launchlab.json"
OUTPUT_FILE = "launchlab_recent.csv"
DAYS = 30  # Ändra till 60 om du vill ha 60 dagar

FIELDS = [
    "name", "lpMint", "baseMint", "quoteMint", "liquidity", "createdAt", "creator"
]

# ---- Ladda data ----
with open(INPUT_FILE, "r") as f:
    data = json.load(f)

recent_pools = []
cutoff = datetime.utcnow() - timedelta(days=DAYS)
for pool in data.values():
    if not isinstance(pool, dict):
        continue
    created_at = pool.get("createdAt", "")
    try:
        dt = datetime.strptime(created_at, "%Y-%m-%dT%H:%M:%S.%fZ")
    except:
        continue
    if dt >= cutoff:
        pool_row = {k: pool.get(k, "") for k in FIELDS}
        recent_pools.append(pool_row)

# ---- Spara till CSV ----
if recent_pools:
    with open(OUTPUT_FILE, "w", newline="", encoding="utf-8") as csvfile:
        writer = csv.DictWriter(csvfile, fieldnames=FIELDS)
        writer.writeheader()
        writer.writerows(recent_pools)

    print(f"Sparade {len(recent_pools)} pooler från senaste {DAYS} dagar till '{OUTPUT_FILE}'")
else:
    print(f"Inga pools hittades de senaste {DAYS} dagarna.")
