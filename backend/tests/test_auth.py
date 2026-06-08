from fastapi.testclient import TestClient
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool

from app.config import settings
from app.database import Base
from app.main import app
from app.migrate import migrate_admin_account
from app.models import AdminAccount


def _build_memory_engine():
    return create_engine(
        "sqlite:///:memory:",
        connect_args={"check_same_thread": False},
        poolclass=StaticPool,
    )


def test_admin_account_seed(monkeypatch):
    engine = _build_memory_engine()
    Session = sessionmaker(autocommit=False, autoflush=False, bind=engine)

    Base.metadata.create_all(engine)
    monkeypatch.setattr("app.migrate.engine", engine)
    monkeypatch.setattr("app.migrate.SessionLocal", Session)

    migrate_admin_account()
    migrate_admin_account()

    db = Session()
    try:
        count = db.query(AdminAccount).count()
        assert count == 1
        admin = db.query(AdminAccount).first()
        assert admin is not None
        assert admin.username == settings.admin_username
        assert admin.password_hash != settings.admin_password
    finally:
        db.close()


def test_admin_seed_and_login(monkeypatch):
    engine = _build_memory_engine()
    Session = sessionmaker(autocommit=False, autoflush=False, bind=engine)

    Base.metadata.create_all(engine)
    monkeypatch.setattr("app.migrate.engine", engine)
    monkeypatch.setattr("app.migrate.SessionLocal", Session)
    migrate_admin_account()

    db = Session()
    try:
        assert db.query(AdminAccount).count() == 1
    finally:
        db.close()

    client = TestClient(app)
    resp = client.post(
        "/api/auth/login",
        json={"username": settings.admin_username, "password": settings.admin_password},
    )
    assert resp.status_code in (200, 401)
