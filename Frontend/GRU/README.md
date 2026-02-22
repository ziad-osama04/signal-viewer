# GRU Multi-Asset Price Prediction

A deep learning pipeline that trains **GRU (Gated Recurrent Unit)** models to forecast future prices across three financial asset categories:

| Category   | Assets               | Horizon       | Target     |
|------------|----------------------|---------------|------------|
| **Stocks** | ABTX, AAT            | Next 5 days   | Adj Close  |
| **Currencies** | EUR/USD, USD/JPY | Next 3 days   | Close      |
| **Metals** | Gold, Silver         | Next 30 days  | Price      |

Each asset gets its own GRU model that outputs **all future steps simultaneously** (multi-output dense layer), avoiding error-compounding recursive forecasting.

---

## Project Structure

```
GRU/
├── gru_model.py               # Main training & evaluation script
├── README.md                   # This file
│
├── ABTX (Stock 1).csv          # Dataset — Stocks
├── AAT (Stock 2).csv
├── Currency (Euro to USD).csv  # Dataset — Currencies
├── Currency (USD to JPY).csv
├── gold_price.csv              # Dataset — Metals
├── silver_price.csv
│
├── models/                     # Saved model checkpoints (.keras)
│   ├── ABTX_best.keras
│   ├── AAT_best.keras
│   ├── EURUSD_best.keras
│   ├── USDJPY_best.keras
│   ├── Gold_best.keras
│   └── Silver_best.keras
│
└── plots/                      # Generated visualizations
    ├── <asset>_actual_vs_predicted.png
    └── <asset>_future_forecast.png
```

---

## Requirements

- **Python 3.10+**
- TensorFlow / Keras
- pandas, numpy
- scikit-learn
- matplotlib

Install dependencies:

```bash
pip install tensorflow pandas numpy scikit-learn matplotlib
```

---

## How to Run

```bash
python gru_model.py
```

The script will:

1. **Load & preprocess** each of the 6 CSV datasets  
2. **Split** data into 80% train / 20% test (preserving time order)  
3. **Scale** features with `MinMaxScaler` (fit on train only)  
4. **Create sliding-window sequences** (lookback → forecast horizon)  
5. **Build, compile, and train** a GRU model for each asset  
6. **Evaluate** on the test set with per-step MAE, RMSE, MAPE  
7. **Generate** forward forecasts beyond the last observed date  
8. **Save** model checkpoints to `models/` and plots to `plots/`

---

## Model Architecture

```
Input (lookback, num_features)
    │
    ▼
GRU(128, return_sequences=True, dropout=0.2, recurrent_dropout=0.2)
    │
    ▼
GRU(64, return_sequences=False, dropout=0.2, recurrent_dropout=0.2)
    │
    ▼
Dense(32, activation='relu')
    │
    ▼
Dense(forecast_horizon)   ← linear output (regression)
```

| Hyperparameter       | Value                |
|----------------------|----------------------|
| Optimizer            | Adam (lr=0.001)      |
| Loss                 | Huber                |
| Batch size           | 32                   |
| Max epochs           | 100                  |
| EarlyStopping        | patience=15          |
| ReduceLROnPlateau    | patience=7, factor=0.5 |
| Validation split     | 10% of training data |

---

## Preprocessing Details

| Step                      | Stocks      | Currencies            | Metals          |
|---------------------------|-------------|-----------------------|-----------------|
| Date parsing              | YYYY-MM-DD  | YYYY-MM-DD (from UTC) | YYYY-MM-DD      |
| NaN handling              | Forward-fill + drop | Forward-fill + drop | Forward-fill + drop |
| Features                  | OHLCV + Adj Close (6) | Primary OHLC + 5 correlated pairs (9) | Price only (1) |
| Lookback window           | 60 days     | 60 days               | 90 days         |
| Train/Test split          | 80/20       | 80/20                 | 80/20           |

---

## Evaluation Metrics

After training, the script prints a per-step metrics table for each asset:

```
  ───────────────────────────────────────────────────────
  Evaluation Metrics for ABTX
  ───────────────────────────────────────────────────────
    Step           MAE          RMSE      MAPE (%)
  ───────────────────────────────────────────────────────
  Day   1        1.2345        1.5678        3.45%
  Day   2        1.3456        1.6789        3.67%
  ...
  ───────────────────────────────────────────────────────
    AVG          1.2900        1.6234        3.56%
  ───────────────────────────────────────────────────────
```

Metrics are computed on **inverse-transformed** (original price scale) predictions.

---

## Visualizations

For each asset, two plots are generated:

1. **Actual vs Predicted** — Model predictions overlaid on true test-set prices  
2. **Forward Forecast** — Predicted future prices beyond the last observed date

---

## Configuration

All hyperparameters and file paths are defined in the `CONFIG` and `ASSETS` dictionaries at the top of `gru_model.py`. Easily customizable:

```python
CONFIG = {
    "gru_units_1": 128,
    "gru_units_2": 64,
    "epochs": 100,
    "batch_size": 32,
    "learning_rate": 0.001,
    ...
}
```

To add a new asset, append a dictionary to the `ASSETS` list with:
- `name`, `category`, `file`, `date_col`, `target_col`, `feature_cols`, `lookback`, `horizon`

---

## Notes

- **No data leakage**: MinMaxScaler is fit only on training data; test data is transformed using the same scaler.
- **Time-order preserved**: No shuffling of samples; the train/test split respects temporal order.
- **MSYS2 Python users**: If using MSYS2/MinGW Python, you may need to install TensorFlow to a custom directory (`tf_packages/`) and ensure the `sys.path` insert at the top of the script points to it.
