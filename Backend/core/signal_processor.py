import numpy as np
from scipy import signal as scipy_signal


class SignalProcessor:
    """Core signal processing utilities for audio analysis."""

    @staticmethod
    def compute_fft(sig, sr):
        """
        Compute the FFT of a signal.
        Returns (frequencies, magnitudes) — only positive half.
        """
        n = len(sig)
        fft_vals = np.fft.rfft(sig)
        magnitudes = np.abs(fft_vals) * 2.0 / n
        frequencies = np.fft.rfftfreq(n, d=1.0 / sr)
        return frequencies, magnitudes

    @staticmethod
    def compute_stft(sig, sr, nperseg=1024, noverlap=None):
        """
        Compute Short-Time Fourier Transform.
        Returns (times, frequencies, power_matrix).
        """
        if noverlap is None:
            noverlap = nperseg // 2

        frequencies, times, Zxx = scipy_signal.stft(
            sig, fs=sr, nperseg=nperseg, noverlap=noverlap
        )
        power = np.abs(Zxx)
        return times, frequencies, power

    @staticmethod
    def compute_spectrogram(sig, sr, nperseg=1024, noverlap=None):
        """
        Compute spectrogram (power spectral density over time).
        Returns (times, frequencies, power_db).
        """
        if noverlap is None:
            noverlap = nperseg // 2

        frequencies, times, Sxx = scipy_signal.spectrogram(
            sig, fs=sr, nperseg=nperseg, noverlap=noverlap
        )
        # Convert to dB scale, clamp minimum
        power_db = 10 * np.log10(Sxx + 1e-10)
        return times, frequencies, power_db

    @staticmethod
    def bandpass_filter(sig, sr, low_freq, high_freq, order=5):
        """
        Apply a Butterworth bandpass filter.
        """
        nyquist = sr / 2.0
        low = max(low_freq / nyquist, 0.001)
        high = min(high_freq / nyquist, 0.999)
        sos = scipy_signal.butter(order, [low, high], btype='band', output='sos')
        return scipy_signal.sosfilt(sos, sig)

    @staticmethod
    def lowpass_filter(sig, sr, cutoff, order=5):
        """Apply a Butterworth lowpass filter."""
        nyquist = sr / 2.0
        normalized = min(cutoff / nyquist, 0.999)
        sos = scipy_signal.butter(order, normalized, btype='low', output='sos')
        return scipy_signal.sosfilt(sos, sig)

    @staticmethod
    def normalize(sig):
        """Normalize signal to [-1, 1] range."""
        max_val = np.max(np.abs(sig))
        if max_val == 0:
            return sig
        return sig / max_val

    @staticmethod
    def downsample(sig, factor):
        """Downsample signal by a factor (for frontend rendering)."""
        return sig[::factor]

    @staticmethod
    def track_dominant_frequency(times, frequencies, power, freq_min=50, freq_max=5000):
        """
        Track the dominant frequency over time from STFT data.
        Returns array of dominant frequencies at each time step.
        """
        # Mask frequencies outside range
        freq_mask = (frequencies >= freq_min) & (frequencies <= freq_max)
        masked_power = power[freq_mask, :]
        masked_freqs = frequencies[freq_mask]

        dominant_indices = np.argmax(masked_power, axis=0)
        dominant_freqs = masked_freqs[dominant_indices]
        return dominant_freqs

    @staticmethod
    def parabolic_peak_interp(magnitudes, peak_idx):
        """
        Parabolic interpolation around a spectral peak for sub-bin accuracy.
        Returns fractional bin offset from peak_idx.
        """
        if peak_idx <= 0 or peak_idx >= len(magnitudes) - 1:
            return 0.0
        alpha = magnitudes[peak_idx - 1]
        beta = magnitudes[peak_idx]
        gamma = magnitudes[peak_idx + 1]
        denom = alpha - 2.0 * beta + gamma
        if abs(denom) < 1e-10:
            return 0.0
        return 0.5 * (alpha - gamma) / denom

    @staticmethod
    def track_peak_frequency(times, frequencies, power, freq_min=50, freq_max=5000):
        """
        Track the peak frequency over time from STFT data using
        parabolic interpolation for sub-bin accuracy.
        Returns array of peak frequencies at each time step.
        """
        freq_mask = (frequencies >= freq_min) & (frequencies <= freq_max)
        masked_power = power[freq_mask, :]
        masked_freqs = frequencies[freq_mask]

        if len(masked_freqs) < 3:
            return np.full(power.shape[1], (freq_min + freq_max) / 2)

        n_frames = power.shape[1]
        peak_freqs = np.zeros(n_frames)
        freq_resolution = masked_freqs[1] - masked_freqs[0] if len(masked_freqs) > 1 else 1.0

        for i in range(n_frames):
            frame = masked_power[:, i]
            peak_idx = np.argmax(frame)
            # Parabolic interpolation
            offset = SignalProcessor.parabolic_peak_interp(frame, peak_idx)
            peak_freqs[i] = masked_freqs[peak_idx] + offset * freq_resolution

        return peak_freqs
