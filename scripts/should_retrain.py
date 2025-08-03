# scripts/should_retrain.py

import os
import json
from datetime import datetime, timedelta

DATA_PATH = "ml/data/snipes.jsonl"
MODEL_PATH = "ml/models/latest.pkl"
MIN_NEW_POINTS = 200

def get_last_retrain_time():
    if not os.path.exists(MODEL_PATH):
        return datetime.min
    return datetime.fromtimestamp(os.path.getmtime(MODEL_PATH))

def count_new_datapoints(since_time):
    count = 0
    if not os.path.exists(DATA_PATH):
        return 0
    with open(DATA_PATH, "r") as f:
        for line in f:
            try:
                record = json.loads(line)
                ts = datetime.fromisoformat(record["timestamp"].replace("Z", "+00:00"))
                if ts > since_time:
                    count += 1
            except Exception:
                continue
    return count

if __name__ == "__main__":
    last_retrain = get_last_retrain_time()
    new_points = count_new_datapoints(last_retrain)

    if new_points >= MIN_NEW_POINTS:
        print("✅ Retrain recommended:", new_points, "new points since", last_retrain.isoformat())
        exit(0)
    else:
        print("ℹ️ Skipping retrain – only", new_points, "new points since", last_retrain.isoformat())
        exit(1)
