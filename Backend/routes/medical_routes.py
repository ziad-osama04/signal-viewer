from fastapi import APIRouter, UploadFile, File
import shutil
import os
from services import medical_service

router = APIRouter()

@router.post("/upload-medical-data/")
async def upload_medical_data(file: UploadFile = File(...)):
    # Save the uploaded file to a temporary location
    temp_file_path = f"temp_{file.filename}"
    with open(temp_file_path, "wb") as buffer:
        shutil.copyfileobj(file.file, buffer)
    
    try:
        # Process the file and extract signals
        signals = medical_service.process_medical_file(temp_file_path)
        return {"signals": signals}
    finally:
        # Clean up the temporary file
        if os.path.exists(temp_file_path):
            os.remove(temp_file_path)