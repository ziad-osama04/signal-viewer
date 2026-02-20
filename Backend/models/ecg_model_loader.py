import torch
import joblib
import os
import sys

# ── Resolve the Backend root, then models/ subdirectory ──────────────────────
# Works regardless of whether this file sits in Backend/, Backend/services/,
# Backend/routes/, or anywhere else under the Backend tree.
_THIS_FILE = os.path.abspath(__file__)
_THIS_DIR  = os.path.dirname(_THIS_FILE)

def _find_backend_root(start: str) -> str:
    """Walk up the directory tree until we find a folder containing 'models/'."""
    current = start
    for _ in range(6):  # max 6 levels up
        if os.path.isdir(os.path.join(current, "models")):
            return current
        parent = os.path.dirname(current)
        if parent == current:   # reached filesystem root
            break
        current = parent
    # Fallback: assume this file is directly inside Backend/
    return _THIS_DIR

BACKEND_ROOT = _find_backend_root(_THIS_DIR)
MODELS_DIR   = os.path.join(BACKEND_ROOT, "models")

# Ensure model.py (ECGResNet architecture) is importable
sys.path.append(BACKEND_ROOT)
sys.path.append(_THIS_DIR)

from model import ECGResNet


class ECGModelLoader:
    _instance = None

    def __new__(cls):
        if cls._instance is None:
            cls._instance = super().__new__(cls)
            cls._instance.deep_model    = None
            cls._instance.classic_model = None
            cls._instance.device        = torch.device("cuda" if torch.cuda.is_available() else "cpu")
            cls._instance.load_models()
        return cls._instance

    def load_models(self):
        print(f"🔍 ECG model search path: {MODELS_DIR}")

        # ── 1. PyTorch deep-learning model ────────────────────────────────────
        pt_path = os.path.join(MODELS_DIR, "ecg_model.pt")
        if os.path.exists(pt_path):
            try:
                self.deep_model = ECGResNet(n_classes=5)
                checkpoint  = torch.load(pt_path, map_location=self.device)
                state_dict  = checkpoint.get("model_state_dict", checkpoint)
                self.deep_model.load_state_dict(state_dict)
                self.deep_model.to(self.device)
                self.deep_model.eval()
                print(f"✅ ECG deep model loaded  ← {pt_path}")
            except Exception as e:
                print(f"❌ Failed to load ECG deep model: {e}")
        else:
            print(f"⚠️  Not found: {pt_path}")

        # ── 2. Classic ML model (Random Forest) ───────────────────────────────
        pkl_path = os.path.join(MODELS_DIR, "random_forest_model.pkl")
        if os.path.exists(pkl_path):
            try:
                self.classic_model = joblib.load(pkl_path)
                print(f"✅ ECG RF model loaded    ← {pkl_path}")
            except Exception as e:
                print(f"❌ Failed to load ECG RF model: {e}")
        else:
            print(f"⚠️  Not found: {pkl_path}")