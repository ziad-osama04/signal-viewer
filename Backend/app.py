from fastapi import FastAPI
from fastapi.staticfiles import StaticFiles
from routes import medical_routes, acoustic_routes, finance_routes, bio_routes
import uvicorn
import os

app = FastAPI()

# ===== Paths =====
BASE_DIR = os.path.dirname(os.path.abspath(__file__))
FRONTEND_DIR = os.path.join(BASE_DIR, "../Frontend")
ASSETS_DIR = os.path.join(FRONTEND_DIR, "assets")
PAGES_DIR = os.path.join(FRONTEND_DIR, "pages")

# ===== Register API Routes =====
app.include_router(medical_routes.router, prefix="/api/medical", tags=["Medical"])
app.include_router(acoustic_routes.router, prefix="/api/acoustic", tags=["Acoustic"])
app.include_router(finance_routes.router, prefix="/api/finance", tags=["Finance"])
app.include_router(bio_routes.router, prefix="/api/bio", tags=["Bio"])

# ===== Root endpoint =====
@app.get("/")
def read_root():
    return {"message": "Welcome to Ziad Signals Platform API"}

# ===== Serve Assets (only if exists) =====
if os.path.exists(ASSETS_DIR):
    app.mount("/assets", StaticFiles(directory=ASSETS_DIR), name="assets")
else:
    print("⚠️ Assets folder not found — skipping static mount")

# ===== Serve Pages (only if exists) =====
if os.path.exists(PAGES_DIR):
    app.mount("/pages", StaticFiles(directory=PAGES_DIR, html=True), name="pages")
else:
    print("⚠️ Pages folder not found — skipping pages mount")

# ===== Run server =====
if __name__ == "__main__":
    uvicorn.run("app:app", host="127.0.0.1", port=8000, reload=True)
