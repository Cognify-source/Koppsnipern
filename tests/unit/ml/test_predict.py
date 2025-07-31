# tests/unit/ml/test_predict.py

import subprocess
import json
import sys
import os
from pathlib import Path
import pytest

@pytest.fixture
def project_root():
    # __file__ ligger i tests/unit/ml/test_predict.py
    return Path(__file__).resolve().parents[3]

@pytest.fixture
def predict_cmd(project_root):
    # Använd modul-läge så att Python laddar src/ som paket
    return [sys.executable, "-m", "src.ml.predict"], str(project_root)

def test_predict_via_stdin(predict_cmd):
    cmd, cwd = predict_cmd
    features = {
        "lp_size": 50.0,
        "initial_burn": 1.0,
        "mint_authority_burned": 0,
        "time_since_init": 0.5,
        "early_buy_count": 1,
        "early_sell_count": 0,
        "early_buy_sell_ratio": 1.0
    }
    proc = subprocess.run(
        cmd,
        input=json.dumps(features),
        text=True,
        capture_output=True,
        cwd=cwd
    )
    assert proc.returncode == 0, proc.stderr
    score = float(proc.stdout)
    assert 0.0 <= score <= 1.0

def test_predict_via_file(tmp_path, predict_cmd):
    cmd, cwd = predict_cmd
    features = {
        "lp_size": 75.0,
        "initial_burn": 2.0,
        "mint_authority_burned": 1,
        "time_since_init": 2.0,
        "early_buy_count": 0,
        "early_sell_count": 1,
        "early_buy_sell_ratio": 0.0
    }
    f = tmp_path / "f.json"
    f.write_text(json.dumps(features))
    proc = subprocess.run(
        cmd + [str(f)],
        text=True,
        capture_output=True,
        cwd=cwd
    )
    assert proc.returncode == 0, proc.stderr
    score = float(proc.stdout)
    assert 0.0 <= score <= 1.0
