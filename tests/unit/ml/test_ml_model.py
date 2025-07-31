# tests/unit/ml/test_ml_model.py

import pytest
from src.ml.ml_model import train_model, predict_model

def test_train_model_stub():
    model = train_model([], [])
    assert model is None

def test_predict_model_bounds():
    dummy_features = {
        "lp_size": 100.0,
        "initial_burn": 5.0,
        "mint_authority_burned": 1,
        "time_since_init": 1.0,
        "early_buy_count": 2,
        "early_sell_count": 1,
        "early_buy_sell_ratio": 2/3
    }
    score = predict_model(None, dummy_features)
    assert isinstance(score, float)
    assert 0.0 <= score <= 1.0
