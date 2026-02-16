from fastapi import APIRouter
from services.finance_service import FinanceService

router = APIRouter()
service = FinanceService()

@router.get("/")
def read_finance():
    # Write your code here: Connect to finance service to process data
    return {"message": "Finance Route"}
