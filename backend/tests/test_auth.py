from fastapi.testclient import TestClient
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool

from app.config import settings
from app.database import Base
from app.database import get_db
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

    def override_get_db():
        db = Session()
        try:
            yield db
        finally:
            db.close()

    app.dependency_overrides[get_db] = override_get_db
    client = TestClient(app)
    try:
        resp = client.post(
            "/api/auth/login",
            json={"username": settings.admin_username, "password": settings.admin_password},
        )
        assert resp.status_code == 200
        assert resp.json()["code"] == 0
    finally:
        app.dependency_overrides.clear()


def test_change_password_and_relogin(monkeypatch):
    engine = _build_memory_engine()
    Session = sessionmaker(autocommit=False, autoflush=False, bind=engine)

    Base.metadata.create_all(engine)
    monkeypatch.setattr("app.migrate.engine", engine)
    monkeypatch.setattr("app.migrate.SessionLocal", Session)
    migrate_admin_account()

    def override_get_db():
        db = Session()
        try:
            yield db
        finally:
            db.close()

    app.dependency_overrides[get_db] = override_get_db
    client = TestClient(app)
    try:
        login_resp = client.post(
            "/api/auth/login",
            json={"username": settings.admin_username, "password": settings.admin_password},
        )
        assert login_resp.status_code == 200
        token = login_resp.json()["data"]["access_token"]

        change_resp = client.post(
            "/api/auth/change-password",
            headers={"Authorization": f"Bearer {token}"},
            json={"old_password": settings.admin_password, "new_password": "new-pass-123"},
        )
        assert change_resp.status_code == 200
        assert change_resp.json()["code"] == 0

        old_login_resp = client.post(
            "/api/auth/login",
            json={"username": settings.admin_username, "password": settings.admin_password},
        )
        assert old_login_resp.status_code == 401

        new_login_resp = client.post(
            "/api/auth/login",
            json={"username": settings.admin_username, "password": "new-pass-123"},
        )
        assert new_login_resp.status_code == 200
        assert new_login_resp.json()["code"] == 0
    finally:
        app.dependency_overrides.clear()
