import pytest
from datetime import datetime
from fastapi.testclient import TestClient
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool

from app.database import Base, get_db
from app.main import app
from app.migrate import migrate_evaluation_status_labels
from app.models import UserInfo, EvaluationRecord
from app.services.evaluation import (
    upsert_draft,
    load_evaluation,
    submit_record,
    has_submitted_record,
)


@pytest.fixture
def engine():
    eng = create_engine(
        "sqlite:///:memory:",
        connect_args={"check_same_thread": False},
        poolclass=StaticPool,
    )
    Base.metadata.create_all(eng)
    return eng


@pytest.fixture
def db(engine):
    Session = sessionmaker(bind=engine)
    session = Session()
    emp = UserInfo(
        employee_no="SH-TEST-001",
        name="张三",
        current_level="P6",
        target_level="P7",
        update_time=datetime.utcnow(),
    )
    session.add(emp)
    session.commit()
    yield session
    session.close()


@pytest.fixture
def client(engine):
    Session = sessionmaker(bind=engine)

    def override_get_db():
        session = Session()
        try:
            yield session
        finally:
            session.close()

    app.dependency_overrides[get_db] = override_get_db
    yield TestClient(app)
    app.dependency_overrides.clear()


def test_draft_and_load(db):
    emp = db.query(UserInfo).first()
    rec = upsert_draft(
        db, employee_id=emp.id, reviewer_name="李评委", scores=[3] * 12,
        advantage="好", disadvantage="待提升",
    )
    assert rec.status == "待提交"
    loaded = load_evaluation(db, emp.id, "李评委")
    assert loaded is not None
    assert loaded.status == "待提交"


def test_load_skips_submitted(db):
    emp = db.query(UserInfo).first()
    rec = upsert_draft(
        db, employee_id=emp.id, reviewer_name="王评委",
        scores=[4] * 12, advantage="a", disadvantage="b",
    )
    rec.status = "待确认"
    rec.final_score = 4.0
    db.commit()
    submit_record(db, rec.id)

    assert load_evaluation(db, emp.id, "王评委") is None
    assert has_submitted_record(db, emp.id, "王评委") is True


def test_resubmit_creates_new_record(db):
    emp = db.query(UserInfo).first()
    rec = upsert_draft(
        db, employee_id=emp.id, reviewer_name="王评委",
        scores=[4] * 12, advantage="a", disadvantage="b",
    )
    rec.status = "待确认"
    db.commit()
    submit_record(db, rec.id)

    new_rec = upsert_draft(
        db, employee_id=emp.id, reviewer_name="王评委",
        scores=[3] * 12, advantage="new", disadvantage="new",
    )
    assert new_rec.id != rec.id
    assert new_rec.status == "待提交"

    submitted_count = (
        db.query(EvaluationRecord)
        .filter(
            EvaluationRecord.employee_id == emp.id,
            EvaluationRecord.reviewer_name == "王评委",
            EvaluationRecord.status == "已提交",
        )
        .count()
    )
    assert submitted_count == 1


def test_load_api_has_submitted_flag(client, db):
    emp = db.query(UserInfo).first()
    rec = upsert_draft(db, emp.id, "赵评委", [4] * 12, "a", "b")
    rec.status = "待确认"
    db.commit()
    submit_record(db, rec.id)

    r = client.get("/api/evaluations/load", params={"employee_id": emp.id, "reviewer_name": "赵评委"})
    assert r.status_code == 200
    body = r.json()["data"]
    assert body["record"] is None
    assert body["has_submitted"] is True


def test_migrate_evaluation_status_labels(db, engine, monkeypatch):
    monkeypatch.setattr("app.migrate.engine", engine)

    emp = db.query(UserInfo).first()
    draft = EvaluationRecord(
        employee_id=emp.id,
        reviewer_name="迁移评委",
        status="待提交",
        create_time=datetime.utcnow(),
        update_time=datetime.utcnow(),
    )
    ready = EvaluationRecord(
        employee_id=emp.id,
        reviewer_name="迁移评委2",
        status="待确认",
        final_score=4.0,
        reviewer_result="通过晋升",
        create_time=datetime.utcnow(),
        update_time=datetime.utcnow(),
    )
    db.add_all([draft, ready])
    db.commit()

    migrate_evaluation_status_labels()

    db.refresh(draft)
    db.refresh(ready)
    assert draft.status == "待生成结果"
    assert ready.status == "待提交"
    statuses = {r[0] for r in db.query(EvaluationRecord.status).distinct().all()}
    assert "待确认" not in statuses
