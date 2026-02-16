from fastapi import APIRouter
from services.bio_service import BioService

router = APIRouter()
service = BioService()

@router.get("/")
def read_bio():
    # Write your code here: Connect to bio service to process data
    return {"message": "Bio/Microbiome Route"}
