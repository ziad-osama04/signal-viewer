from fastapi import APIRouter, UploadFile, File
from fastapi.responses import JSONResponse
import shutil
import os
import sys
import traceback

sys.path.append(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
from services import eeg_service

router = APIRouter()

UPLOAD_DIR = os.path.join(
    os.path.dirname(os.path.dirname(os.path.abspath(__file__))),
    "uploads"
)


@router.post("/process")
async def process_eeg(file: UploadFile = File(...)):
    os.makedirs(UPLOAD_DIR, exist_ok=True)
    file_path = os.path.join(UPLOAD_DIR, file.filename)

    try:
        # Save upload to disk
        with open(file_path, "wb") as buffer:
            shutil.copyfileobj(file.file, buffer)

        print(f"🧠 Processing EEG file: {file.filename}")

        # Validate extension
        ext = os.path.splitext(file.filename)[1].lower()
        if ext not in ('.npy', '.csv'):
            return JSONResponse(
                status_code=400,
                content={
                    "error":   "Invalid File",
                    "details": f"EEG requires .npy or .csv — got '{ext}'"
                }
            )

        result = eeg_service.analyze_eeg_signal(file_path)

        if "error" in result:
            return JSONResponse(status_code=500, content=result)

        return result

    except Exception as e:
        tb = traceback.format_exc()
        print("❌ EEG Route crash:\n", tb)
        return JSONResponse(
            status_code=500,
            content={"error": "Backend Crash", "details": str(e)}
        )

    finally:
        # Clean up uploaded file after processing
        try:
            if os.path.exists(file_path):
                os.remove(file_path)
        except Exception:
            pass