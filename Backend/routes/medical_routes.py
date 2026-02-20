from fastapi import APIRouter, UploadFile, File, Form
from typing import Optional
import shutil
import os
import sys
import traceback
import json
import numpy as np
import struct

sys.path.append(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
from services import medical_service

router = APIRouter()

UPLOAD_DIR = "../Backend/uploads"

# ─────────────────────────────────────────────────────────────────────────────
# Existing CSV endpoint — unchanged
# ─────────────────────────────────────────────────────────────────────────────
@router.post("/process")
async def process_medical(file: UploadFile = File(...)):
    os.makedirs(UPLOAD_DIR, exist_ok=True)
    file_path = f"{UPLOAD_DIR}/{file.filename}"
    try:
        with open(file_path, "wb") as buffer:
            shutil.copyfileobj(file.file, buffer)
        print(f"📄 Analyzing CSV: {file_path}")
        result = medical_service.analyze_medical_signal(file_path)
        return result
    except Exception as e:
        error_msg = traceback.format_exc()
        print("❌ CRASH:\n", error_msg)
        return {"error": "Backend Crash", "details": str(e), "trace": error_msg.split('\n')[-2]}


# ─────────────────────────────────────────────────────────────────────────────
# NEW — WFDB endpoint
# Accepts multipart/form-data:
#   dat_file  : binary .dat (UploadFile)
#   meta      : JSON string — {nLeads, fs, nSamples, leadNames, gains, baselines}
#   xyz_file  : optional .xyz plaintext (UploadFile)
# Returns same shape as /process so the frontend works identically
# ─────────────────────────────────────────────────────────────────────────────
@router.post("/process-wfdb")
async def process_wfdb(
    dat_file: UploadFile = File(...),
    meta:     str        = Form(...),           # JSON string — NOT Form type annotation
    xyz_file: Optional[UploadFile] = File(None)
):
    os.makedirs(UPLOAD_DIR, exist_ok=True)
    try:
        # ── 1. Parse meta JSON ────────────────────────────────────────────────
        try:
            m = json.loads(meta)
        except Exception:
            return {"error": "Invalid meta", "details": "meta must be valid JSON"}

        n_leads    = int(m.get("nLeads",   1))
        fs         = float(m.get("fs",     360))
        n_samp_h   = int(m.get("nSamples", 0))
        lead_names = m.get("leadNames", [f"Lead{i+1}" for i in range(n_leads)])
        gains      = m.get("gains",     [200.0] * n_leads)
        baselines  = m.get("baselines", [0]     * n_leads)

        # ── 2. Read & decode .dat (WFDB format 16 = 16-bit LE multiplexed) ───
        dat_bytes       = await dat_file.read()
        total_bytes     = len(dat_bytes)
        bytes_per_frame = n_leads * 2

        if bytes_per_frame == 0:
            return {"error": "nLeads is 0", "details": "Check .hea file"}

        n_samples = (n_samp_h if n_samp_h > 0 else total_bytes // bytes_per_frame)
        n_samples = min(n_samples, total_bytes // bytes_per_frame)

        if n_samples == 0:
            return {"error": "Empty .dat", "details": f"bytes={total_bytes} nLeads={n_leads}"}

        # Decode
        raw = struct.unpack_from(f"<{n_samples * n_leads}h", dat_bytes, 0)
        arr = np.array(raw, dtype=np.float32).reshape(n_samples, n_leads)

        # Apply gain / baseline → physical units (mV)
        for ch in range(n_leads):
            g = gains[ch] if gains[ch] != 0 else 200.0
            arr[:, ch] = (arr[:, ch] - baselines[ch]) / g

        # ── 3. Optionally read .xyz ───────────────────────────────────────────
        if xyz_file is not None:
            try:
                xyz_text = (await xyz_file.read()).decode("utf-8", errors="replace")
                xyz_rows = [
                    list(map(float, row.split()))
                    for row in xyz_text.strip().splitlines()
                    if row.strip()
                ]
                xyz_arr = np.array(xyz_rows, dtype=np.float32)
                print(f"📐 XYZ shape: {xyz_arr.shape}  (stored, not visualized)")
            except Exception as e:
                print(f"⚠️  Could not parse .xyz: {e}")

        # ── 4. Write temporary CSV → reuse existing medical_service ──────────
        import csv, tempfile
        with tempfile.NamedTemporaryFile(
            mode="w", suffix=".csv", delete=False,
            dir=UPLOAD_DIR, newline=""
        ) as tmp:
            tmp_path = tmp.name
            writer = csv.writer(tmp)
            writer.writerow(lead_names)
            for s in range(n_samples):
                writer.writerow([float(arr[s, ch]) for ch in range(n_leads)])

        print(f"🫀 Analyzing WFDB → temp CSV: {tmp_path}")
        analysis = medical_service.analyze_medical_signal(tmp_path)

        try:
            os.remove(tmp_path)
        except Exception:
            pass

        # Build signals dict for frontend viewer
        signals = {name: arr[:, i].tolist() for i, name in enumerate(lead_names)}
        time    = [round(i / fs, 6) for i in range(n_samples)]

        return {
            **analysis,
            "signals": signals,
            "time":    time,
        }

    except Exception as e:
        error_msg = traceback.format_exc()
        print("❌ WFDB CRASH:\n", error_msg)
        return {"error": "Backend Crash", "details": str(e), "trace": error_msg.split('\n')[-2]}