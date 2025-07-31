# src/ml/extract.py

import sys
import json
from src.ml.features import extract_features

def main():
    """
    Läser JSON från stdin med rådata för pool-init,
    anropar extract_features och skriver ut JSON på stdout.
    """
    event = json.load(sys.stdin)
    features = extract_features(event)
    # Skriv ut som JSON
    json.dump(features, sys.stdout)

if __name__ == "__main__":
    main()
