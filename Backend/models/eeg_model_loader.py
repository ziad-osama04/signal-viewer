import tensorflow as tf
import joblib
import numpy as np
import os

# ── Resolve the Backend root, then models/ subdirectory ──────────────────────
_THIS_DIR = os.path.dirname(os.path.abspath(__file__))

def _find_backend_root(start: str) -> str:
    """Walk up the directory tree until we find a folder containing 'models/'."""
    current = start
    for _ in range(6):
        if os.path.isdir(os.path.join(current, "models")):
            return current
        parent = os.path.dirname(current)
        if parent == current:
            break
        current = parent
    return _THIS_DIR   # fallback

BACKEND_ROOT = _find_backend_root(_THIS_DIR)
MODELS_DIR   = os.path.join(BACKEND_ROOT, "models")


class EEGModelLoader:
    _instance = None

    def __new__(cls):
        if cls._instance is None:
            cls._instance = super().__new__(cls)
            cls._instance.cnn_model   = None
            cls._instance.svm_model   = None
            cls._instance.train_mean  = None
            cls._instance.train_std   = None
            cls._instance.load_resources()
        return cls._instance

    def load_resources(self):
        print(f"🔍 EEG model search path: {MODELS_DIR}")

        # ── 1. CNN (Keras) ────────────────────────────────────────────────────
        cnn_path = os.path.join(MODELS_DIR, "eeg_model.keras")
        if os.path.exists(cnn_path):
            try:
                self.cnn_model = tf.keras.models.load_model(cnn_path)
                print(f"✅ EEG CNN loaded  ← {cnn_path}")
            except Exception as e:
                print(f"❌ Failed to load EEG CNN: {e}")
        else:
            print(f"⚠️  Not found: {cnn_path}")

        # ── 2. SVM (Pickle) ───────────────────────────────────────────────────
        svm_path = os.path.join(MODELS_DIR, "eeg_svm_model.pkl")
        if os.path.exists(svm_path):
            try:
                self.svm_model = joblib.load(svm_path)
                print(f"✅ EEG SVM loaded  ← {svm_path}")
            except Exception as e:
                print(f"❌ Failed to load EEG SVM: {e}")
        else:
            print(f"⚠️  Not found: {svm_path}")

        # ── 3. Normalization stats (required for CNN) ─────────────────────────
        mean_path = os.path.join(MODELS_DIR, "train_mean.npy")
        std_path  = os.path.join(MODELS_DIR, "train_std.npy")

        if os.path.exists(mean_path) and os.path.exists(std_path):
            try:
                self.train_mean = np.load(mean_path)
                self.train_std  = np.load(std_path)
                print(f"✅ EEG norm stats loaded  ← {MODELS_DIR}")
            except Exception as e:
                print(f"❌ Failed to load EEG norm stats: {e}")
        else:
            print(f"⚠️  Missing train_mean.npy / train_std.npy in {MODELS_DIR}")