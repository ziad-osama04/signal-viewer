from fastapi import APIRouter, UploadFile, File, Form
import shutil
import os
import sys
import traceback

sys.path.append(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
from services import finance_service

router = APIRouter()

UPLOAD_DIR = "../Backend/uploads"

# ── GET / — health check (keeps existing route) ───────────────────────────────
@router.get("/")
def read_finance():
    return {"message": "Finance Route — POST /process to run GRU prediction"}


# ── POST /process — main inference endpoint ───────────────────────────────────
@router.post("/process")
async def process_finance(
    file:       UploadFile = File(...),
    asset_name: str        = Form(...),   # e.g. "ABTX", "Gold", "EURUSD"
    category:   str        = Form(...),   # "stock" | "currency" | "metal"
):
    """
    Accepts a CSV upload + asset metadata, runs GRU forecast, returns JSON.

    Body (multipart/form-data):
      file        : the CSV file
      asset_name  : one of ABTX | AAT | EURUSD | USDJPY | Gold | Silver
      category    : stock | currency | metal
    """
    os.makedirs(UPLOAD_DIR, exist_ok=True)
    file_path = os.path.join(UPLOAD_DIR, file.filename)

    try:
        with open(file_path, "wb") as buf:
            shutil.copyfileobj(file.file, buf)

        print(f"💹 Finance analysis: asset={asset_name} category={category} file={file.filename}")

        if not file.filename.lower().endswith(".csv"):
            return {"error": "Invalid file", "details": "Finance analysis requires a .csv file"}

        # Validate asset name
        valid_assets = list(finance_service.ASSET_CONFIGS.keys())
        if asset_name not in valid_assets:
            return {
                "error":   "Unknown asset",
                "details": f"'{asset_name}' not recognised. Valid: {valid_assets}"
            }

        return finance_service.analyze_finance_signal(file_path, asset_name)

    except Exception as e:
        tb = traceback.format_exc()
        print("❌ Finance route crash:\n", tb)
        return {"error": "Backend Crash", "details": str(e), "trace": tb.split("\n")[-2]}


# ── GET /assets — list available assets (useful for frontend dropdown) ────────
@router.get("/assets")
def list_assets():
    return {
        name: {
            "category": cfg["category"],
            "horizon":  cfg["horizon"],
            "features": cfg["feature_cols"],
        }
        for name, cfg in finance_service.ASSET_CONFIGS.items()
    }
