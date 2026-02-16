from fastapi import APIRouter
from services.medical_service import MedicalService

router = APIRouter()
service = MedicalService()

@router.get("/")
def read_medical():
    # Write your code here: Connect to medical service to process data
    return {"message": "Medical Route"}
