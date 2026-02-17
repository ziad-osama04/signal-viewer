from fastapi import APIRouter, UploadFile, File
import shutil
import os
import sys
import traceback

# --- FIX IMPORT PATHS ---
# This ensures Python can find 'services' and 'utils' no matter where you run it from
sys.path.append(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from services import medical_service

router = APIRouter()

@router.post("/process")
async def process_medical(file: UploadFile = File(...)):
    # 1. Save the file
    upload_dir = "../Backend/uploads"
    os.makedirs(upload_dir, exist_ok=True)
    file_path = f"{upload_dir}/{file.filename}"
    
    try:
        with open(file_path, "wb") as buffer:
            shutil.copyfileobj(file.file, buffer)
            
        # 2. Call the Service (Wrapped in Safety Net)
        print(f"Analyzing file: {file_path}") # Log to terminal
        result = medical_service.analyze_medical_signal(file_path)
        return result

    except Exception as e:
        # --- THE SAFETY NET ---
        # If anything crashes, print the FULL error to the terminal
        error_msg = traceback.format_exc()
        print("❌ CRASH DETECTED:\n", error_msg)
        
        # Return the error to the Frontend as JSON (so it doesn't say "Unexpected token I")
        return {
            "error": "Backend Crash",
            "details": str(e),
            "trace": error_msg.split('\n')[-2] # Send the last line of the error
        }