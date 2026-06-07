from datetime import datetime

from fastapi import APIRouter, Depends, File, Query, UploadFile
from fastapi.responses import Response
from sqlalchemy.orm import Session

from app.auth import require_admin
from app.database import get_db
from app.models import UserInfo
from app.response import fail, ok
from app.schemas import UserInfoCreate, UserInfoResponse, UserInfoUpdate
from app.services.excel import build_template, import_employees

router = APIRouter()


@router.get("")
def list_employees(
    name: str | None = Query(None),
    db: Session = Depends(get_db),
    _: str = Depends(require_admin),
):
    q = db.query(UserInfo)
    if name:
        q = q.filter(UserInfo.name.contains(name))
    items = q.order_by(UserInfo.update_time.desc()).all()
    return ok([UserInfoResponse.model_validate(i).model_dump() for i in items])


@router.get("/search")
def search_employees(q: str = Query(""), db: Session = Depends(get_db)):
    query = db.query(UserInfo)
    if q:
        query = query.filter(UserInfo.name.contains(q))
    items = query.limit(20).all()
    return ok([{"id": i.id, "name": i.name} for i in items])


@router.get("/template")
def download_template(_: str = Depends(require_admin)):
    content = build_template()
    return Response(
        content=content,
        media_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        headers={"Content-Disposition": "attachment; filename=employee_template.xlsx"},
    )


@router.delete("/all")
def delete_all(db: Session = Depends(get_db), _: str = Depends(require_admin)):
    db.query(UserInfo).delete()
    db.commit()
    return ok()


@router.post("/import")
async def import_file(
    file: UploadFile = File(...),
    db: Session = Depends(get_db),
    _: str = Depends(require_admin),
):
    content = await file.read()
    result = import_employees(db, content)
    return ok(result)


@router.get("/{employee_id}")
def get_employee(employee_id: int, db: Session = Depends(get_db)):
    emp = db.get(UserInfo, employee_id)
    if not emp:
        return fail("员工不存在", status_code=404)
    return ok(UserInfoResponse.model_validate(emp).model_dump())


@router.post("")
def create_employee(
    body: UserInfoCreate,
    db: Session = Depends(get_db),
    _: str = Depends(require_admin),
):
    now = datetime.utcnow()
    emp = UserInfo(**body.model_dump(), update_time=now)
    db.add(emp)
    db.commit()
    db.refresh(emp)
    return ok(UserInfoResponse.model_validate(emp).model_dump())


@router.put("/{employee_id}")
def update_employee(
    employee_id: int,
    body: UserInfoUpdate,
    db: Session = Depends(get_db),
    _: str = Depends(require_admin),
):
    emp = db.get(UserInfo, employee_id)
    if not emp:
        return fail("员工不存在", status_code=404)
    for k, v in body.model_dump().items():
        setattr(emp, k, v)
    emp.update_time = datetime.utcnow()
    db.commit()
    return ok(UserInfoResponse.model_validate(emp).model_dump())


@router.delete("/{employee_id}")
def delete_employee(
    employee_id: int,
    db: Session = Depends(get_db),
    _: str = Depends(require_admin),
):
    emp = db.get(UserInfo, employee_id)
    if not emp:
        return fail("员工不存在", status_code=404)
    db.delete(emp)
    db.commit()
    return ok()
