from fastapi import FastAPI
from routes import medical_routes, acoustic_routes, finance_routes, bio_routes

app = FastAPI()

app.include_router(medical_routes.router, prefix="/medical", tags=["Medical"])
app.include_router(acoustic_routes.router, prefix="/acoustic", tags=["Acoustic"])
app.include_router(finance_routes.router, prefix="/finance", tags=["Finance"])
app.include_router(bio_routes.router, prefix="/bio", tags=["Bio"])

@app.get("/")
def read_root():
    return {"message": "Welcome to Ziad Signals Platform API"}
