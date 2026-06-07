import io
from datetime import datetime

from openpyxl import Workbook, load_workbook
from sqlalchemy.orm import Session

from app.models import LEVELS, UserInfo

TEMPLATE_HEADERS = ["姓名", "当前职级", "目标职级", "近两年绩效"]
SUMMARY_HEADERS = [
    "评审对象姓名", "状态", "修改时间", "目标职级", "评委姓名", "评审日期",
    "价值观平均分", "能力模型平均分", "工作成果平均分", "最终总分",
    "系统建议", "评委确认结果",
    "务实评分", "担当评分", "追求卓越评分",
    "学习创新与效率提升评分", "技术专业与质量评分", "架构能力评分",
    "业务理解能力评分", "执行力评分", "团队协作评分", "知识传承与影响力评分",
    "基础工作产出评分", "AI使用深度评分",
    "突出优势", "待发展项",
]


def build_template() -> bytes:
    wb = Workbook()
    ws = wb.active
    ws.title = "员工信息"
    ws.append(TEMPLATE_HEADERS)
    buf = io.BytesIO()
    wb.save(buf)
    return buf.getvalue()


def import_employees(db: Session, file_bytes: bytes) -> dict:
    wb = load_workbook(io.BytesIO(file_bytes))
    ws = wb.active
    success, errors = 0, []
    for idx, row in enumerate(ws.iter_rows(min_row=2, values_only=True), start=2):
        if not row or not row[0]:
            continue
        name = str(row[0]).strip()
        current_level = str(row[1]).strip() if row[1] else ""
        target_level = str(row[2]).strip() if row[2] else ""
        perf_raw = row[3] if len(row) > 3 else None
        perf = None if perf_raw is None or str(perf_raw).strip() == "" else str(perf_raw).strip()

        if current_level not in LEVELS or target_level not in LEVELS:
            errors.append({"row": idx, "reason": f"职级无效: {current_level}/{target_level}"})
            continue

        existing = db.query(UserInfo).filter(UserInfo.name == name).first()
        now = datetime.utcnow()
        if existing:
            existing.current_level = current_level
            existing.target_level = target_level
            existing.performance_history = perf
            existing.update_time = now
        else:
            db.add(UserInfo(
                name=name, current_level=current_level,
                target_level=target_level, performance_history=perf, update_time=now,
            ))
        success += 1
    db.commit()
    return {"success": success, "errors": errors}


def build_summary_export(rows: list[dict]) -> bytes:
    wb = Workbook()
    ws = wb.active
    ws.append(SUMMARY_HEADERS)
    for r in rows:
        ws.append([r.get(h) for h in SUMMARY_HEADERS])
    buf = io.BytesIO()
    wb.save(buf)
    return buf.getvalue()
