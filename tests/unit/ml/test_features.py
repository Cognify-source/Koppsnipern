# tests/unit/ml/test_features.py

import pytest
from src.ml.features import extract_features

def make_event(buys: int, sells: int, window: float = 5.0):
    init_t = 1_000_000.0
    actions = []
    # köp inom window
    for i in range(buys):
        actions.append({"type": "buy", "timestamp": init_t + (i + 0.5)})
    # sälj efter window
    for i in range(sells):
        actions.append({"type": "sell", "timestamp": init_t + window + 1.0})
    return {
        "initial_lp": 123.45,
        "burned_amount": 10.0,
        "mint_authority_burned": True,
        "init_timestamp": init_t,
        "extract_timestamp": init_t + 2.0,
        "actions": actions
    }

def test_extract_features_basic():
    event = make_event(buys=3, sells=2, window=5.0)
    feats = extract_features(event, early_window=5.0)

    assert pytest.approx(feats["lp_size"]) == 123.45
    assert pytest.approx(feats["initial_burn"]) == 10.0
    assert feats["mint_authority_burned"] == 1
    assert pytest.approx(feats["time_since_init"]) == 2.0

    # 3 buys inom window, 0 sells inom window
    assert feats["early_buy_count"] == 3
    assert feats["early_sell_count"] == 0
    assert pytest.approx(feats["early_buy_sell_ratio"]) == 1.0

def test_extract_features_no_actions():
    event = make_event(buys=0, sells=0, window=5.0)
    feats = extract_features(event, early_window=5.0)
    assert feats["early_buy_count"] == 0
    assert feats["early_sell_count"] == 0
    assert feats["early_buy_sell_ratio"] == 0.0
