from datetime import datetime
from typing import Optional

from pydantic import BaseModel, Field


class LoginRequest(BaseModel):
    username: str
    password: str


class TokenResponse(BaseModel):
    access_token: str
    token_type: str = "bearer"


class UserInfoBase(BaseModel):
    name: str
    current_level: str
    target_level: str
    performance_history: Optional[str] = None


class UserInfoCreate(UserInfoBase):
    pass


class UserInfoUpdate(UserInfoBase):
    pass


class UserInfoResponse(UserInfoBase):
    id: int
    update_time: datetime

    class Config:
        from_attributes = True


class PromotionStandardResponse(BaseModel):
    level: str
    pragmatic_desc: str
    responsibility_desc: str
    excellence_desc: str
    innovation_desc: str
    quality_desc: str
    architecture_desc: str
    business_desc: str
    execution_desc: str
    teamwork_desc: str
    influence_desc: str
    output_desc: str
    ai_depth_desc: str

    class Config:
        from_attributes = True


class PromotionStandardUpdate(BaseModel):
    pragmatic_desc: str = ""
    responsibility_desc: str = ""
    excellence_desc: str = ""
    innovation_desc: str = ""
    quality_desc: str = ""
    architecture_desc: str = ""
    business_desc: str = ""
    execution_desc: str = ""
    teamwork_desc: str = ""
    influence_desc: str = ""
    output_desc: str = ""
    ai_depth_desc: str = ""


class EvaluationDraftRequest(BaseModel):
    employee_id: int
    reviewer_name: str
    scores: list[Optional[int]] = Field(default_factory=lambda: [None] * 12)
    advantage: Optional[str] = None
    disadvantage: Optional[str] = None


class EvaluationGenerateRequest(EvaluationDraftRequest):
    sys_suggestion: str
    reviewer_result: str


class EvaluationSubmitRequest(BaseModel):
    record_id: int


class EvaluationRecordResponse(BaseModel):
    id: int
    employee_id: int
    employee_name: Optional[str] = None
    target_level: Optional[str] = None
    reviewer_name: str
    status: str
    scores: list[Optional[int]]
    avg_values: Optional[float] = None
    avg_capability: Optional[float] = None
    avg_output: Optional[float] = None
    final_score: Optional[float] = None
    sys_suggestion: Optional[str] = None
    reviewer_result: Optional[str] = None
    advantage: Optional[str] = None
    disadvantage: Optional[str] = None
    create_time: datetime
    update_time: datetime

    class Config:
        from_attributes = True


class EvaluationQueryParams(BaseModel):
    employee_name: Optional[str] = None
    reviewer_name: Optional[str] = None
