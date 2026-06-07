from sqlalchemy.orm import Session

from app.models import LEVELS, PromotionStandard


def seed_standards(db: Session) -> None:
    for level in LEVELS:
        exists = db.get(PromotionStandard, level)
        if not exists:
            db.add(PromotionStandard(level=level))
    db.commit()
