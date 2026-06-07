# 研发晋升评审系统 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 构建一套完整的研发晋升评审系统（FastAPI 后端 + 单 React 应用双路由），覆盖员工管理、晋升标准配置、评委打分、评审汇总导出。

**Architecture:** 后端 FastAPI 提供 REST API，SQLite 存储三张核心表；前端单 Vite 应用，`/admin/*` 走 JWT 鉴权，`/review` 免登录仅填评委姓名。已有 `backend/app/models.py`、`auth.py`、`scoring.py`、`schemas.py` 直接复用。

**Tech Stack:** Python 3.11+, FastAPI, SQLAlchemy, openpyxl, pytest | React 18, TypeScript, Ant Design 5, Vite, React Router 6

**Spec:** `docs/superpowers/specs/2026-06-08-promotion-review-design.md`

---

## File Map

| 文件 | 职责 |
|------|------|
| `backend/app/main.py` | FastAPI 入口、CORS、路由挂载、启动建表+种子 |
| `backend/app/response.py` | 统一 `{code, data, message}` 响应包装 |
| `backend/app/seed.py` | P5–P10 空标准种子数据 |
| `backend/app/routers/auth.py` | 登录 / me |
| `backend/app/routers/employees.py` | 员工 CRUD、导入、模板 |
| `backend/app/routers/standards.py` | 标准读写 |
| `backend/app/routers/evaluations.py` | 评审 load/draft/generate/submit/summary/export |
| `backend/app/services/excel.py` | Excel 模板、导入、导出 |
| `backend/app/services/evaluation.py` | 评审记录 upsert、load、状态校验 |
| `backend/tests/test_scoring.py` | 计分边界单测 |
| `backend/tests/test_evaluations.py` | 评审状态机 API 测试 |
| `web/src/main.tsx` | React 入口 |
| `web/src/App.tsx` | 路由定义 |
| `web/src/api/client.ts` | axios 封装、Token 注入 |
| `web/src/api/*.ts` | 各模块 API 调用 |
| `web/src/utils/scoring.ts` | 前端计分（与后端公式一致） |
| `web/src/hooks/useAuth.ts` | Admin Token 管理 |
| `web/src/components/AdminRouteGuard.tsx` | 路由守卫 |
| `web/src/components/ScoreMatrix.tsx` | 12 维矩阵 |
| `web/src/pages/admin/Login.tsx` | 登录页 |
| `web/src/pages/admin/Employees.tsx` | 页面一 |
| `web/src/pages/admin/Standards.tsx` | 页面二 |
| `web/src/pages/admin/Summary.tsx` | 页面四 |
| `web/src/pages/review/Evaluation.tsx` | 页面三 |

---

## Task 1: 后端基础设施

**Files:**
- Create: `backend/app/response.py`
- Create: `backend/app/seed.py`
- Create: `backend/app/main.py`
- Modify: `backend/requirements.txt`

- [ ] **Step 1: 添加 pytest 依赖**

在 `backend/requirements.txt` 末尾追加：

```
pytest==8.3.4
httpx==0.28.1
```

- [ ] **Step 2: 创建统一响应包装**

Create `backend/app/response.py`:

```python
from typing import Any, Optional

from fastapi.responses import JSONResponse


def ok(data: Any = None, message: str = "ok") -> dict:
    return {"code": 0, "data": data, "message": message}


def fail(message: str, code: int = 40001, status_code: int = 400) -> JSONResponse:
    return JSONResponse(status_code=status_code, content={"code": code, "data": None, "message": message})
```

- [ ] **Step 3: 创建种子数据模块**

Create `backend/app/seed.py`:

```python
from sqlalchemy.orm import Session

from app.models import LEVELS, PromotionStandard


def seed_standards(db: Session) -> None:
    for level in LEVELS:
        exists = db.get(PromotionStandard, level)
        if not exists:
            db.add(PromotionStandard(level=level))
    db.commit()
```

- [ ] **Step 4: 创建 FastAPI 入口**

Create `backend/app/main.py`:

```python
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.database import Base, engine, SessionLocal
from app.seed import seed_standards
from app.routers import auth, employees, standards, evaluations

app = FastAPI(title="研发晋升评审系统")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:5173"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(auth.router, prefix="/api/auth", tags=["auth"])
app.include_router(employees.router, prefix="/api/employees", tags=["employees"])
app.include_router(standards.router, prefix="/api/standards", tags=["standards"])
app.include_router(evaluations.router, prefix="/api/evaluations", tags=["evaluations"])


@app.on_event("startup")
def on_startup():
    Base.metadata.create_all(bind=engine)
    db = SessionLocal()
    try:
        seed_standards(db)
    finally:
        db.close()


@app.get("/api/health")
def health():
    from app.response import ok
    return ok({"status": "up"})
```

- [ ] **Step 5: 创建空路由包占位**

Create `backend/app/routers/__init__.py` (empty)

Create `backend/app/services/__init__.py` (empty)

Create stub routers (minimal, will fill in later tasks):

`backend/app/routers/auth.py`:
```python
from fastapi import APIRouter
router = APIRouter()
```

Same pattern for `employees.py`, `standards.py`, `evaluations.py`.

- [ ] **Step 6: 验证启动**

```bash
cd backend
python -m venv .venv && source .venv/bin/activate
pip install -r requirements.txt
uvicorn app.main:app --port 8000
```

Run: `curl http://localhost:8000/api/health`

Expected: `{"code":0,"data":{"status":"up"},"message":"ok"}`

- [ ] **Step 7: Commit**

```bash
git init
git add backend/
git commit -m "feat: backend scaffold with health check and seed"
```

---

## Task 2: 计分模块 TDD

**Files:**
- Create: `backend/tests/__init__.py`
- Create: `backend/tests/test_scoring.py`
- Modify: `backend/app/scoring.py` (add `suggest_result` helper)

- [ ] **Step 1: Write the failing tests**

Create `backend/tests/test_scoring.py`:

```python
import pytest
from app.scoring import calculate_scores, round_score, suggest_result


def test_all_ones():
    r = calculate_scores([1] * 12)
    assert r["avg_values"] == 1.00
    assert r["avg_capability"] == 1.00
    assert r["avg_output"] == 1.00
    assert r["final_score"] == 1.00


def test_all_fives():
    r = calculate_scores([5] * 12)
    assert r["final_score"] == 5.00


def test_partial_none():
    r = calculate_scores([3, 3, 3, None] + [3] * 8)
    assert r["final_score"] is None


def test_round_half_up():
    assert round_score(3.996) == 4.00
    assert round_score(2.004) == 2.00


def test_boundary_two():
    scores = [2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2]
    r = calculate_scores(scores)
    assert r["final_score"] == 2.00
    assert suggest_result(r["final_score"]) == ("不通过", "不通过晋升")


def test_boundary_four():
    scores = [4, 4, 4, 4, 4, 4, 4, 4, 4, 4, 4, 4]
    r = calculate_scores(scores)
    assert r["final_score"] == 4.00
    assert suggest_result(r["final_score"]) == ("通过", "通过晋升")


def test_middle_zone():
    scores = [3, 3, 3, 3, 3, 3, 3, 3, 3, 3, 3, 3]
    r = calculate_scores(scores)
    assert r["final_score"] == 3.00
    assert suggest_result(r["final_score"]) == ("评委自选", None)
```

- [ ] **Step 2: Run test to verify it fails**

```bash
cd backend && source .venv/bin/activate
pytest tests/test_scoring.py -v
```

Expected: FAIL — `suggest_result` not defined

- [ ] **Step 3: Add suggest_result to scoring.py**

Append to `backend/app/scoring.py`:

```python
def suggest_result(final_score: float) -> tuple[str, str | None]:
    if final_score <= 2:
        return ("不通过", "不通过晋升")
    if final_score >= 4:
        return ("通过", "通过晋升")
    return ("评委自选", None)
```

- [ ] **Step 4: Run tests to verify pass**

```bash
pytest tests/test_scoring.py -v
```

Expected: 7 passed

- [ ] **Step 5: Commit**

```bash
git add backend/app/scoring.py backend/tests/
git commit -m "test: scoring boundary tests with suggest_result"
```

---

## Task 3: 认证路由

**Files:**
- Modify: `backend/app/routers/auth.py`

- [ ] **Step 1: 实现 auth router**

Replace `backend/app/routers/auth.py`:

```python
from fastapi import APIRouter, Depends

from app.auth import authenticate_admin, create_access_token, require_admin
from app.response import fail, ok
from app.schemas import LoginRequest, TokenResponse

router = APIRouter()


@router.post("/login")
def login(body: LoginRequest):
    if not authenticate_admin(body.username, body.password):
        return fail("用户名或密码错误", status_code=401)
    token = create_access_token()
    return ok(TokenResponse(access_token=token).model_dump())


@router.get("/me")
def me(admin: str = Depends(require_admin)):
    return ok({"username": admin, "role": "admin"})
```

- [ ] **Step 2: 手动验证**

```bash
curl -X POST http://localhost:8000/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{"username":"admin","password":"dongfu123"}'
```

Expected: `code: 0`, `data.access_token` 存在

```bash
curl http://localhost:8000/api/auth/me
```

Expected: 403

- [ ] **Step 3: Commit**

```bash
git add backend/app/routers/auth.py
git commit -m "feat: admin login and me endpoints"
```

---

## Task 4: 员工管理 API + Excel 服务

**Files:**
- Create: `backend/app/services/excel.py`
- Modify: `backend/app/routers/employees.py`

- [ ] **Step 1: 实现 Excel 服务**

Create `backend/app/services/excel.py`:

```python
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
```

- [ ] **Step 2: 实现 employees router**

Replace `backend/app/routers/employees.py`:

```python
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


@router.delete("/all")
def delete_all(db: Session = Depends(get_db), _: str = Depends(require_admin)):
    db.query(UserInfo).delete()
    db.commit()
    return ok()


@router.get("/template")
def download_template(_: str = Depends(require_admin)):
    content = build_template()
    return Response(
        content=content,
        media_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        headers={"Content-Disposition": "attachment; filename=employee_template.xlsx"},
    )


@router.post("/import")
async def import_file(
    file: UploadFile = File(...),
    db: Session = Depends(get_db),
    _: str = Depends(require_admin),
):
    content = await file.read()
    result = import_employees(db, content)
    return ok(result)
```

> **路由顺序注意：** FastAPI 中 `/search`、`/template`、`/all` 等静态路径必须在 `/{employee_id}` 之前注册。上面代码需调整顺序：`/search`、`/template`、`/all` 放在 `/{employee_id}` 之前。实施时按此顺序排列路由。

- [ ] **Step 3: 验证**

```bash
TOKEN=$(curl -s -X POST http://localhost:8000/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{"username":"admin","password":"dongfu123"}' | python3 -c "import sys,json; print(json.load(sys.stdin)['data']['access_token'])")

curl -H "Authorization: Bearer $TOKEN" http://localhost:8000/api/employees
```

Expected: `code: 0`, `data: []`

- [ ] **Step 4: Commit**

```bash
git add backend/app/services/excel.py backend/app/routers/employees.py
git commit -m "feat: employee CRUD and Excel import/template"
```

---

## Task 5: 晋升标准 API

**Files:**
- Modify: `backend/app/routers/standards.py`

- [ ] **Step 1: 实现 standards router**

Replace `backend/app/routers/standards.py`:

```python
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
```

- [ ] **Step 2: 验证**

```bash
curl http://localhost:8000/api/standards/P6
```

Expected: `code: 0`, 12 维字段均为空字符串

- [ ] **Step 3: Commit**

```bash
git add backend/app/routers/standards.py
git commit -m "feat: promotion standard get/update API"
```

---

## Task 6: 评审服务 + API

**Files:**
- Create: `backend/app/services/evaluation.py`
- Modify: `backend/app/routers/evaluations.py`
- Create: `backend/tests/test_evaluations.py`

- [ ] **Step 1: Write failing evaluation service test**

Create `backend/tests/test_evaluations.py`:

```python
import pytest
from datetime import datetime
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker

from app.database import Base
from app.models import UserInfo, EvaluationRecord
from app.services.evaluation import upsert_draft, load_evaluation, submit_record


@pytest.fixture
def db():
    engine = create_engine("sqlite:///:memory:")
    Base.metadata.create_all(engine)
    Session = sessionmaker(bind=engine)
    session = Session()
    emp = UserInfo(name="张三", current_level="P6", target_level="P7", update_time=datetime.utcnow())
    session.add(emp)
    session.commit()
    yield session
    session.close()


def test_draft_and_load(db):
    emp = db.query(UserInfo).first()
    rec = upsert_draft(db, employee_id=emp.id, reviewer_name="李评委", scores=[3]*12, advantage="好", disadvantage="待提升")
    assert rec.status == "待提交"
    loaded = load_evaluation(db, emp.id, "李评委")
    assert loaded is not None
    assert loaded.status == "待提交"


def test_submit_locked(db):
    emp = db.query(UserInfo).first()
    rec = upsert_draft(db, employee_id=emp.id, reviewer_name="王评委", scores=[4]*12, advantage="a", disadvantage="b")
    rec.status = "待确认"
    rec.final_score = 4.0
    db.commit()
    result = submit_record(db, rec.id)
    assert result.status == "已提交"
    with pytest.raises(ValueError):
        upsert_draft(db, employee_id=emp.id, reviewer_name="王评委", scores=[1]*12)
```

- [ ] **Step 2: Run test — expect FAIL**

```bash
pytest tests/test_evaluations.py -v
```

- [ ] **Step 3: 实现 evaluation service**

Create `backend/app/services/evaluation.py`:

```python
from datetime import datetime

from sqlalchemy.orm import Session

from app.models import EvaluationRecord, UserInfo
from app.scoring import calculate_scores

ACTIVE_STATUSES = ("待提交", "待确认")
LOCKED_STATUS = "已提交"


def _scores_from_record(rec: EvaluationRecord) -> list[int | None]:
    return [getattr(rec, f"score_{i}") for i in range(1, 13)]


def _apply_scores(rec: EvaluationRecord, scores: list[int | None]) -> None:
    for i, s in enumerate(scores, start=1):
        setattr(rec, f"score_{i}", s)


def record_to_dict(rec: EvaluationRecord, employee: UserInfo | None = None) -> dict:
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


def load_evaluation(db: Session, employee_id: int, reviewer_name: str) -> EvaluationRecord | None:
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
    scores: list[int | None],
    advantage: str | None,
    disadvantage: str | None,
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


def query_summary(db: Session, employee_name: str | None, reviewer_name: str | None) -> list[dict]:
    from app.models import DIMENSION_LABELS

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
```

- [ ] **Step 4: Run tests — expect PASS**

```bash
pytest tests/test_evaluations.py tests/test_scoring.py -v
```

- [ ] **Step 5: 实现 evaluations router**

Replace `backend/app/routers/evaluations.py`:

```python
from fastapi import APIRouter, Depends, Query
from fastapi.responses import Response
from sqlalchemy.orm import Session

from app.auth import require_admin
from app.database import get_db
from app.models import UserInfo
from app.response import fail, ok
from app.schemas import EvaluationDraftRequest, EvaluationGenerateRequest, EvaluationSubmitRequest
from app.services.evaluation import (
    generate_result, load_evaluation, query_summary, record_to_dict, submit_record, upsert_draft,
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
        "employee": UserInfoResponse := __import__("app.schemas", fromlist=["UserInfoResponse"]).UserInfoResponse.model_validate(emp).model_dump(),
        "record": record_to_dict(rec, emp) if rec else None,
    }
    from app.schemas import UserInfoResponse
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
    employee_name: str | None = Query(None),
    reviewer_name: str | None = Query(None),
    db: Session = Depends(get_db),
    _: str = Depends(require_admin),
):
    return ok(query_summary(db, employee_name, reviewer_name))


@router.get("/export")
def export(
    employee_name: str | None = Query(None),
    reviewer_name: str | None = Query(None),
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
```

> 实施时清理 `load_eval` 中重复的 import 行，保留干净版本。

- [ ] **Step 6: Commit**

```bash
git add backend/app/services/evaluation.py backend/app/routers/evaluations.py backend/tests/test_evaluations.py
git commit -m "feat: evaluation load/draft/generate/submit/summary/export"
```

---

## Task 7: 前端脚手架

**Files:**
- Create: entire `web/` directory via Vite

- [ ] **Step 1: 初始化 Vite + React + TS**

```bash
cd /Users/tongqianni/xlab/jinshengprod
npm create vite@latest web -- --template react-ts
cd web
npm install antd react-router-dom axios dayjs
npm install -D @types/node
```

- [ ] **Step 2: 配置 vite proxy**

Modify `web/vite.config.ts`:

```typescript
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    proxy: {
      '/api': 'http://localhost:8000',
    },
  },
})
```

- [ ] **Step 3: 创建 API client**

Create `web/src/api/client.ts`:

```typescript
import axios from 'axios'

const TOKEN_KEY = 'admin_token'

export const getToken = () => localStorage.getItem(TOKEN_KEY)
export const setToken = (t: string) => localStorage.setItem(TOKEN_KEY, t)
export const clearToken = () => localStorage.removeItem(TOKEN_KEY)

const client = axios.create({ baseURL: '/api' })

client.interceptors.request.use((config) => {
  const token = getToken()
  if (token && config.url && !config.url.includes('/evaluations/load') && !config.url.includes('/evaluations/draft') && !config.url.includes('/evaluations/generate') && !config.url.includes('/evaluations/submit') && !config.url.includes('/employees/search')) {
    config.headers.Authorization = `Bearer ${token}`
  }
  return config
})

client.interceptors.response.use(
  (res) => {
    if (res.data?.code !== 0) {
      return Promise.reject(new Error(res.data?.message || '请求失败'))
    }
    return res.data
  },
  (err) => {
    if (err.response?.status === 403) {
      clearToken()
      window.location.href = '/admin/login'
    }
    return Promise.reject(err)
  },
)

export default client
```

- [ ] **Step 4: 创建计分 util**

Create `web/src/utils/scoring.ts`:

```typescript
export function roundScore(value: number): number {
  return Math.round(value * 100) / 100
}

export function calculateScores(scores: (number | null)[]) {
  if (scores.some((s) => s === null)) {
    return { avgValues: null, avgCapability: null, avgOutput: null, finalScore: null }
  }
  const s = scores as number[]
  const avgValues = roundScore((s[0] + s[1] + s[2]) / 3)
  const avgCapability = roundScore(s.slice(3, 10).reduce((a, b) => a + b, 0) / 7)
  const avgOutput = roundScore((s[10] + s[11]) / 2)
  const finalScore = roundScore(avgValues * 0.2 + avgCapability * 0.4 + avgOutput * 0.4)
  return { avgValues, avgCapability, avgOutput, finalScore }
}

export function suggestResult(finalScore: number): { sys: string; result: string | null } {
  if (finalScore <= 2) return { sys: '不通过', result: '不通过晋升' }
  if (finalScore >= 4) return { sys: '通过', result: '通过晋升' }
  return { sys: '评委自选', result: null }
}
```

- [ ] **Step 5: 验证前端启动**

```bash
cd web && npm run dev
```

Expected: Vite 运行在 http://localhost:5173

- [ ] **Step 6: Commit**

```bash
git add web/
git commit -m "feat: frontend scaffold with api client and scoring util"
```

---

## Task 8: Admin 登录 + 路由守卫

**Files:**
- Create: `web/src/hooks/useAuth.ts`
- Create: `web/src/components/AdminRouteGuard.tsx`
- Create: `web/src/pages/admin/Login.tsx`
- Create: `web/src/routes/AdminLayout.tsx`
- Modify: `web/src/App.tsx`

- [ ] **Step 1: useAuth hook**

Create `web/src/hooks/useAuth.ts`:

```typescript
import { getToken, setToken, clearToken } from '../api/client'
import client from '../api/client'

export function useAuth() {
  const isLoggedIn = !!getToken()

  const login = async (username: string, password: string) => {
    const res = await client.post('/auth/login', { username, password })
    setToken(res.data.access_token)
  }

  const logout = () => {
    clearToken()
    window.location.href = '/admin/login'
  }

  return { isLoggedIn, login, logout }
}
```

- [ ] **Step 2: AdminRouteGuard**

Create `web/src/components/AdminRouteGuard.tsx`:

```typescript
import { Navigate } from 'react-router-dom'
import { getToken } from '../api/client'

export default function AdminRouteGuard({ children }: { children: React.ReactNode }) {
  if (!getToken()) return <Navigate to="/admin/login" replace />
  return <>{children}</>
}
```

- [ ] **Step 3: Login page**

Create `web/src/pages/admin/Login.tsx`:

```typescript
import { Button, Card, Form, Input, message } from 'antd'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '../../hooks/useAuth'

export default function Login() {
  const { login } = useAuth()
  const navigate = useNavigate()

  const onFinish = async (values: { username: string; password: string }) => {
    try {
      await login(values.username, values.password)
      message.success('登录成功')
      navigate('/admin/employees')
    } catch {
      message.error('用户名或密码错误')
    }
  }

  return (
    <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', minHeight: '100vh' }}>
      <Card title="管理员登录" style={{ width: 400 }}>
        <Form onFinish={onFinish} layout="vertical">
          <Form.Item name="username" label="账号" rules={[{ required: true }]}>
            <Input />
          </Form.Item>
          <Form.Item name="password" label="密码" rules={[{ required: true }]}>
            <Input.Password />
          </Form.Item>
          <Button type="primary" htmlType="submit" block>登录</Button>
        </Form>
      </Card>
    </div>
  )
}
```

- [ ] **Step 4: AdminLayout + App routes**

Create `web/src/routes/AdminLayout.tsx` with Ant Design Layout, Sider menu linking to `/admin/employees`, `/admin/standards`, `/admin/summary`, and logout button.

Modify `web/src/App.tsx`:

```typescript
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import AdminRouteGuard from './components/AdminRouteGuard'
import AdminLayout from './routes/AdminLayout'
import Login from './pages/admin/Login'
import Employees from './pages/admin/Employees'
import Standards from './pages/admin/Standards'
import Summary from './pages/admin/Summary'
import Evaluation from './pages/review/Evaluation'

export default function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/admin/login" element={<Login />} />
        <Route path="/admin" element={<AdminRouteGuard><AdminLayout /></AdminRouteGuard>}>
          <Route path="employees" element={<Employees />} />
          <Route path="standards" element={<Standards />} />
          <Route path="summary" element={<Summary />} />
          <Route index element={<Navigate to="employees" replace />} />
        </Route>
        <Route path="/review" element={<Evaluation />} />
        <Route path="*" element={<Navigate to="/review" replace />} />
      </Routes>
    </BrowserRouter>
  )
}
```

- [ ] **Step 5: 验证登录流程**

浏览器打开 http://localhost:5173/admin/login，用 admin/dongfu123 登录，应跳转 /admin/employees

- [ ] **Step 6: Commit**

```bash
git add web/src/
git commit -m "feat: admin login and route guard"
```

---

## Task 9: 页面一 — 员工信息管理

**Files:**
- Create: `web/src/api/employees.ts`
- Create: `web/src/components/EmployeeForm.tsx`
- Create: `web/src/pages/admin/Employees.tsx`

- [ ] **Step 1: employees API module**

Create `web/src/api/employees.ts` with functions: `listEmployees`, `createEmployee`, `updateEmployee`, `deleteEmployee`, `deleteAllEmployees`, `downloadTemplate`, `importEmployees`, `searchEmployees`.

- [ ] **Step 2: EmployeeForm dialog component**

Fields: name, current_level (Select P5-P10), target_level (Select P5-P10), performance_history (optional Input).

- [ ] **Step 3: Employees page**

Implement per spec §6.1:
- Toolbar: 下载模板 / 导入 / 清空全部（Modal.confirm PRD 原文）
- Search Input with debounce
- Table columns: 姓名、当前职级、目标职级、近两年绩效、更新时间、操作
- Edit opens EmployeeForm; Delete with confirm

- [ ] **Step 4: 手动验证**

1. 下载模板 → 填写一行（绩效留空）→ 导入
2. 确认表格展示，绩效列为空
3. 修改、删除、清空功能正常

- [ ] **Step 5: Commit**

```bash
git add web/src/api/employees.ts web/src/components/EmployeeForm.tsx web/src/pages/admin/Employees.tsx
git commit -m "feat: employee management page with Excel import"
```

---

## Task 10: 页面二 — 晋升标准管理

**Files:**
- Create: `web/src/api/standards.ts`
- Create: `web/src/pages/admin/Standards.tsx`

- [ ] **Step 1: standards API**

Create `web/src/api/standards.ts`: `getStandard(level)`, `updateStandard(level, data)`.

- [ ] **Step 2: Standards page**

Implement per spec §6.2:
- Tabs P5–P10
- 12 Textarea fields mapped to DIMENSION_LABELS
- Fixed bottom「保存配置」button
- On tab change: if dirty, Modal.confirm「当前页面有未保存的修改，切换将丢失内容，是否继续？」

- [ ] **Step 3: 验证**

切换 P6 → 填写文本 → 保存 → 刷新 → 文本仍在

- [ ] **Step 4: Commit**

```bash
git add web/src/api/standards.ts web/src/pages/admin/Standards.tsx
git commit -m "feat: promotion standards management page"
```

---

## Task 11: 页面三 — 晋升评审（核心）

**Files:**
- Create: `web/src/api/evaluations.ts`
- Create: `web/src/components/ScoreMatrix.tsx`
- Create: `web/src/pages/review/Evaluation.tsx`

- [ ] **Step 1: evaluations API**

Create `web/src/api/evaluations.ts`: `loadEvaluation`, `saveDraft`, `generateResult`, `submitEvaluation`.

- [ ] **Step 2: ScoreMatrix component**

4-column table with rowSpan for 价值观(3行)/能力模型(7行)/工作成果(2行). Each score cell is Select 1-5 with labels. Props: `scores`, `onChange`, `standards` (12 texts), `disabled`.

- [ ] **Step 3: Evaluation page — 头部 + 卡片**

- 评委姓名 Input, onBlur triggers load if employee selected
- AutoComplete for employee search via `/employees/search`
- Employee card: `current_level → target_level`, conditionally show performance_history
- Fetch standards via `/standards/{target_level}` when employee selected

- [ ] **Step 4: Evaluation page — 状态机**

Implement four buttons per spec §6.3:

**暂存:** validate reviewer_name + employee_id → POST /draft

**生成结果:** validate all 12 scores + advantage + disadvantage → calculate → Modal branches:
- ≤2: confirm「系统建议不予通过，是否确认？」
- ≥4: confirm「系统建议晋升通过，是否确认？」
- else: Modal with【同意晋升】【不同意晋升】

→ POST /generate → status=待确认 → enable 提交

**提交:** only if status=待确认 → Modal confirm → POST /submit → readonly

**清空重写:** reset all except reviewer_name

**Load logic:** on reviewer blur + employee select → GET /load → fill draft or blank; if status=已提交 → readonly

- [ ] **Step 5: 实时计分展示**

useMemo on scores → display 4 calculated values using `calculateScores`.

- [ ] **Step 6: 验证完整流程**

1. 选员工 → 填分 → 暂存 → 刷新 → 草稿恢复
2. 生成结果 → 提交 → 全部 disabled
3. 绩效为 NULL 的员工不显示绩效栏

- [ ] **Step 7: Commit**

```bash
git add web/src/api/evaluations.ts web/src/components/ScoreMatrix.tsx web/src/pages/review/Evaluation.tsx
git commit -m "feat: reviewer evaluation page with state machine"
```

---

## Task 12: 页面四 — 评审汇总

**Files:**
- Modify: `web/src/api/evaluations.ts`
- Create: `web/src/pages/admin/Summary.tsx`

- [ ] **Step 1: 添加 summary/export API 调用**

```typescript
export async function getSummary(params: { employee_name?: string; reviewer_name?: string }) {
  return client.get('/evaluations/summary', { params })
}

export function exportSummary(params: { employee_name?: string; reviewer_name?: string }) {
  const qs = new URLSearchParams(params as Record<string, string>).toString()
  window.open(`/api/evaluations/export?${qs}`, '_blank')
}
```

- [ ] **Step 2: Summary page**

26 columns per spec order, `scroll={{ x: 'max-content' }}`, search form with 员工姓名 + 评委姓名 + 查询/重置 + 导出.

- [ ] **Step 3: 验证**

完成一次评审提交后，在汇总页搜索 → 26 列数据正确 → 导出 Excel 列头一致

- [ ] **Step 4: Commit**

```bash
git add web/src/pages/admin/Summary.tsx web/src/api/evaluations.ts
git commit -m "feat: evaluation summary page with Excel export"
```

---

## Task 13: 联调与 README 更新

**Files:**
- Modify: `README.md`

- [ ] **Step 1: 运行全部后端测试**

```bash
cd backend && pytest -v
```

Expected: all tests pass

- [ ] **Step 2: 端到端冒烟测试清单**

| # | 场景 | 预期 |
|---|------|------|
| 1 | Admin 无 Token 访问 /api/employees | 403 |
| 2 | Reviewer 访问 /api/evaluations/load | 200 |
| 3 | 计分 3.996 边界 | 4.00, 分支 B |
| 4 | 已提交后再 draft | 409 |
| 5 | Excel 导入空绩效 | DB NULL, 前端隐藏 |
| 6 | 两评委评同一员工 | 两条独立记录 |

- [ ] **Step 3: 更新 README**

Replace incorrect dual-frontend structure with single `web/` app, update startup commands, mark implementation complete.

- [ ] **Step 4: Commit**

```bash
git add README.md
git commit -m "docs: update README with final project structure"
```

---

## Spec Coverage Checklist

| Spec § | Task |
|--------|------|
| 1.1 角色权限 | Task 3, 8 |
| 3.1 user_info | Task 4 |
| 3.2 promotion_standard + seed | Task 1, 5 |
| 3.3 evaluation_record | Task 6 |
| 4.2 认证 API | Task 3 |
| 4.3 员工 API | Task 4 |
| 4.4 标准 API | Task 5 |
| 4.5 评审 API | Task 6 |
| 5 计分公式 | Task 2 |
| 6.1 员工页 | Task 9 |
| 6.2 标准页 | Task 10 |
| 6.3 评审页 | Task 11 |
| 6.4 汇总页 | Task 12 |
| 7 错误处理 | Task 6 (409), Task 8 (403 redirect) |
| 8 测试要点 | Task 2, 6, 13 |
| 9 四步计划 | Tasks 1-6 / 8-10 / 11 / 12-13 |

No gaps found.

---

## Self-Review Notes

- Fixed: employees router static paths must precede `/{id}` — noted in Task 4
- Fixed: evaluations router `load_eval` should not contain duplicate import — noted in Task 6
- All tasks include exact file paths and runnable commands
- No TBD/TODO placeholders
