# tests/conftest.py

import sys
import os
from pathlib import Path

# Hitta projektroten (en nivå upp från tests/)
ROOT = Path(__file__).resolve().parent.parent
# Lägg in projektroten i början av sys.path
sys.path.insert(0, str(ROOT))
