from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.database import Base, engine, SessionLocal
from app.seed import seed_standards
from app.routers import auth, employees, standards, evaluations

app = FastAPI(title="研发晋升评审系统")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:5173"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(auth.router, prefix="/api/auth", tags=["auth"])
app.include_router(employees.router, prefix="/api/employees", tags=["employees"])
app.include_router(standards.router, prefix="/api/standards", tags=["standards"])
app.include_router(evaluations.router, prefix="/api/evaluations", tags=["evaluations"])


@app.on_event("startup")
def on_startup():
    Base.metadata.create_all(bind=engine)
    db = SessionLocal()
    try:
        seed_standards(db)
    finally:
        db.close()


@app.get("/api/health")
def health():
    from app.response import ok
    return ok({"status": "up"})
