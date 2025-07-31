# src/ml/predict.py

import sys
import json
from src.ml.ml_model import predict_model

def main():
    """
    Läser JSON-features från stdin eller från fil (argv[1]),
    anropar predict_model och skriver ut score.
    """
    # Läs input
    if len(sys.argv) > 1:
        with open(sys.argv[1], "r") as f:
            features = json.load(f)
    else:
        features = json.load(sys.stdin)

    # Stub: inga riktiga modeller ännu
    model = None
    score = predict_model(model, features)

    # Skriv bara ut siffran
    sys.stdout.write(str(score))

if __name__ == "__main__":
    main()
