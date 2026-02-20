"""
EEG Analysis Service
====================
Pipeline (matches eeg_predictor.py exactly):
  load .npy / .csv  →  reshape  →  fix channels  →  sliding window
  →  normalize (per-channel global stats from input)
  →  CNN predict  +  SVM predict (statistical features)
  →  soft-vote across windows  →  verdict  →  return JSON + signals

Classes : ['ADFSU', 'Depression', 'REEG-PD', 'BrainLat']
Models  : eeg_model_final.keras  +  eeg_svm_model.pkl
"""

import numpy as np
import os
import traceback
from scipy.stats import skew, kurtosis as sp_kurtosis

# ── Constants ─────────────────────────────────────────────────────────────────
WINDOW_SIZE = 992
STEP_SIZE   = 496
N_CHANNELS  = 19
CLASS_NAMES = ['ADFSU', 'Depression', 'REEG-PD', 'BrainLat']

# ── Resolve models directory ──────────────────────────────────────────────────
_THIS_DIR = os.path.dirname(os.path.abspath(__file__))

def _find_backend_root(start: str) -> str:
    current = start
    for _ in range(6):
        if os.path.isdir(os.path.join(current, "models")):
            return current
        parent = os.path.dirname(current)
        if parent == current:
            break
        current = parent
    return _THIS_DIR

MODELS_DIR = os.path.join(_find_backend_root(_THIS_DIR), "models")

# ── Lazy singleton loader ─────────────────────────────────────────────────────
_cnn_model     = None
_svm_model     = None
_models_loaded = False

def _load_models():
    global _cnn_model, _svm_model, _models_loaded, WINDOW_SIZE, STEP_SIZE, N_CHANNELS
    if _models_loaded:
        return

    import tensorflow as tf
    import joblib

    print(f"🔍 EEG models dir: {MODELS_DIR}")

    # CNN — try both naming conventions
    for cnn_name in ("eeg_model_final.keras", "eeg_model.keras"):
        cnn_path = os.path.join(MODELS_DIR, cnn_name)
        if os.path.exists(cnn_path):
            try:
                _cnn_model = tf.keras.models.load_model(cnn_path)
                print(f"✅ EEG CNN loaded  ← {cnn_path}")

                # Detect actual input shape via dummy forward pass
                # (Keras 3 removed layer.input_shape on some layer types)
                try:
                    import numpy as _np_tmp
                    dummy = _np_tmp.zeros((1, WINDOW_SIZE, N_CHANNELS, 1), dtype='float32')
                    _cnn_model.predict(dummy, verbose=0)
                    print(f"   CNN input shape : (None, {WINDOW_SIZE}, {N_CHANNELS}, 1) ✅ matches")
                except Exception as shape_err:
                    err_msg = str(shape_err)
                    # Parse "expected axis -1 of input shape to have value X, but received ... shape (B, Y)"
                    import re
                    m = re.search(r'expected axis -1 of input shape to have value (\d+)', err_msg)
                    m2 = re.search(r'received input with shape \(\d+, (\d+)\)', err_msg)
                    if m and m2:
                        dense_expected = int(m.group(1))
                        dense_got      = int(m2.group(1))
                        ratio          = dense_expected / dense_got
                        WINDOW_SIZE    = int(WINDOW_SIZE * ratio)
                        STEP_SIZE      = WINDOW_SIZE // 2
                        print(f"⚠️  Shape mismatch detected — auto-correcting WINDOW_SIZE to {WINDOW_SIZE}")
                    else:
                        print(f"⚠️  Could not auto-detect window size: {shape_err}")

            except Exception as e:
                print(f"❌ EEG CNN failed: {e}")
            break
    else:
        print(f"⚠️  No CNN model found in {MODELS_DIR}")

    # SVM — try both naming conventions
    for svm_name in ("svm_model.pkl", "eeg_svm_model.pkl"):
        svm_path = os.path.join(MODELS_DIR, svm_name)
        if os.path.exists(svm_path):
            try:
                _svm_model = joblib.load(svm_path)
                print(f"✅ EEG SVM loaded  ← {svm_path}")
            except Exception as e:
                print(f"❌ EEG SVM failed: {e}")
            break
    else:
        print(f"⚠️  No SVM model found in {MODELS_DIR}")

    _models_loaded = True


# ── Step 1: Load & reshape ────────────────────────────────────────────────────
def _load_signal(file_path: str) -> np.ndarray:
    """Returns (T, N_CHANNELS) float32."""
    ext = os.path.splitext(file_path)[1].lower()

    if ext == ".npy":
        raw = np.load(file_path).astype(np.float32)
        print(f"📄 .npy raw shape: {raw.shape}")
        if raw.ndim == 3:
            raw = raw.reshape(-1, raw.shape[-1])   # (N,T,C) → (N*T, C)
        if raw.ndim == 2 and raw.shape[0] == N_CHANNELS and raw.shape[1] != N_CHANNELS:
            raw = raw.T                             # (C, T) → (T, C)
        if raw.ndim == 1:
            raw = raw.reshape(-1, 1)
        print(f"   Usable shape: {raw.shape}")
        return raw

    elif ext == ".csv":
        import csv
        rows = []
        with open(file_path, newline="") as f:
            for row in csv.reader(f):
                try:
                    rows.append([float(v) for v in row])
                except ValueError:
                    continue   # skip header
        raw = np.array(rows, dtype=np.float32)
        print(f"📄 .csv shape: {raw.shape}")
        if raw.ndim == 2 and raw.shape[1] != N_CHANNELS:
            if raw.shape[0] == N_CHANNELS:
                raw = raw.T
            else:
                raise ValueError(
                    f"Expected {N_CHANNELS} channels, got {raw.shape[1]} columns."
                )
        return raw

    else:
        raise ValueError(f"Unsupported file type: {ext}. Use .npy or .csv")


# ── Step 2: Fix channels (pad or trim to N_CHANNELS) ─────────────────────────
def _fix_channels(signal: np.ndarray) -> np.ndarray:
    n = signal.shape[1] if signal.ndim == 2 else 1
    if n == N_CHANNELS:
        return signal
    if n > N_CHANNELS:
        print(f"⚠️  Trimming channels {n} → {N_CHANNELS}")
        return signal[:, :N_CHANNELS]
    print(f"⚠️  Padding channels {n} → {N_CHANNELS}")
    pad = np.zeros((signal.shape[0], N_CHANNELS - n), dtype=np.float32)
    return np.hstack([signal, pad])


# ── Step 3: Sliding window ────────────────────────────────────────────────────
def _make_windows(data: np.ndarray) -> np.ndarray:
    """Returns (N_windows, WINDOW_SIZE, N_CHANNELS)"""
    windows = []
    T = len(data)
    if T < WINDOW_SIZE:
        pad  = np.zeros((WINDOW_SIZE - T, data.shape[1]), dtype=np.float32)
        data = np.concatenate([data, pad], axis=0)
        windows.append(data[:WINDOW_SIZE])
    else:
        for start in range(0, T - WINDOW_SIZE + 1, STEP_SIZE):
            windows.append(data[start: start + WINDOW_SIZE])
    result = np.stack(windows).astype(np.float32)
    print(f"   Windows: {len(result)}  (size={WINDOW_SIZE}, step={STEP_SIZE})")
    return result


# ── Step 4: Normalize ─────────────────────────────────────────────────────────
def _normalize(windows: np.ndarray) -> np.ndarray:
    """
    Per-channel global normalization across all windows and time steps.
    shape: (N, T, C) → mean/std over axes (0,1) → (1, 1, C)
    Matches what train_mean/train_std encode.
    Falls back gracefully if saved stats exist in models dir.
    """
    mean_path = os.path.join(MODELS_DIR, "train_mean.npy")
    std_path  = os.path.join(MODELS_DIR, "train_std.npy")

    if os.path.exists(mean_path) and os.path.exists(std_path):
        try:
            m = np.load(mean_path)
            s = np.load(std_path)
            print("✅ Using saved train_mean / train_std")
            return (windows - m) / (s + 1e-8)
        except Exception as e:
            print(f"⚠️  Could not load saved stats ({e}), computing from data")

    # Compute per-channel stats from this file (axis 0=windows, 1=time → keeps C)
    m = windows.mean(axis=(0, 1), keepdims=True)          # (1, 1, C)
    s = windows.std(axis=(0, 1), keepdims=True)           # (1, 1, C)
    s = np.where(s < 1e-8, 1e-8, s)
    print("ℹ️  Norm stats computed from input file (per-channel global)")
    return (windows - m) / s


# ── Step 5: SVM feature extraction ───────────────────────────────────────────
def _extract_features(X: np.ndarray) -> np.ndarray:
    """
    (N, T, C) → (N, C * N_FEATS)
    Tries 4 features/channel first (mean, std, min, max) — matches SVM trained
    with 76 features (19 ch × 4).  Falls back to 8 features if SVM expects 152.
    The correct count is auto-selected to match _svm_model at call time.
    """
    N, T, C = X.shape

    # Detect how many features per channel the SVM was trained on
    try:
        expected_total = _svm_model.n_features_in_
    except AttributeError:
        # Older sklearn — inspect the scaler inside the pipeline if available
        try:
            expected_total = _svm_model.named_steps['scaler'].n_features_in_
        except Exception:
            expected_total = C * 4   # safe default

    n_feats = expected_total // C    # features per channel

    feats = np.zeros((N, C * n_feats), dtype=np.float32)
    for i in range(N):
        col = 0
        for c in range(C):
            ch = X[i, :, c]
            # Always compute all 8 — then slice to n_feats
            all8 = [
                float(np.mean(ch)),
                float(np.std(ch)),
                float(np.min(ch)),
                float(np.max(ch)),
                float(np.ptp(ch)),
                float(skew(ch)),
                float(sp_kurtosis(ch)),
                float(np.sqrt(np.mean(ch ** 2))),
            ]
            feats[i, col:col+n_feats] = all8[:n_feats]
            col += n_feats
    return feats


# ── Step 6: CNN inference ─────────────────────────────────────────────────────
def _infer_cnn(windows_norm: np.ndarray) -> dict:
    X_cnn         = np.expand_dims(windows_norm, -1)      # (N, T, C, 1)
    probs_all     = _cnn_model.predict(X_cnn, verbose=0)  # (N, n_classes)
    probs_mean    = probs_all.mean(axis=0)
    pred_idx      = int(np.argmax(probs_mean))
    window_votes  = np.argmax(probs_all, axis=1).tolist()
    agreement     = float((np.array(window_votes) == pred_idx).mean())

    return {
        'prediction':       CLASS_NAMES[pred_idx],
        'class_index':      pred_idx,
        'confidence':       float(probs_mean[pred_idx]),
        'probabilities':    {cls: float(p) for cls, p in zip(CLASS_NAMES, probs_mean)},
        'window_votes':     window_votes,
        'window_agreement': agreement,
        'model':            'CNN (Deep Learning)',
        # Legacy keys kept for frontend compatibility
        'class':            pred_idx,
        'name':             CLASS_NAMES[pred_idx],
        'probs':            {cls: float(p) for cls, p in zip(CLASS_NAMES, probs_mean)},
        'window_agree':     agreement,
        'n_windows':        len(windows_norm),
    }


# ── Step 7: SVM inference ─────────────────────────────────────────────────────
def _infer_svm(windows_norm: np.ndarray) -> dict:
    X_svm        = _extract_features(windows_norm)
    probs_all    = _svm_model.predict_proba(X_svm)         # (N, n_classes)
    probs_mean   = probs_all.mean(axis=0)
    pred_idx     = int(np.argmax(probs_mean))
    window_votes = np.argmax(probs_all, axis=1).tolist()
    agreement    = float((np.array(window_votes) == pred_idx).mean())

    return {
        'prediction':       CLASS_NAMES[pred_idx],
        'class_index':      pred_idx,
        'confidence':       float(probs_mean[pred_idx]),
        'probabilities':    {cls: float(p) for cls, p in zip(CLASS_NAMES, probs_mean)},
        'window_votes':     window_votes,
        'window_agreement': agreement,
        'model':            'SVM (Classical ML)',
        # Legacy keys
        'class':            pred_idx,
        'name':             CLASS_NAMES[pred_idx],
        'probs':            {cls: float(p) for cls, p in zip(CLASS_NAMES, probs_mean)},
    }


# ── Step 8: Verdict ───────────────────────────────────────────────────────────
def _verdict(cnn: dict, svm: dict) -> dict:
    agree = cnn['class_index'] == svm['class_index']
    if agree:
        winner_idx  = cnn['class_index']
        winner_conf = max(cnn['confidence'], svm['confidence'])
        tiebreak    = None
    else:
        if cnn['confidence'] >= svm['confidence']:
            winner_idx, winner_conf, tiebreak = cnn['class_index'], cnn['confidence'], 'CNN'
        else:
            winner_idx, winner_conf, tiebreak = svm['class_index'], svm['confidence'], 'SVM'

    return {
        'agree':       agree,
        'prediction':  CLASS_NAMES[winner_idx],
        'class_index': winner_idx,
        'confidence':  winner_conf,
        'tiebreak':    tiebreak,
    }


# ── Public entry point ────────────────────────────────────────────────────────
def analyze_eeg_signal(file_path: str) -> dict:
    """
    Full EEG pipeline. Returns:
    {
        analysis: { cnn: {...}, svm: {...}, verdict: {...} },
        signals:  { 'EEG_CH1': [...], ..., 'EEG_CH19': [...] },
        time:     [0, 1, 2, ...]
    }
    """
    try:
        _load_models()

        # 1. Load & reshape
        data = _load_signal(file_path)          # (T, C)

        # 2. Fix channels
        data = _fix_channels(data)              # (T, N_CHANNELS)
        T    = data.shape[0]

        # 3. Sliding windows
        windows = _make_windows(data)           # (N, WINDOW_SIZE, N_CHANNELS)

        # 4. Normalize
        windows_norm = _normalize(windows)

        # 5. Infer
        cnn_result = _infer_cnn(windows_norm) if _cnn_model is not None \
                     else {'error': 'CNN model not loaded'}
        svm_result = _infer_svm(windows_norm) if _svm_model is not None \
                     else {'error': 'SVM model not loaded'}

        # 6. Verdict (only if both models loaded)
        verdict = _verdict(cnn_result, svm_result) \
                  if _cnn_model is not None and _svm_model is not None \
                  else {'error': 'One or more models not loaded'}

        # 7. Build signals dict for viewer
        signals = {f"EEG_CH{i+1}": data[:, i].tolist() for i in range(data.shape[1])}
        time    = list(range(T))

        return {
            "analysis": {
                "cnn":     cnn_result,
                "svm":     svm_result,
                "verdict": verdict,
            },
            "signals": signals,
            "time":    time,
        }

    except Exception as e:
        tb = traceback.format_exc()
        print(f"❌ EEG Service crash:\n{tb}")
        return {
            "error":   "EEG Analysis Failed",
            "details": str(e),
            "trace":   tb.split('\n')[-2],
        }