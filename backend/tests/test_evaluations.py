import pytest
from datetime import datetime
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker

from app.database import Base
from app.models import UserInfo, EvaluationRecord
from app.services.evaluation import upsert_draft, load_evaluation, submit_record


@pytest.fixture
def db():
    engine = create_engine("sqlite:///:memory:")
    Base.metadata.create_all(engine)
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


def test_draft_and_load(db):
    emp = db.query(UserInfo).first()
    rec = upsert_draft(db, employee_id=emp.id, reviewer_name="李评委", scores=[3]*12, advantage="好", disadvantage="待提升")
    assert rec.status == "待提交"
    loaded = load_evaluation(db, emp.id, "李评委")
    assert loaded is not None
    assert loaded.status == "待提交"


def test_submit_locked(db):
    emp = db.query(UserInfo).first()
    rec = upsert_draft(db, employee_id=emp.id, reviewer_name="王评委", scores=[4]*12, advantage="a", disadvantage="b")
    rec.status = "待确认"
    rec.final_score = 4.0
    db.commit()
    result = submit_record(db, rec.id)
    assert result.status == "已提交"
    with pytest.raises(ValueError):
        upsert_draft(db, employee_id=emp.id, reviewer_name="王评委", scores=[1]*12)
