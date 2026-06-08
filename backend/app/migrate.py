from sqlalchemy import inspect

from app.database import engine
from app.models import UserInfo


def migrate_user_info() -> None:
    """旧 schema 无 employee_no 时，drop 并重建 user_info（不迁移历史数据）。"""
    inspector = inspect(engine)
    if "user_info" not in inspector.get_table_names():
        UserInfo.__table__.create(engine)
        return

    columns = {c["name"] for c in inspector.get_columns("user_info")}
    if "employee_no" in columns:
        return

    UserInfo.__table__.drop(engine)
    UserInfo.__table__.create(engine)
