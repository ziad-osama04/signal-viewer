from fastapi import APIRouter, UploadFile, File
from fastapi.responses import JSONResponse
from services.bio_service import BioService
import shutil, os, traceback

router  = APIRouter()
service = BioService()

UPLOAD_DIR = os.path.join(
    os.path.dirname(os.path.dirname(os.path.abspath(__file__))),
    'uploads'
)

@router.get('/')
def read_bio():
    return {'message': 'Bio/Microbiome Route'}


@router.post('/analyze')
async def analyze_microbiome(file: UploadFile = File(...)):
    """
    Upload a patient CSV file (same format as blind_test.csv).
    Returns per-patient IBD predictions with confidence and top taxa.
    """
    os.makedirs(UPLOAD_DIR, exist_ok=True)
    file_path = os.path.join(UPLOAD_DIR, file.filename)

    try:
        # Validate extension
        ext = os.path.splitext(file.filename)[1].lower()
        if ext != '.csv':
            return JSONResponse(
                status_code=400,
                content={'error': 'Invalid File', 'details': f'Expected .csv — got {ext}'}
            )

        # Save to disk
        with open(file_path, 'wb') as buf:
            shutil.copyfileobj(file.file, buf)

        print(f"🧬 Processing microbiome file: {file.filename}")

        result = service.analyze_csv(file_path)

        if 'error' in result:
            return JSONResponse(status_code=500, content=result)

        return result

    except Exception as e:
        tb = traceback.format_exc()
        print('❌ Bio route crash:\n', tb)
        return JSONResponse(
            status_code=500,
            content={'error': 'Backend Crash', 'details': str(e)}
        )
    finally:
        try:
            if os.path.exists(file_path):
                os.remove(file_path)
        except Exception:
            pass
