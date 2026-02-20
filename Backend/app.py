from fastapi import FastAPI
from fastapi.staticfiles import StaticFiles
from fastapi.middleware.cors import CORSMiddleware
from routes import medical_routes, acoustic_routes, finance_routes, bio_routes, eeg_routes
import uvicorn
import os

app = FastAPI()

# ===== 1. CORS Setup (Essential for React) =====
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],  # Allows all origins
    allow_credentials=True,
    allow_methods=["*"],  # Allows all methods
    allow_headers=["*"],  # Allows all headers
)

# ===== 2. Define Paths =====
BASE_DIR = os.path.dirname(os.path.abspath(__file__))
# Assuming "Frontend" is a sibling folder to "Backend"
FRONTEND_DIR = os.path.join(os.path.dirname(BASE_DIR), "Frontend")
ASSETS_DIR = os.path.join(FRONTEND_DIR, "assets")
PAGES_DIR = os.path.join(FRONTEND_DIR, "pages")

# ===== 3. Register API Routes =====
app.include_router(medical_routes.router, prefix="/api/medical", tags=["Medical"])
app.include_router(acoustic_routes.router, prefix="/api/acoustic", tags=["Acoustic"])
app.include_router(finance_routes.router, prefix="/api/finance", tags=["Finance"])
app.include_router(eeg_routes.router, prefix="/api/eeg", tags=["EEG"])         # The new EEG route
app.include_router(bio_routes.router, prefix="/api/bio", tags=["Microbiome"])  # Reserved for Microbiome

# ===== 4. Root Endpoint =====
@app.get("/")
def read_root():
    return {"message": "Ziad Signals Platform API is Running"}

# ===== 5. Serve Assets (Optional fallback for vanilla JS) =====
if os.path.exists(ASSETS_DIR):
    app.mount("/assets", StaticFiles(directory=ASSETS_DIR), name="assets")
else:
    print("⚠️ Assets folder not found — skipping static mount")

# ===== Serve Pages (only if exists) =====
if os.path.exists(PAGES_DIR):
    app.mount("/pages", StaticFiles(directory=PAGES_DIR, html=True), name="pages")
else:
    print("⚠️ Pages folder not found — skipping pages mount")

# ===== 6. Run Server =====
if __name__ == "__main__":
    uvicorn.run("app:app", host="127.0.0.1", port=8000, reload=True)
