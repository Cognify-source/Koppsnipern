# src/ml/ml_model.py

"""
Stub för LightGBM-modellen.
"""

def train_model(training_data: list[dict], labels: list[float]) -> object:
    """
    Tar emot listor med features och labels, returnerar en "modell".
    Här stubbar vi och returnerar None.
    """
    # TODO: Bygg lgb.Dataset och träna med lightgbm.train(...)
    return None

def predict_model(model: object, features: dict) -> float:
    """
    Tar emot en tränad modell (eller None som stub) och ett features-dict,
    returnerar en score mellan 0.0 och 1.0.
    """
    # TODO: return model.predict([features])[0]
    # Stub: alltid 0.5
    return 0.5
