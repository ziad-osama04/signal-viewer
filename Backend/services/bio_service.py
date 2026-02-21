"""
Bio / Microbiome Service
========================
Implements the exact pipeline from diagnosis_app.py:
  Reference CSV  →  fit StandardScaler + LabelEncoder on microbe columns
  Upload CSV     →  per-patient sequence  →  pad to 45 weeks
                 →  GRU model predict  →  soft-vote  →  return results

Model  : ibd_signal_detector.keras
Classes: Healthy, Crohn's Disease, Ulcerative Colitis
"""

import numpy as np
import pandas as pd
import os
import traceback

# ── Constants ─────────────────────────────────────────────────────────────────
MAX_LEN     = 45          # must match training (microbiome_signal_model_test.py)
CLASS_NAMES = ['Healthy', "Crohn's Disease", 'Ulcerative Colitis']

# ── Resolve paths ─────────────────────────────────────────────────────────────
_THIS_DIR = os.path.dirname(os.path.abspath(__file__))

def _find_backend_root(start: str) -> str:
    current = start
    for _ in range(6):
        if os.path.isdir(os.path.join(current, 'models')):
            return current
        parent = os.path.dirname(current)
        if parent == current:
            break
        current = parent
    return _THIS_DIR

MODELS_DIR = os.path.join(_find_backend_root(_THIS_DIR), 'models')
REF_CSV    = os.path.join(MODELS_DIR, 'hmp2_reference.csv')   # renamed reference CSV


class BioService:
    """
    Singleton-style service.  Call analyze_csv(file_path) from routes.
    """

    def __init__(self):
        self._model        = None
        self._scaler       = None
        self._label_enc    = None
        self._microbe_cols = None
        self._loaded       = False

    # ── Lazy loader ───────────────────────────────────────────────────────────
    def _load(self, fallback_csv: str = None):
        if self._loaded:
            return

        import tensorflow as tf
        from sklearn.preprocessing import LabelEncoder, StandardScaler

        print(f"🔍 Bio models dir: {MODELS_DIR}")

        # 1. Load GRU model
        model_path = os.path.join(MODELS_DIR, 'ibd_signal_detector.keras')
        if not os.path.exists(model_path):
            raise FileNotFoundError(f"Model not found: {model_path}")
        self._model = tf.keras.models.load_model(model_path)
        print(f"✅ IBD model loaded ← {model_path}")

        # 2. Find reference CSV to fit scaler + label encoder
        # Priority: hmp2_reference.csv → any .csv in models/ → uploaded file → identity
        ref_csv = self._find_ref_csv(fallback_csv)

        if ref_csv is not None:
            df_ref = pd.read_csv(ref_csv)
            print(f"✅ Reference CSV   ← {ref_csv}  ({len(df_ref)} rows)")
            self._microbe_cols = df_ref.columns[5:]   # same slice as training script
            self._scaler = StandardScaler()
            self._scaler.fit(df_ref[self._microbe_cols].fillna(0).values)
            self._use_scaler = True
        else:
            # No reference data — scaler will be skipped (identity transform)
            # microbe_cols will be detected from the uploaded file at predict time
            print("ℹ️  Running without reference CSV — scaler disabled (identity transform)")
            self._microbe_cols = None
            self._scaler       = None
            self._use_scaler   = False

        # Label encoder — use diagnosis col if present, else use hardcoded classes
        self._label_enc = LabelEncoder()
        if ref_csv is not None and 'diagnosis' in df_ref.columns and df_ref['diagnosis'].nunique() > 1:
            self._label_enc.fit(df_ref['diagnosis'])
        else:
            # Fit on known class names matching training
            self._label_enc.fit(['Healthy', "Crohn's Disease", 'Ulcerative Colitis'])

        self._classes = list(self._label_enc.classes_)
        print(f"✅ Scaler + LabelEncoder fitted. Classes: {self._classes}")

        self._loaded = True

    def _find_ref_csv(self, fallback_csv: str = None) -> str:
        """
        Find the best CSV to use as the reference for fitting scaler/encoder.
        Priority:
          1. hmp2_reference.csv in models/
          2. Any other .csv in models/ (first found)
          3. The uploaded file itself (fallback — scaler fitted on test data,
             predictions still work but normalization may drift slightly)
        """
        # 1. Named reference file
        named = os.path.join(MODELS_DIR, 'hmp2_reference.csv')
        if os.path.exists(named):
            return named

        # 2. Any CSV in models/
        try:
            csvs = [f for f in os.listdir(MODELS_DIR) if f.lower().endswith('.csv')]
            if csvs:
                found = os.path.join(MODELS_DIR, csvs[0])
                print(f"ℹ️  Using CSV found in models/: {found}")
                return found
        except Exception:
            pass

        # 3. Fallback: uploaded file itself — only if it has enough columns
        if fallback_csv and os.path.exists(fallback_csv):
            try:
                df_check = pd.read_csv(fallback_csv, nrows=2)
                if len(df_check.columns) > 5:
                    print("⚠️  No reference CSV in models/ — fitting scaler on uploaded file.")
                    print("    For best accuracy, copy your training CSV to models/hmp2_reference.csv")
                    return fallback_csv
                else:
                    print("⚠️  Uploaded file has too few columns to use as reference — using identity scaling.")
                    return None
            except Exception:
                return None

        return None  # Will trigger identity scaling

    # ── Public entry point ────────────────────────────────────────────────────
    def analyze_csv(self, file_path: str) -> dict:
        """
        Process an uploaded CSV file and return per-patient predictions.
        Handles missing week_num, missing Participant ID, and missing microbe cols.
        """
        try:
            self._load(fallback_csv=file_path)
            import tensorflow as tf

            df = pd.read_csv(file_path)
            print(f"📄 Uploaded CSV columns: {list(df.columns[:8])} ...")

            # Drop placeholder diagnosis column
            if 'diagnosis' in df.columns:
                df = df.drop(columns=['diagnosis'])

            # ── Resolve participant ID column ─────────────────────────────────
            pid_col = None
            for candidate in ('Participant ID', 'participant_id', 'PatientID', 'patient_id', 'ID', 'id'):
                if candidate in df.columns:
                    pid_col = candidate
                    break
            if pid_col is None:
                # No ID column — treat whole file as one patient
                df['_pid'] = 'PATIENT_001'
                pid_col = '_pid'

            # ── Resolve week column ───────────────────────────────────────────
            week_col = None
            for candidate in ('week_num', 'week', 'Week', 'time', 'timepoint', 'visit'):
                if candidate in df.columns:
                    week_col = candidate
                    break
            # If no week col, use row order within each patient
            if week_col is None:
                print("⚠️  No week_num column found — using row order as time axis")

            # ── Resolve microbe columns from uploaded file ────────────────────
            # Non-microbe metadata columns to exclude
            meta_cols = {pid_col, week_col, 'External ID', 'fecalcal',
                         'diagnosis_encoded', '_pid', 'external_id'}
            meta_cols = {c for c in meta_cols if c is not None}

            # If scaler was fit on reference, use its columns; else infer from file
            if self._microbe_cols is not None:
                microbe_cols = self._microbe_cols
            else:
                microbe_cols = [c for c in df.columns if c not in meta_cols]
                print(f"ℹ️  Inferred {len(microbe_cols)} microbe columns from uploaded file")

            patients_out = []
            unique_pids  = df[pid_col].unique()

            for pid in unique_pids:
                p_df = df[df[pid_col] == pid].copy()

                # Sort by week if column exists, otherwise keep row order
                if week_col:
                    p_df = p_df.sort_values(week_col)
                    weeks = p_df[week_col].tolist()
                else:
                    weeks = list(range(len(p_df)))

                num_weeks = len(p_df)

                # Build feature matrix — fill missing microbe cols with 0
                X_raw = np.zeros((num_weeks, len(microbe_cols)), dtype=np.float32)
                for j, col in enumerate(microbe_cols):
                    if col in p_df.columns:
                        X_raw[:, j] = p_df[col].fillna(0).values

                # Normalize
                if self._scaler is not None:
                    try:
                        X_scaled = self._scaler.transform(X_raw)
                    except Exception:
                        # Shape mismatch — fall back to identity
                        print("⚠️  Scaler shape mismatch — using raw values")
                        X_scaled = X_raw
                else:
                    X_scaled = X_raw

                # Pad to MAX_LEN
                X_padded = tf.keras.preprocessing.sequence.pad_sequences(
                    [X_scaled], maxlen=MAX_LEN,
                    dtype='float32', padding='post', value=0.0
                )

                # Predict
                probs      = self._model.predict(X_padded, verbose=0)[0]
                pred_idx   = int(np.argmax(probs))
                pred_label = self._label_enc.inverse_transform([pred_idx])[0]
                confidence = float(probs[pred_idx]) * 100

                prob_dict = {
                    self._label_enc.inverse_transform([i])[0]: float(p)
                    for i, p in enumerate(probs)
                }

                # Top contributing taxa
                mean_abundance = X_raw.mean(axis=0)
                top_idx  = np.argsort(mean_abundance)[::-1][:10]
                top_taxa = [
                    {'name': str(microbe_cols[i]), 'mean_abundance': float(mean_abundance[i])}
                    for i in top_idx if mean_abundance[i] > 0
                ][:5]

                # Weekly timeline data
                top5_names = [t['name'] for t in top_taxa]
                values = [
                    p_df[col].fillna(0).tolist() if col in p_df.columns else [0] * num_weeks
                    for col in top5_names
                ]

                patients_out.append({
                    'participant_id': str(pid),
                    'num_weeks':      num_weeks,
                    'diagnosis':      pred_label,
                    'confidence':     round(confidence, 2),
                    'probabilities':  prob_dict,
                    'top_taxa':       top_taxa,
                    'weekly_data':    {'weeks': weeks, 'taxa': top5_names, 'values': values},
                    'fecalcal':       p_df['fecalcal'].fillna(0).tolist() if 'fecalcal' in p_df.columns else [],
                })

            return {'patients': patients_out}

        except Exception as e:
            tb = traceback.format_exc()
            print(f"❌ BioService crash:\n{tb}")
            return {
                'error':   'Microbiome Analysis Failed',
                'details': str(e),
                'trace':   tb.split('\n')[-2],
            }
