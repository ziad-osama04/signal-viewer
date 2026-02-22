import numpy as np
import pandas as pd
import sys
import os

# Fix imports to locate models
sys.path.append(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
from models.ecg_model_loader import ECGModelLoader

CLASSES = ["NORM", "MI", "STTC", "CD", "HYP"]
AI_CLASSES = ["1dAVb", "RBBB", "LBBB", "SB", "AF", "ST"]

def load_csv(path):
    """
    Robust CSV loader that detects 'Time (s)' and returns all other signal leads.
    """
    df = pd.read_csv(path)
    
    # 1. Identify and remove the Time column
    time_col = None
    for col in df.columns:
        if 'time' in str(col).lower():
            time_col = col
            break
            
    if time_col:
        print(f"✅ Found Time column: {time_col}")
        df_signals = df.drop(columns=[time_col])
    else:
        # If no time col found, assume first col is time
        df_signals = df.iloc[:, 1:]

    # 2. Filter only numeric columns
    df_signals = df_signals.select_dtypes(include=[np.number])
    
    # 3. Fill NaNs
    df_signals = df_signals.fillna(0)
    
    return df_signals, df_signals.columns.tolist()

def extract_features_for_rf(df_values):
    """
    Extracts exactly 41 features for the Random Forest.
    Calculates stats across all 15 leads.
    """
    # Use leads (up to 12 or all 15)
    num_leads_to_use = min(df_values.shape[1], 12)
    leads = df_values[:, :num_leads_to_use]
    
    # 1. Per-lead stats: Mean, Std, Max (12 * 3 = 36)
    means = np.mean(leads, axis=0)
    stds = np.std(leads, axis=0)
    maxs = np.max(leads, axis=0)
    
    # 2. Global stats (4)
    g_mean = np.mean(df_values)
    g_std = np.std(df_values)
    g_max = np.max(df_values)
    g_min = np.min(df_values)
    
    features = np.concatenate([
        means.flatten(), stds.flatten(), maxs.flatten(), 
        [g_mean, g_std, g_max, g_min]
    ])
    
    # 3. Force to 41 features (The specific requirement of your model)
    target = 41
    if len(features) > target:
        features = features[:target]
    else:
        features = np.pad(features, (0, target - len(features)))
        
    return features.reshape(1, -1)

def analyze_medical_signal(file_path):
    loader = ECGModelLoader()
    try:
        # 1. Load the COMPLETE file
        df, cols = load_csv(file_path)
        raw_values = df.values

        # --- ResNet AI Analysis ---
        # The Keras model expects 4096 samples over 12 leads.
        ai_result = {"prediction": "Model Error", "confidence": 0}
        if loader.deep_model:
            # Helper to crop/pad to exactly 4096
            def get_ai_window(vals):
                s = vals[:, :12] if vals.shape[1] >= 12 else np.tile(vals, (1, 3))[:, :12]
                if s.shape[0] < 4096:
                    pad_len = 4096 - s.shape[0]
                    s = np.pad(s, ((0, pad_len), (0, 0)), mode="constant")
                elif s.shape[0] > 4096:
                    s = s[:4096, :]
                return np.expand_dims(s, axis=0)

            input_tensor = get_ai_window(raw_values)
            try:
                probs = loader.deep_model.predict(input_tensor, verbose=0)[0]
                
                if all(p < 0.5 for p in probs):
                    pred_label = "NORM"
                    conf = 100.0 - round(float(np.max(probs)) * 100, 2)
                else:
                    pred_label = AI_CLASSES[np.argmax(probs)]
                    conf = round(float(np.max(probs)) * 100, 2)
                
                ai_result = {
                    "prediction": pred_label,
                    "confidence": conf
                }
            except Exception as e:
                ai_result = {"prediction": f"AI Error: {str(e)}", "confidence": 0}

        # --- Random Forest ---
        rf_result = {"prediction": "Model Error"}
        if loader.classic_model is not None:
            try:
                feats = extract_features_for_rf(raw_values)
                pred = loader.classic_model.predict(feats)[0]
                
                confidence = 0
                if hasattr(loader.classic_model, "predict_proba"):
                    probs = loader.classic_model.predict_proba(feats)[0]
                    confidence = round(float(np.max(probs)) * 100, 2)
                    
                rf_result = {
                    "prediction": CLASSES[int(pred)],
                    "confidence": confidence
                }
            except Exception as e:
                rf_result = {"prediction": f"ML Error: {str(e)}", "confidence": 0}

        # --- RETURN FULL DATA ---
        return {
            "status": "success",
            "time": list(range(len(df))),  # THE FULL LENGTH
            "signals": {col: df[col].tolist() for col in cols},  # NO MORE [:1000] LIMIT
            "analysis": {
                "classic_ml": rf_result,
                "ai_model": ai_result
            }
        }
    except Exception as e:
        return {"error": "Failed", "details": str(e)}