# tests/unit/py/test_train.py

import pytest
from src.py.train import main

def test_train_main(capfd):
    """
    Kontrollera att train.main() kör utan fel
    och skriver ut rätt meddelande.
    """
    result = main()
    captured = capfd.readouterr()
    
    assert result is True
    assert "✅ ML-pipeline OK" in captured.out
