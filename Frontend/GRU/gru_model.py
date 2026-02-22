"""
GRU Deep Learning Model for Multi-Asset Price Prediction
=========================================================
Predicts future prices for:
  - Stocks (ABTX, AAT): Next 5 days  (Adj Close)
  - Currencies (EUR/USD, USD/JPY): Next 3 days  (Close of primary pair)
  - Metals (Gold, Silver): Next 30 days  (price)

Strategy: Multi-output (one model per asset, Dense output = N future steps).
"""


import sys, os, warnings
warnings.filterwarnings("ignore")           # suppress pandas dayfirst / tz warnings

# ---------------------------------------------------------------------------
# Add the tf_packages folder so TensorFlow installed there can be found.
# This is only needed because the MSYS2 pip install placed it in a custom dir.
# If you installed TensorFlow globally, you can remove these two lines.
# ---------------------------------------------------------------------------
_TF_PKG_DIR = os.path.join(os.path.dirname(os.path.abspath(__file__)), "tf_packages")
if os.path.isdir(_TF_PKG_DIR):
    sys.path.insert(0, _TF_PKG_DIR)

import numpy as np
import pandas as pd
import matplotlib
matplotlib.use("Agg")                       # non-interactive backend (no GUI needed)
import matplotlib.pyplot as plt
import matplotlib.dates as mdates
from sklearn.preprocessing import MinMaxScaler
from sklearn.metrics import mean_absolute_error, mean_squared_error

os.environ["TF_CPP_MIN_LOG_LEVEL"] = "2"    # suppress TF info/warnings
import tensorflow as tf
from tensorflow import keras
from tensorflow.keras.models import Sequential
from tensorflow.keras.layers import GRU, Dense, Input
from tensorflow.keras.optimizers import Adam
from tensorflow.keras.callbacks import EarlyStopping, ReduceLROnPlateau, ModelCheckpoint

# ═══════════════════════════════════════════════════════════════════════════════
# CONFIGURATION — change paths / hyperparameters here
# ═══════════════════════════════════════════════════════════════════════════════
BASE_DIR = os.path.dirname(os.path.abspath(__file__))

CONFIG = {
    # ----- Hyperparameters (shared) -----
    "gru_units_1": 128,
    "gru_units_2": 64,
    "dense_units": 32,
    "dropout": 0.2,
    "recurrent_dropout": 0.2,
    "learning_rate": 0.001,
    "batch_size": 32,
    "epochs": 100,
    "patience_es": 15,       # EarlyStopping patience
    "patience_lr": 7,        # ReduceLROnPlateau patience
    "lr_factor": 0.5,
    "validation_split": 0.1,
    "train_ratio": 0.8,

    # ----- Output directories -----
    "model_dir": os.path.join(BASE_DIR, "models"),
    "plot_dir": os.path.join(BASE_DIR, "plots"),
}

# Per-asset configuration
ASSETS = [
    # ── Stocks ──────────────────────────────────────────────────────────────
    {
        "name": "ABTX",
        "category": "stock",
        "file": os.path.join(BASE_DIR, "ABTX (Stock 1).csv"),
        "date_col": "Date",
        "target_col": "Adj Close",
        "feature_cols": ["Open", "High", "Low", "Close", "Volume", "Adj Close"],
        "lookback": 60,
        "horizon": 5,
    },
    {
        "name": "AAT",
        "category": "stock",
        "file": os.path.join(BASE_DIR, "AAT (Stock 2).csv"),
        "date_col": "Date",
        "target_col": "Adj Close",
        "feature_cols": ["Open", "High", "Low", "Close", "Volume", "Adj Close"],
        "lookback": 60,
        "horizon": 5,
    },
    # ── Currencies ──────────────────────────────────────────────────────────
    {
        "name": "EURUSD",
        "category": "currency",
        "file": os.path.join(BASE_DIR, "Currency (Euro to USD).csv"),
        "date_col": "Date",
        "target_col": "EURUSD_Close",
        "feature_cols": [
            # Primary pair OHLC
            "EURUSD_Open", "EURUSD_High", "EURUSD_Low", "EURUSD_Close",
            # Correlated pairs Close
            "GBPUSD_Close", "AUDUSD_Close", "NZDUSD_Close",
            "EURGBP_Close", "EURJPY_Close_x",
        ],
        "lookback": 60,
        "horizon": 3,
    },
    {
        "name": "USDJPY",
        "category": "currency",
        "file": os.path.join(BASE_DIR, "Currency (USD to JPY).csv"),
        "date_col": "Date",
        "target_col": "USDJPY_Close",
        "feature_cols": [
            # Primary pair OHLC
            "USDJPY_Open", "USDJPY_High", "USDJPY_Low", "USDJPY_Close",
            # Correlated pairs Close
            "EURJPY_Close_x", "GBPJPY_Close",
            "USDCNY_Close", "USDSGD_Close", "USDHKD_Close",
        ],
        "lookback": 60,
        "horizon": 3,
    },
    # ── Metals ──────────────────────────────────────────────────────────────
    {
        "name": "Gold",
        "category": "metal",
        "file": os.path.join(BASE_DIR, "gold_price.csv"),
        "date_col": "date",
        "target_col": "price",
        "feature_cols": ["price"],
        "lookback": 90,
        "horizon": 30,
    },
    {
        "name": "Silver",
        "category": "metal",
        "file": os.path.join(BASE_DIR, "silver_price.csv"),
        "date_col": "date",
        "target_col": "price",
        "feature_cols": ["price"],
        "lookback": 90,
        "horizon": 30,
    },
]


# ═══════════════════════════════════════════════════════════════════════════════
# 1. DATA LOADING & PREPROCESSING
# ═══════════════════════════════════════════════════════════════════════════════

def load_and_preprocess(asset_cfg):
    """
    Load CSV, parse dates, sort, handle NaN, and select features.
    Returns: DataFrame with selected feature columns (sorted by date ascending),
             and the dates Series.
    """
    name = asset_cfg["name"]
    cat = asset_cfg["category"]
    path = asset_cfg["file"]
    date_col = asset_cfg["date_col"]
    feature_cols = asset_cfg["feature_cols"]

    print(f"\n{'='*60}")
    print(f"  Loading {name} ({cat}) from {os.path.basename(path)}")
    print(f"{'='*60}")

    if cat == "currency":
        # Only load the columns we actually need (memory-friendly)
        use_cols = [date_col] + feature_cols
        df = pd.read_csv(path, usecols=use_cols)
    else:
        df = pd.read_csv(path)

    # Parse date column: extract YYYY-MM-DD to avoid mixed-timezone errors
    df[date_col] = pd.to_datetime(df[date_col].astype(str).str[:10],
                                  format="%Y-%m-%d", errors="coerce")

    # Sort ascending by date
    df.sort_values(date_col, inplace=True)
    df.reset_index(drop=True, inplace=True)

    # Handle NaN values: forward-fill, then drop remaining
    df[feature_cols] = df[feature_cols].ffill()
    df.dropna(subset=feature_cols + [date_col], inplace=True)
    df.reset_index(drop=True, inplace=True)

    # For currencies, drop any duplicate dates (the data had some duplicates)
    if cat == "currency":
        df.drop_duplicates(subset=[date_col], keep="first", inplace=True)
        df.reset_index(drop=True, inplace=True)

    dates = df[date_col].copy()
    data = df[feature_cols].copy().astype(float)

    print(f"  Shape after preprocessing: {data.shape}")
    print(f"  Date range: {dates.iloc[0]} → {dates.iloc[-1]}")
    return data, dates


# ═══════════════════════════════════════════════════════════════════════════════
# 2. SEQUENCE / SLIDING WINDOW CREATION
# ═══════════════════════════════════════════════════════════════════════════════

def create_sequences(data_array, target_idx, lookback, horizon):
    """
    Build X (3D) and Y (2D) arrays using a sliding window.
      X[i] = data[i : i+lookback]            →  shape (lookback, features)
      Y[i] = target[i+lookback : i+lookback+horizon]  →  shape (horizon,)

    No future data leakage: Y starts AFTER the lookback window ends.
    """
    X, Y = [], []
    total = len(data_array)
    for i in range(total - lookback - horizon + 1):
        X.append(data_array[i : i + lookback])
        Y.append(data_array[i + lookback : i + lookback + horizon, target_idx])
    return np.array(X), np.array(Y)


# ═══════════════════════════════════════════════════════════════════════════════
# 3. MODEL ARCHITECTURE
# ═══════════════════════════════════════════════════════════════════════════════

def build_gru_model(lookback, num_features, horizon):
    """
    Construct the GRU model:
      GRU(128) → GRU(64) → Dense(32, relu) → Dense(horizon)
    """
    model = Sequential([
        Input(shape=(lookback, num_features)),
        GRU(
            CONFIG["gru_units_1"],
            return_sequences=True,
            dropout=CONFIG["dropout"],
            recurrent_dropout=CONFIG["recurrent_dropout"],
        ),
        GRU(
            CONFIG["gru_units_2"],
            return_sequences=False,
            dropout=CONFIG["dropout"],
            recurrent_dropout=CONFIG["recurrent_dropout"],
        ),
        Dense(CONFIG["dense_units"], activation="relu"),
        Dense(horizon),                      # linear output — regression
    ])

    model.compile(
        optimizer=Adam(learning_rate=CONFIG["learning_rate"]),
        loss="huber",
        metrics=["mae"],
    )
    return model


# ═══════════════════════════════════════════════════════════════════════════════
# 4. TRAINING
# ═══════════════════════════════════════════════════════════════════════════════

def train_model(model, X_train, y_train, asset_name):
    """
    Train the model with EarlyStopping, ReduceLROnPlateau, and ModelCheckpoint.
    Returns the training History object.
    """
    os.makedirs(CONFIG["model_dir"], exist_ok=True)
    ckpt_path = os.path.join(CONFIG["model_dir"], f"{asset_name}_best.keras")

    callbacks = [
        EarlyStopping(
            monitor="val_loss",
            patience=CONFIG["patience_es"],
            restore_best_weights=True,
            verbose=1,
        ),
        ReduceLROnPlateau(
            monitor="val_loss",
            patience=CONFIG["patience_lr"],
            factor=CONFIG["lr_factor"],
            verbose=1,
        ),
        ModelCheckpoint(
            filepath=ckpt_path,
            monitor="val_loss",
            save_best_only=True,
            verbose=1,
        ),
    ]

    history = model.fit(
        X_train, y_train,
        epochs=CONFIG["epochs"],
        batch_size=CONFIG["batch_size"],
        validation_split=CONFIG["validation_split"],
        callbacks=callbacks,
        verbose=1,
    )
    print(f"  ✓ Best model saved to {ckpt_path}")
    return history


# ═══════════════════════════════════════════════════════════════════════════════
# 5. EVALUATION
# ═══════════════════════════════════════════════════════════════════════════════

def evaluate_model(model, X_test, y_test, scaler, target_idx, num_features, horizon, asset_name):
    """
    Predict on test set, inverse-transform, and compute per-step MAE / RMSE / MAPE.
    Returns (actual_inv, pred_inv) — both shape (samples, horizon).
    """
    preds = model.predict(X_test, verbose=0)    # (samples, horizon)

    # Inverse-scale predictions and actuals
    def inverse_col(arr_2d, col_idx, n_feat):
        """Inverse-transform a 2D array that corresponds to a single feature column."""
        dummy = np.zeros((arr_2d.shape[0], n_feat))
        dummy[:, col_idx] = arr_2d.ravel() if arr_2d.ndim == 1 else arr_2d[:, 0]
        inv = scaler.inverse_transform(dummy)[:, col_idx]
        return inv

    actual_inv = np.zeros_like(y_test)
    pred_inv = np.zeros_like(preds)

    for step in range(horizon):
        actual_inv[:, step] = inverse_col(y_test[:, step:step+1], target_idx, num_features)
        pred_inv[:, step]   = inverse_col(preds[:, step:step+1],  target_idx, num_features)

    # Per-step metrics
    print(f"\n  {'─'*55}")
    print(f"  Evaluation Metrics for {asset_name}")
    print(f"  {'─'*55}")
    print(f"  {'Step':>6}  {'MAE':>12}  {'RMSE':>12}  {'MAPE (%)':>12}")
    print(f"  {'─'*55}")

    maes, rmses, mapes = [], [], []
    for step in range(horizon):
        mae  = mean_absolute_error(actual_inv[:, step], pred_inv[:, step])
        rmse = np.sqrt(mean_squared_error(actual_inv[:, step], pred_inv[:, step]))
        # Avoid div-by-zero in MAPE
        nonzero = actual_inv[:, step] != 0
        if nonzero.any():
            mape = np.mean(np.abs(
                (actual_inv[nonzero, step] - pred_inv[nonzero, step]) / actual_inv[nonzero, step]
            )) * 100
        else:
            mape = 0.0
        maes.append(mae)
        rmses.append(rmse)
        mapes.append(mape)
        print(f"  Day {step+1:>3}  {mae:>12.4f}  {rmse:>12.4f}  {mape:>11.2f}%")

    print(f"  {'─'*55}")
    print(f"  {'AVG':>6}  {np.mean(maes):>12.4f}  {np.mean(rmses):>12.4f}  {np.mean(mapes):>11.2f}%")
    print(f"  {'─'*55}")

    return actual_inv, pred_inv


# ═══════════════════════════════════════════════════════════════════════════════
# 6. VISUALIZATION
# ═══════════════════════════════════════════════════════════════════════════════

def plot_results(actual_inv, pred_inv, future_preds, asset_name, test_dates, horizon):
    """
    1) Actual vs Predicted on test set (last step of each prediction window).
    2) Forward-looking forecast beyond the last test date.
    """
    os.makedirs(CONFIG["plot_dir"], exist_ok=True)

    # Ensure all dates are tz-naive datetime64
    test_dates = pd.to_datetime(test_dates)

    # --- Plot 1: Actual vs Predicted on test set (using last predicted step) ---
    fig, ax = plt.subplots(figsize=(14, 5))
    last_actual = actual_inv[:, -1]
    last_pred   = pred_inv[:, -1]

    # Align dates: each prediction corresponds to lookback + horizon offset
    plot_dates = test_dates[:len(last_actual)].values

    ax.plot(plot_dates, last_actual, color="#2196F3", linewidth=1.4, label="Actual")
    ax.plot(plot_dates, last_pred,   color="#FF9800", linewidth=1.4, label="Predicted", alpha=0.85)
    ax.set_title(f"{asset_name} — Actual vs Predicted (Test Set, Day {horizon})", fontsize=14, fontweight="bold")
    ax.set_xlabel("Date")
    ax.set_ylabel("Price")
    ax.legend()
    ax.grid(True, alpha=0.3)
    ax.xaxis.set_major_formatter(mdates.DateFormatter("%Y-%m-%d"))
    ax.xaxis.set_major_locator(mdates.AutoDateLocator())
    fig.autofmt_xdate()
    fig.tight_layout()
    path1 = os.path.join(CONFIG["plot_dir"], f"{asset_name}_actual_vs_predicted.png")
    fig.savefig(path1, dpi=150)
    plt.close(fig)
    print(f"  ✓ Plot saved: {path1}")

    # --- Plot 2: Forward forecast beyond observed data ---
    fig2, ax2 = plt.subplots(figsize=(14, 5))

    # Show last portion of actual data for context
    context_len = min(60, len(last_actual))
    ctx_dates  = plot_dates[-context_len:]
    ctx_actual = last_actual[-context_len:]

    # Build future dates (business days after last date)
    last_date = pd.Timestamp(plot_dates[-1])
    if last_date.tzinfo is not None:
        last_date = last_date.tz_localize(None)
    future_dates = pd.bdate_range(start=last_date + pd.Timedelta(days=1), periods=horizon)

    ax2.plot(ctx_dates, ctx_actual, color="#2196F3", linewidth=1.4, label="Recent Actual")
    ax2.plot(future_dates, future_preds, color="#4CAF50", linewidth=2, linestyle="--",
             marker="o", markersize=4, label=f"Forecast (next {horizon} days)")
    ax2.set_title(f"{asset_name} — Forward Forecast ({horizon} days ahead)", fontsize=14, fontweight="bold")
    ax2.set_xlabel("Date")
    ax2.set_ylabel("Price")
    ax2.legend()
    ax2.grid(True, alpha=0.3)
    ax2.xaxis.set_major_formatter(mdates.DateFormatter("%Y-%m-%d"))
    ax2.xaxis.set_major_locator(mdates.AutoDateLocator())
    fig2.autofmt_xdate()
    fig2.tight_layout()
    path2 = os.path.join(CONFIG["plot_dir"], f"{asset_name}_future_forecast.png")
    fig2.savefig(path2, dpi=150)
    plt.close(fig2)
    print(f"  ✓ Plot saved: {path2}")


# ═══════════════════════════════════════════════════════════════════════════════
# 7. FUTURE PREDICTION HELPER
# ═══════════════════════════════════════════════════════════════════════════════

def predict_future(model, last_window, scaler, target_idx, num_features):
    """
    Use the model to predict the next N steps beyond all available data.
    last_window: the last lookback-sized window from the FULL (scaled) dataset.
    Returns inverse-transformed future prices.
    """
    input_seq = last_window.reshape(1, *last_window.shape)       # (1, lookback, features)
    preds_scaled = model.predict(input_seq, verbose=0)[0]        # (horizon,)

    # Inverse-transform
    dummy = np.zeros((len(preds_scaled), num_features))
    dummy[:, target_idx] = preds_scaled
    future_prices = scaler.inverse_transform(dummy)[:, target_idx]
    return future_prices


# ═══════════════════════════════════════════════════════════════════════════════
# 8. MAIN — orchestrate everything
# ═══════════════════════════════════════════════════════════════════════════════

def main():
    print("╔══════════════════════════════════════════════════════════════╗")
    print("║       GRU Multi-Asset Price Prediction Pipeline            ║")
    print("╚══════════════════════════════════════════════════════════════╝")

    for asset_cfg in ASSETS:
        name      = asset_cfg["name"]
        target    = asset_cfg["target_col"]
        features  = asset_cfg["feature_cols"]
        lookback  = asset_cfg["lookback"]
        horizon   = asset_cfg["horizon"]

        # ── 1. Load & preprocess ────────────────────────────────────────
        data_df, dates = load_and_preprocess(asset_cfg)
        target_idx = features.index(target)
        num_features = len(features)

        # ── 2. Train / Test split (80-20, no shuffle) ───────────────────
        split = int(len(data_df) * CONFIG["train_ratio"])
        train_df = data_df.iloc[:split]
        test_df  = data_df.iloc[split:]
        train_dates = dates.iloc[:split]
        test_dates  = dates.iloc[split:]

        print(f"  Train: {len(train_df)} rows | Test: {len(test_df)} rows")

        # ── 3. Scale features  (fit on train ONLY) ─────────────────────
        scaler = MinMaxScaler()
        train_scaled = scaler.fit_transform(train_df.values)
        test_scaled  = scaler.transform(test_df.values)
        full_scaled  = np.vstack([train_scaled, test_scaled])

        # ── 4. Create sequences ─────────────────────────────────────────
        X_train, y_train = create_sequences(train_scaled, target_idx, lookback, horizon)
        X_test,  y_test  = create_sequences(test_scaled,  target_idx, lookback, horizon)

        print(f"  X_train: {X_train.shape}  y_train: {y_train.shape}")
        print(f"  X_test:  {X_test.shape}   y_test:  {y_test.shape}")

        if X_test.shape[0] == 0:
            print(f"  ⚠  Not enough test data for {name}. Skipping.")
            continue

        # ── 5. Build model ──────────────────────────────────────────────
        model = build_gru_model(lookback, num_features, horizon)
        model.summary()

        # ── 6. Train ────────────────────────────────────────────────────
        history = train_model(model, X_train, y_train, name)

        # ── 7. Evaluate on test set ─────────────────────────────────────
        actual_inv, pred_inv = evaluate_model(
            model, X_test, y_test, scaler, target_idx, num_features, horizon, name
        )

        # ── 8. Forward forecast ─────────────────────────────────────────
        last_window = full_scaled[-lookback:]   # last lookback days from all data
        future_prices = predict_future(model, last_window, scaler, target_idx, num_features)
        print(f"\n  Forward Forecast ({horizon} days):")
        for i, p in enumerate(future_prices, 1):
            print(f"    Day {i}: {p:.4f}")

        # ── 9. Plot ─────────────────────────────────────────────────────
        # Dates for the test-set predictions: each prediction at index i
        # corresponds to test date at index (i + lookback + horizon - 1),
        # but since we built sequences from test_scaled, the "effective"
        # test dates start after the lookback within the test portion.
        pred_test_dates = test_dates.iloc[lookback + horizon - 1 : lookback + horizon - 1 + len(actual_inv)]
        pred_test_dates = pred_test_dates.reset_index(drop=True)

        plot_results(actual_inv, pred_inv, future_prices, name, pred_test_dates, horizon)

    print("\n" + "═" * 60)
    print("  All models trained and saved successfully!")
    print("═" * 60)


# ═══════════════════════════════════════════════════════════════════════════════
if __name__ == "__main__":
    main()
