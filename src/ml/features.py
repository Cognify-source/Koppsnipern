# src/ml/features.py

def extract_features(event: dict, early_window: float = 5.0) -> dict:
    """
    Tar emot ett dict med rådata från pool-init:

      {
        "initial_lp": float,
        "burned_amount": float,
        "mint_authority_burned": bool,
        "init_timestamp": float,
        "extract_timestamp": float,  # valfritt
        "actions": [
          {"type": "buy", "timestamp": float},
          {"type": "sell", "timestamp": float},
          ...
        ]
      }

    Returnerar ett dict med:
      lp_size, initial_burn, mint_authority_burned,
      time_since_init, early_buy_count,
      early_sell_count, early_buy_sell_ratio
    """
    features = {}
    # 1) lp_size
    features["lp_size"] = event["initial_lp"]
    # 2) initial_burn
    features["initial_burn"] = event["burned_amount"]
    # 3) mint_authority_burned
    features["mint_authority_burned"] = int(event["mint_authority_burned"])
    # 4) time_since_init
    now = event.get("extract_timestamp", event["init_timestamp"])
    features["time_since_init"] = now - event["init_timestamp"]
    # 5+6) early counts
    buys = sum(
        1
        for a in event["actions"]
        if a["type"] == "buy" and (a["timestamp"] - event["init_timestamp"]) <= early_window
    )
    sells = sum(
        1
        for a in event["actions"]
        if a["type"] == "sell" and (a["timestamp"] - event["init_timestamp"]) <= early_window
    )
    features["early_buy_count"] = buys
    features["early_sell_count"] = sells
    # 7) ratio
    total = buys + sells
    features["early_buy_sell_ratio"] = buys / total if total > 0 else 0.0

    return features
