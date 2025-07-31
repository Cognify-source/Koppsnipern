# tests/unit/ml/test_train.py

import pytest
from src.ml.train import main

def test_train_main(capfd):
    result = main()
    captured = capfd.readouterr()
    assert result is True
    assert "✅ ML-pipeline OK" in captured.out
