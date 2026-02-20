from fastapi import APIRouter, UploadFile, File
from pydantic import BaseModel
import shutil
import os
import sys
import traceback

# Fix import paths
sys.path.append(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from services.acoustic_service import AcousticService

router = APIRouter()
service = AcousticService()

# Paths — routes/ → Backend/ → project root
BACKEND_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
PROJECT_ROOT = os.path.dirname(BACKEND_DIR)
DATASETS_DIR = os.path.join(PROJECT_ROOT, "datasets")
UPLOAD_DIR = os.path.join(BACKEND_DIR, "uploads")


# ===== Request Models =====
class DopplerSimulateRequest(BaseModel):
    frequency: float = 440.0
    velocity: float = 80.0


# ===== PART 1: Doppler Simulation =====

@router.post("/simulate")
async def simulate_doppler(req: DopplerSimulateRequest):
    """
    Generate synthetic Doppler pass sound.
    Body: { "frequency": 440, "velocity": 80 }
    """
    try:
        # Clamp values to safe ranges
        freq = max(50, min(5000, req.frequency))
        vel = max(1, min(500, req.velocity))
        result = service.generate_doppler(freq, vel)
        return result
    except Exception as e:
        traceback.print_exc()
        return {"error": str(e)}


# ===== PART 2: Real Doppler Analysis =====

@router.get("/doppler/datasets")
def list_doppler_datasets():
    """List available Doppler dataset files."""
    return service.list_doppler_datasets()


@router.get("/doppler/analyze/{filename}")
def analyze_doppler_dataset(filename: str):
    """Analyze a specific Doppler dataset file."""
    file_path = os.path.join(DATASETS_DIR, "Doppler", filename)
    if not os.path.exists(file_path):
        return {"error": f"File not found: {filename}"}
    return service.analyze_doppler(file_path)


@router.post("/doppler/upload")
async def upload_and_analyze_doppler(file: UploadFile = File(...)):
    """Upload and analyze a custom Doppler audio file."""
    os.makedirs(UPLOAD_DIR, exist_ok=True)
    file_path = os.path.join(UPLOAD_DIR, file.filename)

    try:
        with open(file_path, "wb") as buffer:
            shutil.copyfileobj(file.file, buffer)

        result = service.analyze_doppler(file_path)
        return result
    except Exception as e:
        traceback.print_exc()
        return {"error": str(e)}


# ===== PART 3: Drone Detection =====

@router.get("/drone/datasets")
def list_drone_datasets():
    """List available drone/bird/engine audio files."""
    return service.list_drone_datasets()


@router.get("/drone/detect")
def detect_drone():
    """Run drone detection across all dataset files."""
    return service.detect_drone_batch()


@router.post("/drone/upload")
async def upload_and_classify_drone(file: UploadFile = File(...)):
    """Upload and classify a custom audio file for drone detection."""
    os.makedirs(UPLOAD_DIR, exist_ok=True)
    file_path = os.path.join(UPLOAD_DIR, file.filename)

    try:
        with open(file_path, "wb") as buffer:
            shutil.copyfileobj(file.file, buffer)

        result = service.analyze_drone_file(file_path)
        return result
    except Exception as e:
        traceback.print_exc()
        return {"error": str(e)}
