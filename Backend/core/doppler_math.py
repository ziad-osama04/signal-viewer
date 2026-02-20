import numpy as np
from core.signal_processor import SignalProcessor


# Speed of sound in air (m/s)
V_SOUND = 343.0


def simulate_doppler_pass(f_source, v_car_kmh, sr=44100, duration=6.0):
    """
    Simulate the sound of a car passing a stationary listener.

    The car travels along a straight road. The listener stands at a
    perpendicular distance d from the road. As the car approaches then
    recedes, the observed frequency shifts due to the Doppler effect.

    Args:
        f_source: Horn frequency in Hz (e.g. 440)
        v_car_kmh: Car speed in km/h
        sr: Sample rate
        duration: Total duration in seconds

    Returns:
        dict with: signal, sr, time, freq_over_time
    """
    v_car = v_car_kmh / 3.6  # Convert to m/s

    # Road geometry: car moves along x-axis, listener at (0, d)
    d = 10.0  # Perpendicular distance from road (meters)

    # Car position over time: centered so it passes at t = duration/2
    t = np.linspace(0, duration, int(sr * duration), endpoint=False)
    t_mid = duration / 2.0

    # Car x-position
    x_car = v_car * (t - t_mid)

    # Distance from car to listener
    distance = np.sqrt(x_car ** 2 + d ** 2)

    # Radial velocity component (towards/away from listener)
    v_radial = v_car * x_car / distance

    # Doppler-shifted frequency
    f_observed = f_source * V_SOUND / (V_SOUND + v_radial)

    # Generate the signal with instantaneous frequency
    phase = 2 * np.pi * np.cumsum(f_observed) / sr
    signal = np.sin(phase)

    # Add amplitude falloff with distance (inverse square law)
    amplitude = d / distance
    signal = signal * amplitude

    # Normalize
    signal = signal / (np.max(np.abs(signal)) + 1e-10)

    # Downsample for frontend (keep ~2000 points for plotting)
    ds_factor = max(1, len(t) // 2000)

    return {
        "signal": signal.tolist(),
        "sr": sr,
        "time": t[::ds_factor].tolist(),
        "waveform": signal[::ds_factor].tolist(),
        "freq_over_time": f_observed[::ds_factor].tolist(),
        "time_freq": t[::ds_factor].tolist(),
        "params": {
            "f_source": f_source,
            "v_car_kmh": v_car_kmh,
            "v_car_ms": round(v_car, 2),
            "duration": duration,
            "sr": sr,
        },
    }


def _scan_bands(sig, sr, nperseg, candidates):
    """
    Run band-scanning centroid tracking at a given STFT resolution.
    Returns (best_result_dict, best_score, times_array).
    """
    from scipy.ndimage import median_filter, uniform_filter1d

    processor = SignalProcessor()

    noverlap = int(nperseg * 0.875)
    times, frequencies, power = processor.compute_stft(
        sig, sr, nperseg=nperseg, noverlap=noverlap,
    )

    best_result = None
    best_score = -1.0

    for flow, fhigh in candidates:
        if flow >= fhigh:
            continue

        mask = (frequencies >= flow) & (frequencies <= fhigh)
        if not np.any(mask):
            continue

        masked_freqs = frequencies[mask]
        masked_power = power[mask, :]

        # Centroid Tracking (power^4 weighted — soft-argmax)
        weights = masked_power ** 4
        weight_sums = np.sum(weights, axis=0)
        weight_sums[weight_sums == 0] = 1e-10
        centroid = np.sum(masked_freqs[:, None] * weights, axis=0) / weight_sums

        # Smoothing (original parameters)
        n_frames = len(centroid)
        if n_frames < 10:
            continue

        kern_med = max(5, n_frames // 10)
        if kern_med % 2 == 0:
            kern_med += 1
        smooth = median_filter(centroid, size=kern_med)

        kern_avg = max(3, n_frames // 5)
        smooth = uniform_filter1d(smooth, size=kern_avg)

        # Active region detection
        energy_profile = weight_sums
        max_energy = np.max(energy_profile)
        threshold = 0.001 * max_energy

        active_indices = np.where(energy_profile > threshold)[0]

        if len(active_indices) < 10:
            start_idx, end_idx = 0, n_frames
        else:
            buffer = 5
            start_idx = max(0, active_indices[0] - buffer)
            end_idx = min(n_frames, active_indices[-1] + buffer)

        active_smooth = smooth[start_idx:end_idx]
        n_active = len(active_smooth)

        if n_active < 10:
            active_smooth = smooth
            n_active = n_frames

        window_size = max(1, n_active // 5)
        f_start = float(np.median(active_smooth[:window_size]))
        f_end = float(np.median(active_smooth[-window_size:]))

        freq_drop = f_start - f_end

        if freq_drop <= 0:
            score = 0.0
        else:
            diffs = np.diff(smooth)
            monotonicity = np.mean(diffs < 0)
            relative_drop = freq_drop / (f_start + 1e-5)
            score = relative_drop * (monotonicity ** 3)

        if score > best_score:
            best_score = score
            best_result = {
                "smooth": smooth,
                "f_approach": f_start,
                "f_recede": f_end,
                "band": (flow, fhigh),
            }

    return best_result, best_score, times


def estimate_velocity_from_doppler(sig, sr, freq_min=50, freq_max=5000):
    """
    Estimate the velocity of a passing car from a Doppler-shifted audio
    recording using Multi-Band Spectral Centroid Tracking.

    Algorithm:
    1.  Compute STFT at primary high resolution (16384 window).
    2.  Define candidate frequency bands (fixed + around dominant peak).
    3.  For each band, track spectral centroid (power^4) and score for Doppler.
    4.  If primary resolution score is low, try alternative resolutions.
    5.  Estimate velocity from approach/recede frequency plateaux.

    The multi-resolution approach helps because:
    - Larger windows (16384) give better frequency resolution for slow objects.
    - Smaller windows (2048-4096) give better time resolution for fast objects.
    """
    processor = SignalProcessor()

    # Global dominant freq for candidate band generation
    fft_freqs, fft_mags = processor.compute_fft(sig, sr)
    valid_mask = fft_freqs > 50
    if np.any(valid_mask):
        dom_idx = np.argmax(fft_mags[valid_mask])
        f_dominant = float(fft_freqs[valid_mask][dom_idx])
    else:
        f_dominant = 1000.0

    # Candidate frequency bands
    candidates = [
        (50, 200),
        (200, 500),
        (500, 1000),
        (1000, 2000),
        (2000, 5000),
        (max(50, f_dominant * 0.7), min(5000, f_dominant * 1.3)),
        (max(50, f_dominant * 0.4), min(5000, f_dominant * 4.0)),
    ]

    # Primary resolution: highest feasible
    primary_nperseg = min(16384, len(sig) // 4)
    primary_nperseg = max(primary_nperseg, 2048)

    best_result, best_score, best_times = _scan_bands(
        sig, sr, primary_nperseg, candidates,
    )

    # If primary score is low, try alternative resolutions as fallback.
    # Good Doppler signals at 16384 typically score > 0.02.
    if best_score < 0.02:
        for alt_nperseg in [4096, 2048, 8192]:
            if alt_nperseg == primary_nperseg:
                continue
            if alt_nperseg > len(sig) // 4:
                continue

            alt_result, alt_score, alt_times = _scan_bands(
                sig, sr, alt_nperseg, candidates,
            )

            if alt_result is not None and alt_score > best_score:
                best_result = alt_result
                best_score = alt_score
                best_times = alt_times

    # FINAL CALCULATION
    if not best_result or best_score <= 0.0001:
        return _error_result("No clear Doppler signature found in any band")

    f_app = best_result["f_approach"]
    f_rec = best_result["f_recede"]
    smooth_curve = best_result["smooth"]
    best_low, best_high = best_result["band"]
    times = best_times

    f_sum = f_app + f_rec
    f_diff = f_app - f_rec

    # Threshold check (0.5% relative shift minimum)
    if f_diff / f_sum < 0.005:
        return _error_result("Doppler shift too small (stationary source?)")

    v_ms = V_SOUND * f_diff / f_sum
    v_kmh = v_ms * 3.6
    f_est = 2 * f_app * f_rec / f_sum

    # Sanity check
    if v_kmh > 600:
        return _error_result("Estimated velocity {:.0f} km/h unrealistic".format(v_kmh))

    # Ensure output arrays are aligned
    n_out = min(len(smooth_curve), len(times))
    ds = max(1, n_out // 500)

    return {
        "estimated_velocity_kmh": round(float(v_kmh), 1),
        "estimated_velocity_ms": round(float(v_ms), 2),
        "estimated_frequency_hz": round(float(f_est), 1),
        "approach_freq_hz": round(float(f_app), 1),
        "recede_freq_hz": round(float(f_rec), 1),
        "dominant_freq_hz": round(float(f_dominant), 1),
        "tracking_band": [round(best_low, 1), round(best_high, 1)],
        "doppler_score": round(float(best_score), 4),
        "freq_over_time": smooth_curve[:n_out:ds].tolist(),
        "freq_time_axis": times[:n_out:ds].tolist(),
        "algorithm": "Multi-Band Spectral Centroid Tracking (Adaptive Resolution)",
    }


def detect_approach_vs_recede(sig, sr):
    """
    Split signal into approach and recede phases based on the
    frequency transition point (highest frequency = closest point).
    """
    processor = SignalProcessor()
    nperseg = min(4096, len(sig) // 4)
    times, frequencies, power = processor.compute_stft(sig, sr, nperseg=nperseg)
    dominant_freqs = processor.track_dominant_frequency(times, frequencies, power)

    transition_idx = np.argmax(dominant_freqs)
    transition_time = float(times[transition_idx])
    split_sample = int(transition_time * sr)

    return {
        "transition_time": transition_time,
        "approach_signal_length": split_sample,
        "recede_signal_length": len(sig) - split_sample,
    }


def _error_result(message):
    """Return a safe error dict."""
    return {
        "error": message,
        "estimated_velocity_kmh": 0,
        "estimated_velocity_ms": 0,
        "estimated_frequency_hz": 0,
        "approach_freq_hz": 0,
        "recede_freq_hz": 0,
        "freq_over_time": [],
        "freq_time_axis": [],
        "algorithm": "Multi-Band Spectral Centroid Tracking (Adaptive Resolution)",
    }
