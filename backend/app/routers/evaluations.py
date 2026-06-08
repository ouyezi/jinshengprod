from typing import Optional
from fastapi import APIRouter, Depends, Query
from fastapi.responses import Response
from sqlalchemy.orm import Session

from app.auth import require_admin
from app.database import get_db
from app.models import UserInfo
from app.response import fail, ok
from app.schemas import (
    EvaluationDraftRequest,
    EvaluationGenerateRequest,
    EvaluationSubmitRequest,
    UserInfoResponse,
)
from app.services.evaluation import (
    generate_result,
    load_evaluation,
    query_summary,
    record_to_dict,
    submit_record,
    upsert_draft,
)
from app.services.excel import build_summary_export

router = APIRouter()


@router.get("/load")
def load_eval(
    employee_id: int = Query(...),
    reviewer_name: str = Query(...),
    db: Session = Depends(get_db),
):
    if not reviewer_name.strip():
        return fail("评委姓名不能为空")
    emp = db.get(UserInfo, employee_id)
    if not emp:
        return fail("员工不存在", status_code=404)

    rec = load_evaluation(db, employee_id, reviewer_name.strip())
    data = {
        "employee": UserInfoResponse.model_validate(emp).model_dump(),
        "record": record_to_dict(rec, emp) if rec else None,
    }
    return ok(data)


@router.post("/draft")
def save_draft(body: EvaluationDraftRequest, db: Session = Depends(get_db)):
    try:
        rec = upsert_draft(
            db, body.employee_id, body.reviewer_name.strip(),
            body.scores, body.advantage, body.disadvantage,
        )
        emp = db.get(UserInfo, body.employee_id)
        return ok(record_to_dict(rec, emp))
    except ValueError as e:
        return fail(str(e), status_code=409)


@router.post("/generate")
def generate(body: EvaluationGenerateRequest, db: Session = Depends(get_db)):
    if len(body.scores) != 12 or any(s is None for s in body.scores):
        return fail("12项分数必须全部填写")
    if not body.advantage or not body.disadvantage:
        return fail("突出优势和待发展项必填")
    try:
        rec = generate_result(
            db, body.employee_id, body.reviewer_name.strip(),
            body.scores, body.advantage, body.disadvantage,
            body.sys_suggestion, body.reviewer_result,
        )
        emp = db.get(UserInfo, body.employee_id)
        return ok(record_to_dict(rec, emp))
    except ValueError as e:
        return fail(str(e), status_code=409)


@router.post("/submit")
def submit(body: EvaluationSubmitRequest, db: Session = Depends(get_db)):
    try:
        rec = submit_record(db, body.record_id)
        emp = db.get(UserInfo, rec.employee_id)
        return ok(record_to_dict(rec, emp))
    except ValueError as e:
        return fail(str(e), status_code=409)


@router.get("/summary")
def summary(
    employee_name: Optional[str] = Query(None),
    reviewer_name: Optional[str] = Query(None),
    db: Session = Depends(get_db),
    _: str = Depends(require_admin),
):
    return ok(query_summary(db, employee_name, reviewer_name))


@router.get("/export")
def export(
    employee_name: Optional[str] = Query(None),
    reviewer_name: Optional[str] = Query(None),
    db: Session = Depends(get_db),
    _: str = Depends(require_admin),
):
    rows = query_summary(db, employee_name, reviewer_name)
    content = build_summary_export(rows)
    return Response(
        content=content,
        media_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        headers={"Content-Disposition": "attachment; filename=evaluation_summary.xlsx"},
    )
