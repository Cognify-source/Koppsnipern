import json
import csv

INPUT_FILE = "raydium_launchlab.json"
OUTPUT_FILE = "launchlab_pools.csv"

FIELDS = [
    "name", "lpMint", "baseMint", "quoteMint", "baseDecimals", "quoteDecimals",
    "liquidity", "volume24h", "createdAt", "creator", "official"
]

with open(INPUT_FILE, "r") as f:
    data = json.load(f)

launchlab_pools = []
for pool in data.values():
    if not isinstance(pool, dict):
        continue  # Skippa om inte pool-objekt
    name = pool.get("name", "").lower()
    official = pool.get("official", "").lower()
    if "launchlab" in name or "launchlab" in official:
        pool_row = {field: pool.get(field, "") for field in FIELDS}
        launchlab_pools.append(pool_row)

print(f"Totalt LaunchLab-pooler: {len(launchlab_pools)}")

with open(OUTPUT_FILE, "w", newline="", encoding="utf-8") as csvfile:
    writer = csv.DictWriter(csvfile, fieldnames=FIELDS)
    writer.writeheader()
    for row in launchlab_pools:
        writer.writerow(row)

print(f"Klart! Sparade {len(launchlab_pools)} rader till '{OUTPUT_FILE}'")
