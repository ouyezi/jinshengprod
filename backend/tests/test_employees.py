import io
from datetime import date, datetime

import pytest
from openpyxl import Workbook
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker

from app.database import Base
from app.models import EMPLOYEE_LEVELS, UserInfo, next_target_level
from app.services.excel import TEMPLATE_HEADERS, import_employees


def test_next_target_level_normal():
    assert next_target_level("P4") == "P5"
    assert next_target_level("P5") == "P6"
    assert next_target_level("P9") == "P10"


def test_next_target_level_p10_returns_none():
    assert next_target_level("P10") is None


def test_next_target_level_invalid():
    assert next_target_level("P3") is None
    assert next_target_level("invalid") is None


def test_employee_levels_include_p4():
    assert "P4" in EMPLOYEE_LEVELS
    assert "P10" in EMPLOYEE_LEVELS


@pytest.fixture
def import_db():
    engine = create_engine("sqlite:///:memory:")
    Base.metadata.create_all(engine)
    Session = sessionmaker(bind=engine)
    session = Session()
    yield session
    session.close()


def _make_import_xlsx(rows: list[tuple]) -> bytes:
    wb = Workbook()
    ws = wb.active
    ws.append(TEMPLATE_HEADERS)
    for row in rows:
        ws.append(row)
    buf = io.BytesIO()
    wb.save(buf)
    return buf.getvalue()


def test_import_new_employee(import_db):
    data = _make_import_xlsx([
        ("研发中心", "技术保障部", "SH-1945", "吴艳", "本科", "运维工程师", "P4",
         "A", "A", "B", date(2020, 11, 16), None, "提名晋升", "业绩优秀"),
    ])
    result = import_employees(import_db, data)
    assert result["success"] == 1
    assert result["errors"] == []
    emp = import_db.query(UserInfo).filter(UserInfo.employee_no == "SH-1945").first()
    assert emp.name == "吴艳"
    assert emp.current_level == "P4"
    assert emp.target_level == "P5"
    assert emp.perf_fy24 == "A"
    assert emp.nomination_reason == "业绩优秀"


def test_import_upsert_by_employee_no(import_db):
    data = _make_import_xlsx([
        ("研发中心", "平台技术部", "SH-1225", "孙威", "本科", "Java工程师", "P5",
         "A", "S", "S", None, None, "提名晋升", "理由1"),
    ])
    import_employees(import_db, data)
    data2 = _make_import_xlsx([
        ("研发中心", "平台技术部", "SH-1225", "孙威", "本科", "高级Java工程师", "P5",
         "A", "S", "S", None, None, "提名晋升", "理由更新"),
    ])
    result = import_employees(import_db, data2)
    assert result["success"] == 1
    emp = import_db.query(UserInfo).filter(UserInfo.employee_no == "SH-1225").one()
    assert emp.position == "高级Java工程师"
    assert emp.nomination_reason == "理由更新"


def test_import_p10_error(import_db):
    data = _make_import_xlsx([
        ("研发中心", "某部", "SH-9999", "测试", "本科", "架构师", "P10",
         "S", "S", "S", None, None, "提名晋升", "无法晋升"),
    ])
    result = import_employees(import_db, data)
    assert result["success"] == 0
    assert len(result["errors"]) == 1
    assert "无法" in result["errors"][0]["reason"]
