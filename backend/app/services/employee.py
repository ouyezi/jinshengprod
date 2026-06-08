from sqlalchemy import or_
from sqlalchemy.orm import Query, Session

from app.models import UserInfo
from app.pinyin_util import name_to_pinyin_keys


def apply_name_pinyin(emp: UserInfo, name: str) -> None:
    emp.name = name
    emp.name_pinyin = name_to_pinyin_keys(name)


def filter_employees_by_keyword(query: Query, keyword: str) -> Query:
    term = keyword.strip()
    if not term:
        return query
    pinyin_term = term.lower()
    return query.filter(
        or_(
            UserInfo.name.contains(term),
            UserInfo.employee_no.contains(term),
            UserInfo.name_pinyin.contains(pinyin_term),
        )
    )


def backfill_name_pinyin(db: Session) -> None:
    updated = False
    for emp in db.query(UserInfo).all():
        keys = name_to_pinyin_keys(emp.name)
        if emp.name_pinyin != keys:
            emp.name_pinyin = keys
            updated = True
    if updated:
        db.commit()
