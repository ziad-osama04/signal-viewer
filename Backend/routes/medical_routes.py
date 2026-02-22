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
# Accepts multi-part file uploads for .hea, .dat, .xyz
# Returns same shape as /process so the frontend works identically
# ─────────────────────────────────────────────────────────────────────────────
@router.post("/process-wfdb")
async def process_wfdb(
    hea_file: UploadFile = File(...),
    dat_file: UploadFile = File(...),
    xyz_file: Optional[UploadFile] = File(None)
):
    os.makedirs(UPLOAD_DIR, exist_ok=True)
    try:
        import wfdb
        
        # ── 1. Safely parse and rewrite the .hea file ─────────────────────────
        import tempfile
        import uuid
        
        session_id = uuid.uuid4().hex[:8]
        record_name = f"rec_{session_id}"
        
        hea_content = (await hea_file.read()).decode("utf-8", errors="ignore")
        new_hea_lines = []
        needs_xyz = False
        first_line_done = False
        
        for line in hea_content.splitlines():
            if not line.strip() or line.startswith('#'):
                new_hea_lines.append(line)
                continue
                
            parts = line.split()
            if not first_line_done:
                parts[0] = record_name
                first_line_done = True
            else:
                if ".dat" in parts[0]:
                    parts[0] = f"{record_name}.dat"
                elif ".xyz" in parts[0]:
                    parts[0] = f"{record_name}.xyz"
                    needs_xyz = True
            new_hea_lines.append(" ".join(parts))
            
        if needs_xyz and xyz_file is None:
            return {
                "error": "Missing XYZ File",
                "details": "This specific WFDB record expects a 3-lead .xyz Frank orthogonal file constraint in its header, but none was uploaded."
            }
            
        # ── 2. Save the explicitly named files ───────────────────────────────
        with open(os.path.join(UPLOAD_DIR, f"{record_name}.hea"), "w") as f:
            f.write("\n".join(new_hea_lines))
            
        dat_bytes = await dat_file.read()
        with open(os.path.join(UPLOAD_DIR, f"{record_name}.dat"), "wb") as f:
            f.write(dat_bytes)
            
        if xyz_file is not None:
            xyz_bytes = await xyz_file.read()
            with open(os.path.join(UPLOAD_DIR, f"{record_name}.xyz"), "wb") as f:
                f.write(xyz_bytes)
                    
        # ── 3. Read the record using official wfdb lib ────────────────────────
        record_path = os.path.join(UPLOAD_DIR, record_name)
        record = wfdb.rdrecord(record_path)
        
        arr = record.p_signal
        lead_names = record.sig_name
        n_samples = arr.shape[0]
        n_leads = arr.shape[1]
        fs = record.fs

        # ── 3. Write temporary CSV → reuse existing medical_service ──────────
        import csv, tempfile
        with tempfile.NamedTemporaryFile(
            mode="w", suffix=".csv", delete=False,
            dir=UPLOAD_DIR, newline=""
        ) as tmp:
            tmp_path = tmp.name
            writer = csv.writer(tmp)
            # Make sure names map exactly, Keras expects I, II, etc.
            # Convert lowercase 'i' to 'I', 'v1' to 'V1', etc, to match expected names if needed.
            writer.writerow([n.upper() for n in lead_names])
            for s in range(n_samples):
                writer.writerow([float(arr[s, ch]) for ch in range(n_leads)])

        print(f"🫀 Analyzing WFDB → temp CSV: {tmp_path}")
        analysis = medical_service.analyze_medical_signal(tmp_path)

        try:
            os.remove(tmp_path)
            # Clean up the binary files too
            try: os.remove(os.path.join(UPLOAD_DIR, f"{record_name}.hea"))
            except: pass
            try: os.remove(os.path.join(UPLOAD_DIR, f"{record_name}.dat"))
            except: pass
            try: os.remove(os.path.join(UPLOAD_DIR, f"{record_name}.xyz"))
            except: pass
        except Exception:
            pass

        # Build signals dict for frontend viewer
        signals = {name.upper(): arr[:, i].tolist() for i, name in enumerate(lead_names)}
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