from __future__ import annotations

import json
import logging
from datetime import datetime
from pathlib import Path
from typing import Optional

from app.config import settings
from app.models import EvaluationRecord, UserInfo

logger = logging.getLogger(__name__)


def _employee_snapshot(employee: Optional[UserInfo]) -> Optional[dict]:
    if not employee:
        return None
    return {
        "id": employee.id,
        "employee_no": employee.employee_no,
        "name": employee.name,
        "division_center": employee.division_center,
        "department": employee.department,
        "current_level": employee.current_level,
        "target_level": employee.target_level,
    }


def _log_file_path() -> Path:
    day = datetime.utcnow().strftime("%Y-%m-%d")
    return Path(settings.submission_log_dir) / f"{day}.jsonl"


def append_submission_log(record: EvaluationRecord, employee: Optional[UserInfo]) -> None:
    from app.services.evaluation import record_to_dict

    path = _log_file_path()
    payload = {
        "logged_at": datetime.utcnow().isoformat(),
        "event": "evaluation_submitted",
        "record": record_to_dict(record, employee),
        "employee": _employee_snapshot(employee),
    }
    try:
        path.parent.mkdir(parents=True, exist_ok=True)
        with path.open("a", encoding="utf-8") as f:
            f.write(json.dumps(payload, ensure_ascii=False) + "\n")
    except Exception:
        logger.error(
            "Failed to write submission log for record_id=%s to %s",
            record.id,
            path,
            exc_info=True,
        )
