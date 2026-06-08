from datetime import date, datetime
from typing import Optional

from sqlalchemy import Date, DateTime, Integer, String, Text
from sqlalchemy.orm import Mapped, mapped_column

from app.database import Base

DIMENSION_FIELDS = [
    "pragmatic_desc",
    "responsibility_desc",
    "excellence_desc",
    "innovation_desc",
    "quality_desc",
    "architecture_desc",
    "business_desc",
    "execution_desc",
    "teamwork_desc",
    "influence_desc",
    "output_desc",
    "ai_depth_desc",
]

DIMENSION_LABELS = [
    "务实",
    "担当",
    "追求卓越",
    "学习创新与效率提升",
    "技术专业与质量",
    "架构能力",
    "业务理解能力",
    "执行力",
    "团队协作",
    "知识传承与影响力",
    "基础工作产出",
    "AI使用深度",
]

LEVELS = ["P5", "P6", "P7", "P8", "P9", "P10"]
EMPLOYEE_LEVELS = ["P4", "P5", "P6", "P7", "P8", "P9", "P10"]


def next_target_level(current_level: str) -> Optional[str]:
    if current_level not in EMPLOYEE_LEVELS:
        return None
    idx = EMPLOYEE_LEVELS.index(current_level)
    if idx >= len(EMPLOYEE_LEVELS) - 1:
        return None
    return EMPLOYEE_LEVELS[idx + 1]


class UserInfo(Base):
    __tablename__ = "user_info"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    employee_no: Mapped[str] = mapped_column(String(20), nullable=False, unique=True, index=True)
    name: Mapped[str] = mapped_column(String(50), nullable=False, index=True)
    name_pinyin: Mapped[Optional[str]] = mapped_column(String(100), nullable=True, index=True)
    division_center: Mapped[Optional[str]] = mapped_column(String(50), nullable=True)
    department: Mapped[Optional[str]] = mapped_column(String(50), nullable=True)
    education: Mapped[Optional[str]] = mapped_column(String(20), nullable=True)
    position: Mapped[Optional[str]] = mapped_column(String(100), nullable=True)
    current_level: Mapped[str] = mapped_column(String(10), nullable=False)
    target_level: Mapped[str] = mapped_column(String(10), nullable=False)
    perf_fy24: Mapped[Optional[str]] = mapped_column(String(10), nullable=True)
    perf_fy25: Mapped[Optional[str]] = mapped_column(String(10), nullable=True)
    perf_fy25h1: Mapped[Optional[str]] = mapped_column(String(10), nullable=True)
    join_date: Mapped[Optional[date]] = mapped_column(Date, nullable=True)
    remark: Mapped[Optional[str]] = mapped_column(String(255), nullable=True)
    nomination_status: Mapped[Optional[str]] = mapped_column(String(20), nullable=True)
    nomination_reason: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    update_time: Mapped[datetime] = mapped_column(DateTime, nullable=False, default=datetime.utcnow)


class PromotionStandard(Base):
    __tablename__ = "promotion_standard"

    level: Mapped[str] = mapped_column(String(10), primary_key=True)
    pragmatic_desc: Mapped[str] = mapped_column(Text, nullable=False, default="")
    responsibility_desc: Mapped[str] = mapped_column(Text, nullable=False, default="")
    excellence_desc: Mapped[str] = mapped_column(Text, nullable=False, default="")
    innovation_desc: Mapped[str] = mapped_column(Text, nullable=False, default="")
    quality_desc: Mapped[str] = mapped_column(Text, nullable=False, default="")
    architecture_desc: Mapped[str] = mapped_column(Text, nullable=False, default="")
    business_desc: Mapped[str] = mapped_column(Text, nullable=False, default="")
    execution_desc: Mapped[str] = mapped_column(Text, nullable=False, default="")
    teamwork_desc: Mapped[str] = mapped_column(Text, nullable=False, default="")
    influence_desc: Mapped[str] = mapped_column(Text, nullable=False, default="")
    output_desc: Mapped[str] = mapped_column(Text, nullable=False, default="")
    ai_depth_desc: Mapped[str] = mapped_column(Text, nullable=False, default="")


class EvaluationRecord(Base):
    __tablename__ = "evaluation_record"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    employee_id: Mapped[int] = mapped_column(Integer, nullable=False, index=True)
    reviewer_name: Mapped[str] = mapped_column(String(50), nullable=False, index=True)
    status: Mapped[str] = mapped_column(String(20), nullable=False, default="待生成结果")
    score_1: Mapped[Optional[int]] = mapped_column(Integer, nullable=True)
    score_2: Mapped[Optional[int]] = mapped_column(Integer, nullable=True)
    score_3: Mapped[Optional[int]] = mapped_column(Integer, nullable=True)
    score_4: Mapped[Optional[int]] = mapped_column(Integer, nullable=True)
    score_5: Mapped[Optional[int]] = mapped_column(Integer, nullable=True)
    score_6: Mapped[Optional[int]] = mapped_column(Integer, nullable=True)
    score_7: Mapped[Optional[int]] = mapped_column(Integer, nullable=True)
    score_8: Mapped[Optional[int]] = mapped_column(Integer, nullable=True)
    score_9: Mapped[Optional[int]] = mapped_column(Integer, nullable=True)
    score_10: Mapped[Optional[int]] = mapped_column(Integer, nullable=True)
    score_11: Mapped[Optional[int]] = mapped_column(Integer, nullable=True)
    score_12: Mapped[Optional[int]] = mapped_column(Integer, nullable=True)
    avg_values: Mapped[Optional[float]] = mapped_column(nullable=True)
    avg_capability: Mapped[Optional[float]] = mapped_column(nullable=True)
    avg_output: Mapped[Optional[float]] = mapped_column(nullable=True)
    final_score: Mapped[Optional[float]] = mapped_column(nullable=True)
    sys_suggestion: Mapped[Optional[str]] = mapped_column(String(50), nullable=True)
    reviewer_result: Mapped[Optional[str]] = mapped_column(String(50), nullable=True)
    advantage: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    disadvantage: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    create_time: Mapped[datetime] = mapped_column(DateTime, nullable=False, default=datetime.utcnow)
    update_time: Mapped[datetime] = mapped_column(DateTime, nullable=False, default=datetime.utcnow)
