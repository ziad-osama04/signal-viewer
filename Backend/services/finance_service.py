"""
Finance Analysis Service
========================
GRU-based price prediction for:
  Stocks   : ABTX, AAT          → horizon 5 days  (Adj Close)
  Currencies: EURUSD, USDJPY    → horizon 3 days  (Close)
  Metals   : Gold, Silver        → horizon 30 days (price)

Each asset has a saved .keras model in Backend/models/
Inference: load last `lookback` rows from uploaded CSV → scale → predict → inverse-scale
"""

import numpy as np
import pandas as pd
import os
import traceback
from sklearn.preprocessing import MinMaxScaler

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

# ── Asset registry — mirrors finance_model.py ASSETS list ────────────────────
ASSET_CONFIGS = {
    # ── Stocks ────────────────────────────────────────────────────────────────
    "ABTX": {
        "category":    "stock",
        "date_col":    "Date",
        "target_col":  "Adj Close",
        "feature_cols": ["Open", "High", "Low", "Close", "Volume", "Adj Close"],
        "lookback":    60,
        "horizon":     5,
        "model_file":  "ABTX_best.keras",
    },
    "AAT": {
        "category":    "stock",
        "date_col":    "Date",
        "target_col":  "Adj Close",
        "feature_cols": ["Open", "High", "Low", "Close", "Volume", "Adj Close"],
        "lookback":    60,
        "horizon":     5,
        "model_file":  "AAT_best.keras",
    },
    # ── Currencies ────────────────────────────────────────────────────────────
    "EURUSD": {
        "category":    "currency",
        "date_col":    "Date",
        "target_col":  "EURUSD_Close",
        "feature_cols": [
            "EURUSD_Open", "EURUSD_High", "EURUSD_Low", "EURUSD_Close",
            "GBPUSD_Close", "AUDUSD_Close", "NZDUSD_Close",
            "EURGBP_Close", "EURJPY_Close_x",
        ],
        "lookback":    60,
        "horizon":     3,
        "model_file":  "EURUSD_best.keras",
    },
    "USDJPY": {
        "category":    "currency",
        "date_col":    "Date",
        "target_col":  "USDJPY_Close",
        "feature_cols": [
            "USDJPY_Open", "USDJPY_High", "USDJPY_Low", "USDJPY_Close",
            "EURJPY_Close_x", "GBPJPY_Close",
            "USDCNY_Close", "USDSGD_Close", "USDHKD_Close",
        ],
        "lookback":    60,
        "horizon":     3,
        "model_file":  "USDJPY_best.keras",
    },
    # ── Metals ────────────────────────────────────────────────────────────────
    "Gold": {
        "category":    "metal",
        "date_col":    "date",
        "target_col":  "price",
        "feature_cols": ["price"],
        "lookback":    90,
        "horizon":     30,
        "model_file":  "Gold_best.keras",
    },
    "Silver": {
        "category":    "metal",
        "date_col":    "date",
        "target_col":  "price",
        "feature_cols": ["price"],
        "lookback":    90,
        "horizon":     30,
        "model_file":  "Silver_best.keras",
    },
}

# ── Lazy TF import ────────────────────────────────────────────────────────────
_tf = None
def _get_tf():
    global _tf
    if _tf is None:
        import tensorflow as tf
        _tf = tf
    return _tf


# ── GRU architecture — mirrors build_gru_model() from finance_model.py ──────
# We rebuild from scratch and load weights only.
# This avoids Keras version mismatches (e.g. unknown 'quantization_config' key
# saved by a newer Keras that the current environment does not recognise).
_GRU_CONFIG = {
    "gru_units_1": 128,
    "gru_units_2": 64,
    "dense_units": 32,
    "dropout": 0.2,
    "recurrent_dropout": 0.2,
    "learning_rate": 0.001,
}

def _build_gru(lookback: int, num_features: int, horizon: int):
    tf = _get_tf()
    from tensorflow.keras.models import Sequential
    from tensorflow.keras.layers import GRU, Dense, Input
    from tensorflow.keras.optimizers import Adam

    model = Sequential([
        Input(shape=(lookback, num_features)),
        GRU(_GRU_CONFIG["gru_units_1"], return_sequences=True,
            dropout=_GRU_CONFIG["dropout"],
            recurrent_dropout=_GRU_CONFIG["recurrent_dropout"]),
        GRU(_GRU_CONFIG["gru_units_2"], return_sequences=False,
            dropout=_GRU_CONFIG["dropout"],
            recurrent_dropout=_GRU_CONFIG["recurrent_dropout"]),
        Dense(_GRU_CONFIG["dense_units"], activation="relu"),
        Dense(horizon),
    ])
    model.compile(optimizer=Adam(learning_rate=_GRU_CONFIG["learning_rate"]),
                  loss="huber", metrics=["mae"])
    return model


# ── Model cache (avoid reloading on every request) ───────────────────────────
_model_cache: dict = {}

def _load_model(asset_name: str):
    if asset_name in _model_cache:
        return _model_cache[asset_name]

    cfg        = ASSET_CONFIGS[asset_name]
    model_path = os.path.join(MODELS_DIR, cfg["model_file"])
    lookback   = cfg["lookback"]
    horizon    = cfg["horizon"]
    n_feat     = len(cfg["feature_cols"])

    if not os.path.exists(model_path):
        raise FileNotFoundError(f"Model not found: {model_path}")

    # ── Strategy 1: load normally (works when Keras versions match) ───────────
    try:
        tf = _get_tf()
        model = tf.keras.models.load_model(model_path)
        _model_cache[asset_name] = model
        print(f"✅ Finance model loaded (full): {model_path}")
        return model
    except Exception as e_full:
        print(f"⚠️  Full load failed ({e_full.__class__.__name__}): {e_full}")
        print("   → Falling back to weights-only load (Keras version mismatch workaround)…")

    # ── Strategy 2: rebuild architecture + load weights only ─────────────────
    # Works across Keras versions because we never deserialise the saved config.
    try:
        model = _build_gru(lookback, n_feat, horizon)
        model.load_weights(model_path)
        _model_cache[asset_name] = model
        print(f"✅ Finance model loaded (weights-only): {model_path}")
        return model
    except Exception as e_weights:
        raise RuntimeError(
            f"Could not load model for '{asset_name}'.\n"
            f"  Full-load error  : {e_full}\n"
            f"  Weights-only error: {e_weights}"
        ) from e_weights


# ── Data loading — mirrors load_and_preprocess() from finance_model.py ────────
def _load_csv(file_path: str, cfg: dict) -> tuple:
    """
    Load user-uploaded CSV, parse dates, forward-fill NaN, select features.
    Returns (data_df: DataFrame, dates: Series)
    """
    date_col     = cfg["date_col"]
    feature_cols = cfg["feature_cols"]
    cat          = cfg["category"]

    if cat == "currency":
        use_cols = [date_col] + feature_cols
        try:
            df = pd.read_csv(file_path, usecols=use_cols)
        except ValueError:
            # Some currency files include extra cols — try loading all
            df = pd.read_csv(file_path)
    else:
        df = pd.read_csv(file_path)

    # Normalise date column name if needed (case-insensitive match)
    col_map = {c.lower(): c for c in df.columns}
    actual_date = col_map.get(date_col.lower(), date_col)
    df.rename(columns={actual_date: date_col}, inplace=True)

    df[date_col] = pd.to_datetime(
        df[date_col].astype(str).str[:10], format="%Y-%m-%d", errors="coerce"
    )
    df.sort_values(date_col, inplace=True)
    df.reset_index(drop=True, inplace=True)

    # Forward-fill then drop remaining NaN
    df[feature_cols] = df[feature_cols].ffill()
    df.dropna(subset=feature_cols + [date_col], inplace=True)
    df.reset_index(drop=True, inplace=True)

    if cat == "currency":
        df.drop_duplicates(subset=[date_col], keep="first", inplace=True)
        df.reset_index(drop=True, inplace=True)

    dates   = df[date_col].copy()
    data_df = df[feature_cols].copy().astype(float)
    return data_df, dates


# ── Core prediction ───────────────────────────────────────────────────────────
def _predict_future(model, last_window: np.ndarray, scaler: MinMaxScaler,
                    target_idx: int, num_features: int) -> np.ndarray:
    """
    Run one forward-pass on the last lookback window.
    Returns inverse-transformed future prices as 1-D array of length horizon.
    """
    input_seq    = last_window.reshape(1, *last_window.shape)    # (1, lookback, features)
    preds_scaled = model.predict(input_seq, verbose=0)[0]        # (horizon,)

    dummy = np.zeros((len(preds_scaled), num_features))
    dummy[:, target_idx] = preds_scaled
    future_prices = scaler.inverse_transform(dummy)[:, target_idx]
    return future_prices


# ── Build date array for forecast ─────────────────────────────────────────────
def _future_dates(last_date: pd.Timestamp, horizon: int, category: str) -> list:
    """Business days for stocks/currencies, calendar days for metals."""
    if category == "metal":
        dates = pd.date_range(start=last_date + pd.Timedelta(days=1), periods=horizon)
    else:
        dates = pd.bdate_range(start=last_date + pd.Timedelta(days=1), periods=horizon)
    return [d.strftime("%Y-%m-%d") for d in dates]


# ── Compute simple metrics on the test tail ───────────────────────────────────
def _tail_metrics(actual: np.ndarray, predicted: np.ndarray) -> dict:
    """MAE, RMSE, MAPE on the last N samples."""
    mae  = float(np.mean(np.abs(actual - predicted)))
    rmse = float(np.sqrt(np.mean((actual - predicted) ** 2)))
    mask = actual != 0
    mape = float(np.mean(np.abs((actual[mask] - predicted[mask]) / actual[mask])) * 100) if mask.any() else 0.0
    return {"mae": round(mae, 4), "rmse": round(rmse, 4), "mape": round(mape, 2)}


# ── Public entry point ────────────────────────────────────────────────────────
def analyze_finance_signal(file_path: str, asset_name: str) -> dict:
    """
    Full inference pipeline for one asset.

    Returns:
    {
        asset, category, horizon,
        forecast: { dates: [...], prices: [...] },
        history:  { dates: [...], actual: [...] },
        metrics:  { mae, rmse, mape },
        signals:  { <target_col>: [...] },   ← for the viewer chart
        time:     [...]
    }
    """
    try:
        if asset_name not in ASSET_CONFIGS:
            return {"error": "Unknown asset", "details": f"'{asset_name}' not in registry"}

        cfg          = ASSET_CONFIGS[asset_name]
        feature_cols = cfg["feature_cols"]
        target_col   = cfg["target_col"]
        lookback     = cfg["lookback"]
        horizon      = cfg["horizon"]
        category     = cfg["category"]
        target_idx   = feature_cols.index(target_col)
        num_features = len(feature_cols)

        # 1. Load model
        model = _load_model(asset_name)

        # 2. Load CSV
        data_df, dates = _load_csv(file_path, cfg)

        if len(data_df) < lookback:
            return {
                "error":   "Not enough data",
                "details": f"Need at least {lookback} rows, got {len(data_df)}"
            }

        # 3. Fit scaler on all available data (inference mode — no train/test split needed)
        scaler        = MinMaxScaler()
        scaled        = scaler.fit_transform(data_df.values)

        # 4. Last lookback window → forecast
        last_window   = scaled[-lookback:]
        future_prices = _predict_future(model, last_window, scaler, target_idx, num_features)

        # 5. In-sample: predict on sliding windows for metrics
        #    Use last min(200, len) rows to compute quick test-set style metrics
        eval_len = min(len(scaled), max(lookback + horizon + 10, 80))
        eval_scaled = scaled[-eval_len:]
        actuals_inv, preds_inv = [], []
        for i in range(len(eval_scaled) - lookback - horizon + 1):
            window = eval_scaled[i : i + lookback]
            preds  = _predict_future(model, window, scaler, target_idx, num_features)
            # Actual: inverse transform eval_scaled at same position
            dummy_a = np.zeros((horizon, num_features))
            dummy_a[:, target_idx] = eval_scaled[i + lookback : i + lookback + horizon, target_idx]
            actual = scaler.inverse_transform(dummy_a)[:, target_idx]
            preds_inv.append(preds[-1])    # use last step of forecast
            actuals_inv.append(actual[-1])

        actuals_arr = np.array(actuals_inv)
        preds_arr   = np.array(preds_inv)
        metrics     = _tail_metrics(actuals_arr, preds_arr)

        # 6. Build history for chart
        target_series = data_df[target_col].tolist()
        date_strs     = dates.dt.strftime("%Y-%m-%d").tolist()
        last_date     = dates.iloc[-1]

        # 6b. Extract OHLC + Volume — aligned to the same rows as data_df/dates
        ohlc = {}
        try:
            raw_df = pd.read_csv(file_path)
            col_map = {c.lower(): c for c in raw_df.columns}
            date_col_raw = col_map.get(cfg["date_col"].lower(), cfg["date_col"])
            raw_df[date_col_raw] = pd.to_datetime(
                raw_df[date_col_raw].astype(str).str[:10], errors="coerce"
            )
            raw_df.sort_values(date_col_raw, inplace=True)
            raw_df.dropna(subset=[date_col_raw], inplace=True)
            if category == "currency":
                raw_df.drop_duplicates(subset=[date_col_raw], keep="first", inplace=True)
            raw_df.reset_index(drop=True, inplace=True)

            # Align to the exact dates that survived preprocessing in data_df
            aligned = raw_df[raw_df[date_col_raw].isin(dates)].copy()
            aligned.reset_index(drop=True, inplace=True)

            def _col(candidates):
                for name in candidates:
                    if name.lower() in col_map:
                        col = col_map[name.lower()]
                        if col in aligned.columns:
                            vals = aligned[col].ffill().tolist()
                            return [round(float(x), 4) if not pd.isna(x) else None for x in vals]
                return None

            # For currencies: target_col is e.g. "EURUSD_Close"
            # → derive "EURUSD_Open", "EURUSD_High", "EURUSD_Low" from the prefix
            t = cfg["target_col"]                          # e.g. "EURUSD_Close"
            prefix = t.rsplit("_", 1)[0] if "_" in t else ""  # "EURUSD"

            o  = _col([f"{prefix}_Open",  "Open"])  if prefix else _col(["Open"])
            h  = _col([f"{prefix}_High",  "High"])  if prefix else _col(["High"])
            l  = _col([f"{prefix}_Low",   "Low"])   if prefix else _col(["Low"])
            cl = _col([f"{prefix}_Close", "Close", "Adj Close", t])
            v  = _col(["Volume"])

            if o and h and l and cl and len(o) == len(date_strs):
                ohlc = {
                    "open":  o,
                    "high":  h,
                    "low":   l,
                    "close": cl,
                }
                print(f"✅ OHLC extracted: {len(o)} rows")
            else:
                print(f"⚠️  OHLC skipped — lengths: o={len(o) if o else 0} dates={len(date_strs)}")
            if v and len(v) == len(date_strs):
                ohlc["volume"] = [int(x) if x is not None and not pd.isna(x) else 0 for x in v]
        except Exception as e_ohlc:
            print(f"⚠️  OHLC extraction skipped: {e_ohlc}")

        # 7. Build forecast dates
        f_dates = _future_dates(last_date, horizon, category)

        history = {
            "dates":  date_strs,
            "actual": [round(float(v), 4) for v in target_series],
        }
        history.update(ohlc)   # merge open/high/low/close/volume if available

        return {
            "asset":    asset_name,
            "category": category,
            "horizon":  horizon,
            "forecast": {
                "dates":  f_dates,
                "prices": [round(float(p), 4) for p in future_prices],
            },
            "history": history,
            "metrics": metrics,
            "signals": {target_col: target_series},
            "time":    list(range(len(target_series))),
        }

    except Exception as e:
        tb = traceback.format_exc()
        print(f"❌ Finance Service crash:\n{tb}")
        return {
            "error":   "Finance Analysis Failed",
            "details": str(e),
            "trace":   tb.split("\n")[-2],
        }
