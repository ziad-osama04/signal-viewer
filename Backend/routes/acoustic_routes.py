from fastapi import APIRouter
from services.acoustic_service import AcousticService

router = APIRouter()
service = AcousticService()

@router.get("/")
def read_acoustic():
    # Write your code here: Connect to acoustic service to process data
    return {"message": "Acoustic Route"}
