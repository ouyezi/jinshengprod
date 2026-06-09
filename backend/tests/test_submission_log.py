import json
from datetime import datetime

import pytest
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool

from app.config import settings
from app.database import Base
from app.models import UserInfo
from app.services.evaluation import READY_SUBMIT_STATUS, submit_record, upsert_draft
from app.services.submission_log import append_submission_log


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
        employee_no="SH-LOG-001",
        name="张三",
        division_center="研发中心",
        department="平台部",
        current_level="P6",
        target_level="P7",
        update_time=datetime.utcnow(),
    )
    session.add(emp)
    session.commit()
    yield session
    session.close()


@pytest.fixture
def log_dir(tmp_path, monkeypatch):
    path = tmp_path / "submission_logs"
    monkeypatch.setattr(settings, "submission_log_dir", str(path))
    return path


def _ready_record(db, emp):
    rec = upsert_draft(
        db,
        employee_id=emp.id,
        reviewer_name="李评委",
        scores=[4] * 12,
        advantage="优势",
        disadvantage="劣势",
    )
    rec.status = READY_SUBMIT_STATUS
    rec.reviewer_result = "通过晋升"
    rec.final_score = 4.0
    db.commit()
    return rec


def test_append_submission_log_writes_jsonl(db, log_dir):
    emp = db.query(UserInfo).first()
    rec = _ready_record(db, emp)
    rec.status = "已提交"
    db.commit()

    append_submission_log(rec, emp)

    files = list(log_dir.glob("*.jsonl"))
    assert len(files) == 1
    line = files[0].read_text(encoding="utf-8").strip()
    payload = json.loads(line)
    assert payload["event"] == "evaluation_submitted"
    assert payload["record"]["id"] == rec.id
    assert payload["record"]["status"] == "已提交"
    assert payload["employee"]["employee_no"] == "SH-LOG-001"
    assert payload["employee"]["name"] == "张三"


def test_append_submission_log_appends_multiple_lines_same_day(db, log_dir):
    emp = db.query(UserInfo).first()
    rec1 = _ready_record(db, emp)
    rec1.status = "已提交"
    db.commit()
    append_submission_log(rec1, emp)

    rec2 = upsert_draft(
        db,
        employee_id=emp.id,
        reviewer_name="王评委",
        scores=[3] * 12,
        advantage="a",
        disadvantage="b",
    )
    rec2.status = READY_SUBMIT_STATUS
    rec2.reviewer_result = "不通过晋升"
    rec2.final_score = 3.0
    db.commit()
    rec2.status = "已提交"
    db.commit()
    append_submission_log(rec2, emp)

    files = list(log_dir.glob("*.jsonl"))
    assert len(files) == 1
    lines = [ln for ln in files[0].read_text(encoding="utf-8").splitlines() if ln.strip()]
    assert len(lines) == 2


def test_append_submission_log_creates_missing_dir(db, tmp_path, monkeypatch):
    nested = tmp_path / "deep" / "logs"
    monkeypatch.setattr(settings, "submission_log_dir", str(nested))
    emp = db.query(UserInfo).first()
    rec = _ready_record(db, emp)
    rec.status = "已提交"
    db.commit()

    append_submission_log(rec, emp)

    assert nested.exists()
    assert len(list(nested.glob("*.jsonl"))) == 1


def test_append_submission_log_swallows_write_errors(db, log_dir, monkeypatch):
    emp = db.query(UserInfo).first()
    rec = _ready_record(db, emp)
    rec.status = "已提交"
    db.commit()

    def boom(*args, **kwargs):
        raise OSError("disk full")

    monkeypatch.setattr("app.services.submission_log.Path.open", boom)
    append_submission_log(rec, emp)


def test_submit_record_writes_submission_log(db, log_dir):
    emp = db.query(UserInfo).first()
    rec = _ready_record(db, emp)

    submit_record(db, rec.id)

    files = list(log_dir.glob("*.jsonl"))
    assert len(files) == 1
    payload = json.loads(files[0].read_text(encoding="utf-8").strip())
    assert payload["record"]["status"] == "已提交"
    assert payload["record"]["reviewer_name"] == "李评委"


def test_submit_record_invalid_status_does_not_write_log(db, log_dir):
    emp = db.query(UserInfo).first()
    rec = upsert_draft(
        db,
        employee_id=emp.id,
        reviewer_name="赵评委",
        scores=[4] * 12,
        advantage="a",
        disadvantage="b",
    )
    assert rec.status == "待生成结果"

    with pytest.raises(ValueError, match="仅待提交状态可提交"):
        submit_record(db, rec.id)

    assert list(log_dir.glob("*.jsonl")) == []
