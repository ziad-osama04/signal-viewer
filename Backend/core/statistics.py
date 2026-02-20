import numpy as np


def calculate_stats(data, sr=None):
    """
    Calculate statistical properties of a signal.
    Returns a dict with mean, std, rms, min, max, peak_to_peak, snr, duration.
    """
    data = np.array(data, dtype=float)

    mean_val = float(np.mean(data))
    std_val = float(np.std(data))
    rms_val = float(np.sqrt(np.mean(data ** 2)))
    min_val = float(np.min(data))
    max_val = float(np.max(data))
    peak_to_peak = float(max_val - min_val)

    # SNR estimation (signal power / noise floor estimate)
    signal_power = np.mean(data ** 2)
    # Estimate noise as the quietest 10% of the signal
    sorted_power = np.sort(np.abs(data))
    noise_floor = np.mean(sorted_power[:max(1, len(sorted_power) // 10)] ** 2)
    snr = float(10 * np.log10(signal_power / (noise_floor + 1e-10)))

    duration = float(len(data) / sr) if sr else None

    stats = {
        "mean": round(mean_val, 6),
        "std": round(std_val, 6),
        "rms": round(rms_val, 6),
        "min": round(min_val, 6),
        "max": round(max_val, 6),
        "peak_to_peak": round(peak_to_peak, 6),
        "snr_db": round(snr, 2),
        "num_samples": int(len(data)),
    }

    if duration is not None:
        stats["duration_s"] = round(duration, 3)
    if sr is not None:
        stats["sample_rate"] = int(sr)

    return stats
