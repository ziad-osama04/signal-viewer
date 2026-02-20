import numpy as np

class DroneModelLoader:
    """
    Improved Rule-Based Drone Sound Classifier.
    
    Drone audio has distinctive spectral characteristics:
    - High harmonic ratio (multiple rotor harmonics are the strongest indicator)
    - Low zero-crossing rate (smooth, tonal, low-frequency signal, not hissy)
    - Low to mid-range dominant frequency (blade passing frequency ~50-1000Hz)
    - Low spectral centroid and narrow bandwidth (concentrated energy)
    
    Uses a weighted scoring system for higher accuracy.
    """
    
    def __init__(self, model_path=None):
        # model_path is ignored for rule-based, kept for API compatibility
        pass

    def classify(self, features, *args, **kwargs):
        """
        Classify an audio sample based on its spectral features.
        Returns dict with label, confidence, score, and reasons.
        """
        score = 0.0
        reasons = []
        max_score = 6.5  # Total possible score based on weights

        centroid = features.get("spectral_centroid", 0)
        bandwidth = features.get("spectral_bandwidth", 0)
        zcr = features.get("zero_crossing_rate", 0)
        harmonic = features.get("harmonic_ratio", 0)
        dominant = features.get("dominant_freq", 0)

        # Check 1: Harmonic Ratio (Weight: 2.0) - Strongest indicator
        if harmonic > 0.10:
            score += 2.0
            reasons.append(f"Very strong harmonics ({harmonic:.3f})")
        elif harmonic > 0.04:
            score += 1.0
            reasons.append(f"Moderate harmonics ({harmonic:.3f})")

        # Check 2: Zero Crossing Rate (Weight: 1.5) - Drones are tonal, not noisy
        if zcr < 0.10:
            score += 1.5
            reasons.append(f"Low ZCR characteristic of tonal sounds ({zcr:.4f})")
        elif zcr < 0.18:
            score += 0.5
            reasons.append(f"Moderate ZCR ({zcr:.4f})")

        # Check 3: Dominant Frequency (Weight: 1.0) - Blade passing frequency range
        if 50 < dominant < 1200:
            score += 1.0
            reasons.append(f"Dominant freq in expected drone rotor range ({dominant:.0f} Hz)")
            
        # Check 4: Spectral Bandwidth (Weight: 1.0) - Concentrated energy
        if bandwidth < 3000:
            score += 1.0
            reasons.append(f"Narrow spectral bandwidth ({bandwidth:.0f} Hz)")
        elif bandwidth < 4500:
            score += 0.5
            reasons.append(f"Moderate spectral bandwidth ({bandwidth:.0f} Hz)")
            
        # Check 5: Spectral Centroid (Weight: 1.0) - Low frequency bias
        if centroid < 2500:
            score += 1.0
            reasons.append(f"Low spectral centroid ({centroid:.0f} Hz)")
        elif centroid < 4000:
            score += 0.5
            reasons.append(f"Moderate spectral centroid ({centroid:.0f} Hz)")

        # Calculate confidence
        confidence = score / max_score

        # Adjusted Thresholds for higher precision
        if confidence >= 0.70:
            label = "Drone Detected"
        elif confidence >= 0.45:
            label = "Possible Drone"
        else:
            label = "Not a Drone"

        return {
            "label": label,
            "confidence": round(float(confidence), 2),
            "score": f"{score:.1f}/{max_score:.1f}",
            "reasons": reasons if reasons else ["No strong drone features found"],
        }

    def classify_batch(self, features_list):
        """
        Classify multiple audio samples and rank by drone likelihood.
        features_list: list of (filename, features_dict) tuples.
        Returns sorted list with classification results.
        """
        results = []
        for filename, features in features_list:
            classification = self.classify(features)
            results.append({
                "filename": filename,
                "features": features,
                "classification": classification,
            })
        
        # Sort by confidence (highest first)
        results.sort(key=lambda x: x["classification"]["confidence"], reverse=True)
        return results
