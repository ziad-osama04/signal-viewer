import pandas as pd
import numpy as np
import os


def load_csv(file_path):
    """Load a CSV file. Returns (DataFrame, time_col, signal_cols)."""
    try:
        if not os.path.exists(file_path):
            raise FileNotFoundError(f"File not found: {file_path}")
        df = pd.read_csv(file_path)
        if df.empty:
            raise ValueError("CSV file is empty")
        time_col = df.columns[0]
        signal_cols = df.columns[1:].tolist()
        if len(signal_cols) == 0:
            raise ValueError("CSV file must have at least one signal column")
        df = df.fillna(0)
        df = df.astype(float)
        return df, time_col, signal_cols
    except Exception as e:
        raise ValueError(f"Failed to load CSV file: {str(e)}")


def load_audio(file_path):
    """
    Load an audio file (WAV or MP3).
    Returns (signal_mono, sample_rate) as numpy array + int.
    """
    ext = os.path.splitext(file_path)[1].lower()

    if ext == '.wav':
        return _load_wav(file_path)
    elif ext in ('.mp3', '.mp4', '.ogg', '.flac'):
        return _load_with_ffmpeg(file_path)
    else:
        raise ValueError(f"Unsupported audio format: {ext}")



def _load_wav(file_path):
    """Load WAV using scipy."""
    from scipy.io import wavfile
    sr, data = wavfile.read(file_path)

    # Convert to float64 normalized to [-1, 1]
    if data.dtype == np.int16:
        data = data.astype(np.float64) / 32768.0
    elif data.dtype == np.int32:
        data = data.astype(np.float64) / 2147483648.0
    elif data.dtype == np.uint8:
        data = (data.astype(np.float64) - 128) / 128.0
    else:
        data = data.astype(np.float64)

    # Downmix stereo to mono
    if data.ndim == 2:
        data = np.mean(data, axis=1)

    return data, sr



def _load_with_ffmpeg(file_path):
    """
    Load MP3/OGG/FLAC using ffmpeg subprocess (via imageio-ffmpeg).
    Converts to temporary WAV, then loads with scipy.
    """
    import subprocess
    import tempfile

    # Get ffmpeg binary from imageio-ffmpeg
    try:
        import imageio_ffmpeg
        ffmpeg_exe = imageio_ffmpeg.get_ffmpeg_exe()
    except ImportError:
        raise ImportError(
            "imageio-ffmpeg is required for MP3 loading. "
            "Install it with: pip install imageio-ffmpeg"
        )

    # Convert to temporary WAV file
    tmp_wav = tempfile.mktemp(suffix='.wav')
    try:
        cmd = [
            ffmpeg_exe,
            '-y',               # overwrite
            '-i', file_path,    # input
            '-ac', '1',         # mono
            '-ar', '44100',     # sample rate
            '-sample_fmt', 's16',
            tmp_wav
        ]
        result = subprocess.run(
            cmd,
            stdout=subprocess.PIPE,
            stderr=subprocess.PIPE,
            timeout=30,
            creationflags=subprocess.CREATE_NO_WINDOW if hasattr(subprocess, 'CREATE_NO_WINDOW') else 0,
        )
        if result.returncode != 0:
            err = result.stderr.decode('utf-8', errors='replace')[-300:]
            raise RuntimeError(f"ffmpeg failed: {err}")

        return _load_wav(tmp_wav)
    finally:
        if os.path.exists(tmp_wav):
            try:
                os.remove(tmp_wav)
            except OSError:
                pass