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

# Ensure keras_ecg_model is importable
sys.path.append(BACKEND_ROOT)
sys.path.append(_THIS_DIR)

from keras_ecg_model import get_model


class ECGModelLoader:
    _instance = None

    def __new__(cls):
        if cls._instance is None:
            cls._instance = super().__new__(cls)
            cls._instance.deep_model    = None
            cls._instance.classic_model = None
            cls._instance.load_models()
        return cls._instance

    def load_models(self):
        print(f"🔍 ECG model search path: {MODELS_DIR}")

        # ── 1. Keras deep-learning model ────────────────────────────────────
        h5_path = os.path.join(MODELS_DIR, "keras_ecg_model.hdf5")
        if os.path.exists(h5_path):
            try:
                self.deep_model = get_model(n_classes=6, last_layer='sigmoid')
                self.deep_model.load_weights(h5_path)
                print(f"✅ ECG deep model loaded  ← {h5_path}")
            except Exception as e:
                print(f"❌ Failed to load ECG deep model: {e}")
        else:
            print(f"⚠️  Not found: {h5_path}")

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