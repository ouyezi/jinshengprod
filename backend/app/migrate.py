from sqlalchemy import inspect, text

from app.database import engine
from app.models import EvaluationRecord, UserInfo


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


def _evaluation_record_has_unique_constraint() -> bool:
    """SQLite: 检查 evaluation_record 是否仍有 (employee_id, reviewer_name) 唯一索引。"""
    with engine.connect() as conn:
        rows = conn.execute(text("PRAGMA index_list('evaluation_record')")).fetchall()
    for row in rows:
        index_name = row[1]
        unique = bool(row[2])
        if not unique:
            continue
        if "uq_employee_reviewer" in index_name:
            return True
        with engine.connect() as conn:
            info = conn.execute(text(f"PRAGMA index_info('{index_name}')")).fetchall()
        if len(info) == 2:
            cols = [r[2] for r in info]
            if cols == ["employee_id", "reviewer_name"]:
                return True
    return False


def migrate_evaluation_record() -> None:
    """移除 evaluation_record 的 (employee_id, reviewer_name) 唯一约束，保留数据。"""
    inspector = inspect(engine)
    if "evaluation_record" not in inspector.get_table_names():
        EvaluationRecord.__table__.create(engine)
        return

    if not _evaluation_record_has_unique_constraint():
        return

    with engine.begin() as conn:
        conn.execute(
            text(
                """
            CREATE TABLE evaluation_record_new (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                employee_id INTEGER NOT NULL,
                reviewer_name VARCHAR(50) NOT NULL,
                status VARCHAR(20) NOT NULL DEFAULT '待提交',
                score_1 INTEGER, score_2 INTEGER, score_3 INTEGER,
                score_4 INTEGER, score_5 INTEGER, score_6 INTEGER,
                score_7 INTEGER, score_8 INTEGER, score_9 INTEGER,
                score_10 INTEGER, score_11 INTEGER, score_12 INTEGER,
                avg_values FLOAT, avg_capability FLOAT, avg_output FLOAT,
                final_score FLOAT,
                sys_suggestion VARCHAR(50), reviewer_result VARCHAR(50),
                advantage TEXT, disadvantage TEXT,
                create_time DATETIME NOT NULL,
                update_time DATETIME NOT NULL
            )
        """
            )
        )
        conn.execute(text("INSERT INTO evaluation_record_new SELECT * FROM evaluation_record"))
        conn.execute(text("DROP TABLE evaluation_record"))
        conn.execute(text("ALTER TABLE evaluation_record_new RENAME TO evaluation_record"))
        conn.execute(
            text(
                "CREATE INDEX IF NOT EXISTS ix_evaluation_record_employee_id "
                "ON evaluation_record (employee_id)"
            )
        )
        conn.execute(
            text(
                "CREATE INDEX IF NOT EXISTS ix_evaluation_record_reviewer_name "
                "ON evaluation_record (reviewer_name)"
            )
        )
