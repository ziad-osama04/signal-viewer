import numpy as np


def extract_features(sig, sr):
    """
    Extract spectral features from an audio signal.
    All computed with pure numpy/scipy — no librosa dependency.
    
    Returns dict with: spectral_centroid, spectral_bandwidth,
    spectral_rolloff, zero_crossing_rate, dominant_freq, energy, harmonic_ratio.
    """
    # FFT
    n = len(sig)
    fft_vals = np.fft.rfft(sig)
    magnitudes = np.abs(fft_vals)
    frequencies = np.fft.rfftfreq(n, d=1.0 / sr)

    # Normalize magnitudes to probability-like distribution
    mag_sum = np.sum(magnitudes)
    if mag_sum == 0:
        mag_sum = 1e-10
    mag_norm = magnitudes / mag_sum

    # --- Spectral Centroid ---
    # Weighted average of frequencies
    spectral_centroid = float(np.sum(frequencies * mag_norm))

    # --- Spectral Bandwidth ---
    # Weighted std of frequencies around the centroid
    spectral_bandwidth = float(
        np.sqrt(np.sum(mag_norm * (frequencies - spectral_centroid) ** 2))
    )

    # --- Spectral Rolloff (85%) ---
    # Frequency below which 85% of the total energy is contained
    cumulative = np.cumsum(magnitudes)
    rolloff_threshold = 0.85 * cumulative[-1]
    rolloff_idx = np.searchsorted(cumulative, rolloff_threshold)
    spectral_rolloff = float(frequencies[min(rolloff_idx, len(frequencies) - 1)])

    # --- Zero Crossing Rate ---
    zero_crossings = np.sum(np.abs(np.diff(np.sign(sig))) > 0)
    zero_crossing_rate = float(zero_crossings / len(sig))

    # --- Dominant Frequency ---
    dominant_idx = np.argmax(magnitudes[1:]) + 1  # Skip DC
    dominant_freq = float(frequencies[dominant_idx])

    # --- Energy ---
    energy = float(np.sum(sig ** 2) / len(sig))

    # --- Harmonic Ratio (simplified) ---
    # Ratio of energy in harmonic peaks vs total energy
    # Find fundamental frequency, check for harmonics
    fundamental = dominant_freq
    harmonic_energy = 0
    total_energy = np.sum(magnitudes ** 2)

    if fundamental > 0 and total_energy > 0:
        for h in range(1, 6):  # Check first 5 harmonics
            target_freq = fundamental * h
            # Find closest frequency bin
            idx = np.argmin(np.abs(frequencies - target_freq))
            # Sum energy in a small window around the harmonic
            window = slice(max(0, idx - 3), min(len(magnitudes), idx + 4))
            harmonic_energy += np.sum(magnitudes[window] ** 2)

        harmonic_ratio = float(harmonic_energy / total_energy)
    else:
        harmonic_ratio = 0.0

    return {
        "spectral_centroid": round(spectral_centroid, 2),
        "spectral_bandwidth": round(spectral_bandwidth, 2),
        "spectral_rolloff": round(spectral_rolloff, 2),
        "zero_crossing_rate": round(zero_crossing_rate, 6),
        "dominant_freq": round(dominant_freq, 2),
        "energy": round(energy, 8),
        "harmonic_ratio": round(harmonic_ratio, 4),
    }
