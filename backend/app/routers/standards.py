from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

from app.auth import require_admin
from app.database import get_db
from app.models import LEVELS, PromotionStandard
from app.response import fail, ok
from app.schemas import PromotionStandardResponse, PromotionStandardUpdate

router = APIRouter()


@router.get("/{level}")
def get_standard(level: str, db: Session = Depends(get_db)):
    if level not in LEVELS:
        return fail(f"无效职级: {level}")
    std = db.get(PromotionStandard, level)
    if not std:
        return fail("标准不存在", status_code=404)
    return ok(PromotionStandardResponse.model_validate(std).model_dump())


@router.put("/{level}")
def update_standard(
    level: str,
    body: PromotionStandardUpdate,
    db: Session = Depends(get_db),
    _: str = Depends(require_admin),
):
    if level not in LEVELS:
        return fail(f"无效职级: {level}")
    std = db.get(PromotionStandard, level)
    if not std:
        std = PromotionStandard(level=level)
        db.add(std)
    for k, v in body.model_dump().items():
        setattr(std, k, v)
    db.commit()
    db.refresh(std)
    return ok(PromotionStandardResponse.model_validate(std).model_dump())
