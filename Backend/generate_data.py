import pandas as pd
import numpy as np

def generate_medical_data():
    # Settings
    duration = 10  # seconds
    fs = 200       # Sampling frequency (Hz)
    t = np.linspace(0, duration, duration * fs)

    # --- Channel 1: ECG Lead I (Clean Sinus Rhythm) ---
    # Simulating the "P-QRS-T" complex using combined sine waves
    # This represents a normal heartbeat at ~60 BPM
    ecg_clean = (1.0 * np.sin(2 * np.pi * 1.0 * t) +   # Main beat
                 0.5 * np.sin(2 * np.pi * 2.0 * t) +   # Harmonics
                 0.2 * np.sin(2 * np.pi * 4.0 * t))

    # --- Channel 2: ECG Lead II (Noisy/Abnormal) ---
    # Same heartbeat but with added "High Frequency Noise" (Muscle artifact)
    # This tests if your viewer can handle messy real-world data
    noise = np.random.normal(0, 0.15, len(t))
    ecg_noisy = ecg_clean + noise

    # --- Channel 3: Respiratory Signal (Slow Wave) ---
    # Breathing is much slower (approx 12 breaths/min = 0.2 Hz)
    # This tests if your viewer handles different frequency scales
    resp_signal = 0.8 * np.sin(2 * np.pi * 0.2 * t)

    # --- Create DataFrame ---
    df = pd.DataFrame({
        'Time': t,
        'ECG_Lead_I': ecg_clean,
        'ECG_Lead_II': ecg_noisy,
        'Respiration': resp_signal
    })

    # Save to file
    filename = "medical_multichannel.csv"
    df.to_csv(filename, index=False)
    print(f"✅ Success! Generated '{filename}' with {len(df)} rows.")
    print("Columns: Time, ECG_Lead_I, ECG_Lead_II, Respiration")

if __name__ == "__main__":
    generate_medical_data()