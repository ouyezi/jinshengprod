from __future__ import annotations
from typing import Optional
from datetime import datetime

from sqlalchemy.orm import Session

from app.models import EvaluationRecord, UserInfo
from app.scoring import calculate_scores

ACTIVE_STATUSES = ("待提交", "待确认")
LOCKED_STATUS = "已提交"


def _scores_from_record(rec: EvaluationRecord) -> list[Optional[int]]:
    return [getattr(rec, f"score_{i}") for i in range(1, 13)]


def _apply_scores(rec: EvaluationRecord, scores: list[Optional[int]]) -> None:
    for i, s in enumerate(scores, start=1):
        setattr(rec, f"score_{i}", s)


def record_to_dict(rec: EvaluationRecord, employee: Optional[UserInfo] = None) -> dict:
    return {
        "id": rec.id,
        "employee_id": rec.employee_id,
        "employee_name": employee.name if employee else None,
        "target_level": employee.target_level if employee else None,
        "reviewer_name": rec.reviewer_name,
        "status": rec.status,
        "scores": _scores_from_record(rec),
        "avg_values": rec.avg_values,
        "avg_capability": rec.avg_capability,
        "avg_output": rec.avg_output,
        "final_score": rec.final_score,
        "sys_suggestion": rec.sys_suggestion,
        "reviewer_result": rec.reviewer_result,
        "advantage": rec.advantage,
        "disadvantage": rec.disadvantage,
        "create_time": rec.create_time.isoformat(),
        "update_time": rec.update_time.isoformat(),
    }


def load_evaluation(db: Session, employee_id: int, reviewer_name: str) -> Optional[EvaluationRecord]:
    rec = (
        db.query(EvaluationRecord)
        .filter(
            EvaluationRecord.employee_id == employee_id,
            EvaluationRecord.reviewer_name == reviewer_name,
            EvaluationRecord.status.in_(ACTIVE_STATUSES + (LOCKED_STATUS,)),
        )
        .first()
    )
    return rec


def upsert_draft(
    db: Session,
    employee_id: int,
    reviewer_name: str,
    scores: list[Optional[int]],
    advantage: Optional[str] = None,
    disadvantage: Optional[str] = None,
) -> EvaluationRecord:
    rec = (
        db.query(EvaluationRecord)
        .filter(
            EvaluationRecord.employee_id == employee_id,
            EvaluationRecord.reviewer_name == reviewer_name,
        )
        .first()
    )
    if rec and rec.status == LOCKED_STATUS:
        raise ValueError("该评审已提交，不可修改")

    now = datetime.utcnow()
    if not rec:
        rec = EvaluationRecord(
            employee_id=employee_id,
            reviewer_name=reviewer_name,
            status="待提交",
            create_time=now,
            update_time=now,
        )
        db.add(rec)

    _apply_scores(rec, scores)
    rec.advantage = advantage
    rec.disadvantage = disadvantage
    rec.status = "待提交"
    rec.update_time = now
    db.commit()
    db.refresh(rec)
    return rec


def generate_result(
    db: Session,
    employee_id: int,
    reviewer_name: str,
    scores: list[int],
    advantage: str,
    disadvantage: str,
    sys_suggestion: str,
    reviewer_result: str,
) -> EvaluationRecord:
    if any(s < 1 or s > 5 for s in scores):
        raise ValueError("分数必须在1-5之间")

    calc = calculate_scores(scores)
    rec = (
        db.query(EvaluationRecord)
        .filter(
            EvaluationRecord.employee_id == employee_id,
            EvaluationRecord.reviewer_name == reviewer_name,
        )
        .first()
    )
    now = datetime.utcnow()
    if not rec:
        rec = EvaluationRecord(
            employee_id=employee_id,
            reviewer_name=reviewer_name,
            create_time=now,
        )
        db.add(rec)
    if rec.status == LOCKED_STATUS:
        raise ValueError("该评审已提交，不可修改")

    _apply_scores(rec, scores)
    rec.advantage = advantage
    rec.disadvantage = disadvantage
    rec.avg_values = calc["avg_values"]
    rec.avg_capability = calc["avg_capability"]
    rec.avg_output = calc["avg_output"]
    rec.final_score = calc["final_score"]
    rec.sys_suggestion = sys_suggestion
    rec.reviewer_result = reviewer_result
    rec.status = "待确认"
    rec.update_time = now
    db.commit()
    db.refresh(rec)
    return rec


def submit_record(db: Session, record_id: int) -> EvaluationRecord:
    rec = db.get(EvaluationRecord, record_id)
    if not rec:
        raise ValueError("记录不存在")
    if rec.status != "待确认":
        raise ValueError("仅待确认状态可提交")
    rec.status = LOCKED_STATUS
    rec.update_time = datetime.utcnow()
    db.commit()
    db.refresh(rec)
    return rec


def query_summary(db: Session, employee_name: Optional[str], reviewer_name: Optional[str]) -> list[dict]:
    q = db.query(EvaluationRecord, UserInfo).outerjoin(UserInfo, UserInfo.id == EvaluationRecord.employee_id)
    if employee_name:
        q = q.filter(UserInfo.name.contains(employee_name))
    if reviewer_name:
        q = q.filter(EvaluationRecord.reviewer_name.contains(reviewer_name))

    rows = []
    for rec, emp in q.order_by(EvaluationRecord.update_time.desc()).all():
        scores = _scores_from_record(rec)
        rows.append({
            "评审对象姓名": emp.name if emp else "已删除",
            "状态": rec.status,
            "修改时间": rec.update_time.strftime("%Y-%m-%d %H:%M:%S"),
            "目标职级": emp.target_level if emp else "",
            "评委姓名": rec.reviewer_name,
            "评审日期": rec.create_time.strftime("%Y-%m-%d %H:%M:%S"),
            "价值观平均分": rec.avg_values,
            "能力模型平均分": rec.avg_capability,
            "工作成果平均分": rec.avg_output,
            "最终总分": rec.final_score,
            "系统建议": rec.sys_suggestion,
            "评委确认结果": rec.reviewer_result,
            "务实评分": scores[0], "担当评分": scores[1], "追求卓越评分": scores[2],
            "学习创新与效率提升评分": scores[3], "技术专业与质量评分": scores[4],
            "架构能力评分": scores[5], "业务理解能力评分": scores[6],
            "执行力评分": scores[7], "团队协作评分": scores[8],
            "知识传承与影响力评分": scores[9], "基础工作产出评分": scores[10],
            "AI使用深度评分": scores[11],
            "突出优势": rec.advantage,
            "待发展项": rec.disadvantage,
        })
    return rows
