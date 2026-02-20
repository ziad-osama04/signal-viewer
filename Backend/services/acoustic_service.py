import numpy as np
import os
import sys
import traceback

# Fix import paths
sys.path.append(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from utils.file_loader import load_audio
from core.signal_processor import SignalProcessor
from core.statistics import calculate_stats
from core.feature_extraction import extract_features
from core.doppler_math import (
    simulate_doppler_pass,
    estimate_velocity_from_doppler,
)
from models.drone_model_loader import DroneModelLoader


# Dataset paths — datasets/ is at the project root (sibling of Backend/)
BACKEND_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
PROJECT_ROOT = os.path.dirname(BACKEND_DIR)
DOPPLER_DIR = os.path.join(PROJECT_ROOT, "datasets", "Doppler")
DRONE_DIR = os.path.join(PROJECT_ROOT, "datasets", "Drone")

processor = SignalProcessor()
drone_classifier = DroneModelLoader()


class AcousticService:
    """Service layer for all acoustic signal processing."""

    # =============================================
    # PART 1: Doppler Simulation
    # =============================================
    def generate_doppler(self, frequency, velocity):
        """
        Generate synthetic Doppler pass sound.
        Args:
            frequency: Horn frequency in Hz
            velocity: Car speed in km/h
        Returns dict with waveform + freq curve data.
        """
        try:
            result = simulate_doppler_pass(
                f_source=frequency,
                v_car_kmh=velocity,
                sr=44100,
                duration=6.0,
            )
            return result
        except Exception as e:
            print(f"❌ Doppler simulation error: {e}")
            traceback.print_exc()
            return {"error": str(e)}

    # =============================================
    # PART 2: Real Doppler Analysis
    # =============================================
    def list_doppler_datasets(self):
        """List available Doppler WAV files."""
        if not os.path.exists(DOPPLER_DIR):
            return {"files": [], "error": f"Doppler dataset folder not found: {DOPPLER_DIR}"}

        files = []
        for f in sorted(os.listdir(DOPPLER_DIR)):
            if f.lower().endswith(('.wav', '.mp3')):
                # Try to parse actual speed from filename (e.g., "KiaSportage_85.wav")
                actual_speed = self._parse_speed_from_filename(f)
                files.append({
                    "filename": f,
                    "actual_speed_kmh": actual_speed,
                    "path": f"Doppler/{f}",
                })
        return {"files": files, "count": len(files)}

    def analyze_doppler(self, file_path):
        """
        Analyze a real Doppler audio file.
        Estimates velocity + frequency using classic algorithm.
        """
        try:
            sig, sr = load_audio(file_path)
            print(f"✅ Loaded audio: {len(sig)} samples, {sr} Hz, {len(sig)/sr:.2f}s")

            # Normalize
            sig = processor.normalize(sig)

            # 1. Waveform (downsampled for frontend)
            ds = max(1, len(sig) // 3000)
            time_axis = np.arange(len(sig)) / sr
            waveform_time = time_axis[::ds].tolist()
            waveform_data = sig[::ds].tolist()

            # 2. Spectrogram
            spec_times, spec_freqs, spec_power = processor.compute_spectrogram(sig, sr)
            # Downsample spectrogram for frontend
            freq_ds = max(1, len(spec_freqs) // 200)
            time_ds = max(1, len(spec_times) // 300)

            # 3. FFT
            fft_freqs, fft_mags = processor.compute_fft(sig, sr)
            fft_ds = max(1, len(fft_freqs) // 1000)

            # 4. Doppler estimation
            doppler_result = estimate_velocity_from_doppler(sig, sr)

            # 5. Statistics
            stats = calculate_stats(sig, sr)

            # 6. Parse actual speed from filename for comparison
            filename = os.path.basename(file_path)
            actual_speed = self._parse_speed_from_filename(filename)

            return {
                "waveform": {
                    "time": waveform_time,
                    "amplitude": waveform_data,
                },
                "spectrogram": {
                    "times": spec_times[::time_ds].tolist(),
                    "frequencies": spec_freqs[::freq_ds].tolist(),
                    "power": spec_power[::freq_ds, ::time_ds].tolist(),
                },
                "fft": {
                    "frequencies": fft_freqs[::fft_ds].tolist(),
                    "magnitudes": fft_mags[::fft_ds].tolist(),
                },
                "doppler": doppler_result,
                "statistics": stats,
                "actual_speed_kmh": actual_speed,
                "filename": filename,
            }

        except Exception as e:
            print(f"❌ Doppler analysis error: {e}")
            traceback.print_exc()
            return {"error": str(e), "filename": os.path.basename(file_path)}

    # =============================================
    # PART 3: Drone Detection
    # =============================================
    def list_drone_datasets(self):
        """List available Drone/bird/engine audio files."""
        if not os.path.exists(DRONE_DIR):
            return {"files": [], "error": f"Drone dataset folder not found: {DRONE_DIR}"}

        files = []
        for f in sorted(os.listdir(DRONE_DIR)):
            if f.lower().endswith(('.wav', '.mp3', '.ogg', '.flac')):
                files.append({
                    "filename": f,
                    "path": f"Drone/{f}",
                })
        return {"files": files, "count": len(files)}

    def analyze_drone_file(self, file_path):
        """Analyze a single audio file for drone characteristics."""
        try:
            sig, sr = load_audio(file_path)
            sig = processor.normalize(sig)

            # Limit to first 10 seconds for efficiency
            max_samples = sr * 10
            if len(sig) > max_samples:
                sig = sig[:max_samples]

            features = extract_features(sig, sr)
            stats = calculate_stats(sig, sr)
            classification = drone_classifier.classify(features)

            # Waveform (downsampled)
            ds = max(1, len(sig) // 2000)
            time_axis = np.arange(len(sig)) / sr

            # FFT
            fft_freqs, fft_mags = processor.compute_fft(sig, sr)
            fft_ds = max(1, len(fft_freqs) // 500)

            return {
                "filename": os.path.basename(file_path),
                "features": features,
                "statistics": stats,
                "classification": classification,
                "waveform": {
                    "time": time_axis[::ds].tolist(),
                    "amplitude": sig[::ds].tolist(),
                },
                "fft": {
                    "frequencies": fft_freqs[::fft_ds].tolist(),
                    "magnitudes": fft_mags[::fft_ds].tolist(),
                },
            }
        except Exception as e:
            print(f"❌ Drone analysis error for {file_path}: {e}")
            traceback.print_exc()
            return {
                "filename": os.path.basename(file_path),
                "error": str(e),
                "classification": {"label": "Error", "confidence": 0},
            }

    def detect_drone_batch(self):
        """Analyze all drone dataset files and identify drones."""
        if not os.path.exists(DRONE_DIR):
            return {"error": "Drone dataset folder not found", "results": []}

        results = []
        for f in sorted(os.listdir(DRONE_DIR)):
            if f.lower().endswith(('.wav', '.mp3', '.ogg', '.flac')):
                path = os.path.join(DRONE_DIR, f)
                result = self.analyze_drone_file(path)
                results.append(result)

        # Sort by confidence
        results.sort(
            key=lambda x: x.get("classification", {}).get("confidence", 0),
            reverse=True,
        )

        return {
            "results": results,
            "total_files": len(results),
            "detected_drones": [
                r["filename"] for r in results
                if r.get("classification", {}).get("label") in ("Drone Detected", "Possible Drone")
            ],
        }

    # =============================================
    # Helpers
    # =============================================
    @staticmethod
    def _parse_speed_from_filename(filename):
        """
        Try to parse actual speed from filename.
        Examples: 'KiaSportage_85.wav' → 85, 'car_320Hz_155kmh.wav' → 155
        """
        import re
        name = os.path.splitext(filename)[0]

        # Pattern: _{number}kmh or _{number}.wav
        match = re.search(r'_(\d+)kmh', name, re.IGNORECASE)
        if match:
            return int(match.group(1))

        # Pattern: CarName_{number} (last number = speed)
        match = re.search(r'_(\d+)$', name)
        if match:
            speed = int(match.group(1))
            if speed < 500:  # Reasonable speed
                return speed

        return None
