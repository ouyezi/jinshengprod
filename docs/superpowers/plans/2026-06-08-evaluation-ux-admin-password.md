# 评委端体验优化与管理员改密 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 晋升判定前移至「生成结果」、自动暂存取代手动暂存、状态重命名为「待生成结果/待提交」、管理员可在后台修改密码。

**Architecture:** 后端先完成状态迁移与 `upsert_draft` 分支逻辑，再改评委页生成/提交/自动暂存流程；管理端独立增加 `admin_account` 表与 bcrypt 认证及改密 API。前端通过 `reviewerResult` state 驱动 `canSubmit` 与实时计分展示。

**Tech Stack:** Python 3.11+, FastAPI, SQLAlchemy, pytest, passlib[bcrypt] | React 18, TypeScript, Ant Design 5

**Spec:** `docs/superpowers/specs/2026-06-08-evaluation-ux-admin-password-design.md`

---

## File Map

| 文件 | 职责 |
|------|------|
| `backend/app/models.py` | `AdminAccount` 模型；`EvaluationRecord.status` 默认 `待生成结果` |
| `backend/app/migrate.py` | `migrate_evaluation_status_labels()`、`migrate_admin_account()` |
| `backend/app/main.py` | startup 调用新迁移 |
| `backend/app/services/evaluation.py` | 状态常量、`upsert_draft` 分支、`generate_result`/`submit_record` 新状态名 |
| `backend/app/auth.py` | DB+bcrypt 登录、`create_access_token(username)` |
| `backend/app/routers/auth.py` | `POST /change-password` |
| `backend/app/schemas.py` | `ChangePasswordRequest` |
| `backend/tests/test_evaluations.py` | 状态名 + 自动暂存分支测试 |
| `backend/tests/test_auth.py` | 登录、改密测试 |
| `web/src/hooks/useAutoSaveDraft.ts` | 防抖/flush/beforeunload 自动暂存 |
| `web/src/pages/review/Evaluation.tsx` | 生成判定、提交确认、晋升结果展示、接入 hook |
| `web/src/pages/admin/Summary.tsx` | 筛选状态选项更新 |
| `web/src/routes/AdminLayout.tsx` | 修改密码入口 + Modal |
| `web/src/api/auth.ts` | `changePassword` API |

---

## Task 1: 状态重命名迁移

**Files:**
- Modify: `backend/app/migrate.py`
- Modify: `backend/app/models.py:99`
- Modify: `backend/app/main.py:27-29`
- Test: `backend/tests/test_evaluations.py`

- [ ] **Step 1: 写失败测试 — 迁移后无旧状态名**

在 `backend/tests/test_evaluations.py` 追加：

```python
from app.migrate import migrate_evaluation_status_labels


def test_migrate_evaluation_status_labels(db):
    emp = db.query(UserInfo).first()
    draft = EvaluationRecord(
        employee_id=emp.id,
        reviewer_name="迁移评委",
        status="待提交",
        create_time=datetime.utcnow(),
        update_time=datetime.utcnow(),
    )
    ready = EvaluationRecord(
        employee_id=emp.id,
        reviewer_name="迁移评委2",
        status="待确认",
        final_score=4.0,
        reviewer_result="通过晋升",
        create_time=datetime.utcnow(),
        update_time=datetime.utcnow(),
    )
    db.add_all([draft, ready])
    db.commit()

    migrate_evaluation_status_labels()

    db.refresh(draft)
    db.refresh(ready)
    assert draft.status == "待生成结果"
    assert ready.status == "待提交"
    statuses = {r[0] for r in db.query(EvaluationRecord.status).distinct().all()}
    assert "待确认" not in statuses
```

- [ ] **Step 2: 运行测试确认失败**

Run: `cd backend && pytest tests/test_evaluations.py::test_migrate_evaluation_status_labels -v`  
Expected: FAIL — `migrate_evaluation_status_labels` 未定义

- [ ] **Step 3: 实现迁移函数**

在 `backend/app/migrate.py` 末尾追加：

```python
def migrate_evaluation_status_labels() -> None:
    """旧 status 待提交/待确认 → 待生成结果/待提交。幂等：无旧「待确认」则跳过。"""
    inspector = inspect(engine)
    if "evaluation_record" not in inspector.get_table_names():
        return

    with engine.connect() as conn:
        has_old_ready = conn.execute(
            text("SELECT 1 FROM evaluation_record WHERE status = '待确认' LIMIT 1")
        ).fetchone()
    if not has_old_ready:
        return

    with engine.begin() as conn:
        conn.execute(
            text("UPDATE evaluation_record SET status = '待生成结果' WHERE status = '待提交'")
        )
        conn.execute(
            text("UPDATE evaluation_record SET status = '待提交' WHERE status = '待确认'")
        )
```

修改 `backend/app/models.py`：

```python
status: Mapped[str] = mapped_column(String(20), nullable=False, default="待生成结果")
```

修改 `backend/app/main.py` `on_startup`：

```python
from app.migrate import (
    migrate_evaluation_record,
    migrate_user_info,
    migrate_user_info_pinyin,
    migrate_evaluation_status_labels,
)

@app.on_event("startup")
def on_startup():
    migrate_user_info()
    migrate_evaluation_record()
    migrate_evaluation_status_labels()
    migrate_user_info_pinyin()
    ...
```

- [ ] **Step 4: 运行测试确认通过**

Run: `cd backend && pytest tests/test_evaluations.py::test_migrate_evaluation_status_labels -v`  
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add backend/app/migrate.py backend/app/models.py backend/app/main.py backend/tests/test_evaluations.py
git commit -m "refactor(db): migrate evaluation status labels to 待生成结果/待提交"
```

---

## Task 2: 评审服务 — 状态常量与 upsert_draft 分支

**Files:**
- Modify: `backend/app/services/evaluation.py`
- Test: `backend/tests/test_evaluations.py`

- [ ] **Step 1: 写失败测试 — 新状态名与 draft 分支**

替换/更新 `test_draft_and_load` 并追加：

```python
from app.services.evaluation import (
    DRAFT_STATUS,
    READY_SUBMIT_STATUS,
    generate_result,
    upsert_draft,
)


def test_draft_and_load(db):
    emp = db.query(UserInfo).first()
    rec = upsert_draft(
        db, employee_id=emp.id, reviewer_name="李评委", scores=[3] * 12,
        advantage="好", disadvantage="待提升",
    )
    assert rec.status == DRAFT_STATUS
    loaded = load_evaluation(db, emp.id, "李评委")
    assert loaded.status == DRAFT_STATUS


def test_upsert_ready_submit_comment_only_keeps_result(db):
    emp = db.query(UserInfo).first()
    rec = generate_result(
        db, emp.id, "陈评委",
        scores=[4] * 12, advantage="a", disadvantage="b",
        sys_suggestion="通过", reviewer_result="通过晋升",
    )
    assert rec.status == READY_SUBMIT_STATUS

    updated = upsert_draft(
        db, emp.id, "陈评委",
        scores=[4] * 12, advantage="新优势", disadvantage="b",
    )
    assert updated.status == READY_SUBMIT_STATUS
    assert updated.reviewer_result == "通过晋升"
    assert updated.advantage == "新优势"


def test_upsert_ready_submit_score_change_clears_result(db):
    emp = db.query(UserInfo).first()
    rec = generate_result(
        db, emp.id, "周评委",
        scores=[4] * 12, advantage="a", disadvantage="b",
        sys_suggestion="通过", reviewer_result="通过晋升",
    )

    updated = upsert_draft(
        db, emp.id, "周评委",
        scores=[3] * 12, advantage="a", disadvantage="b",
    )
    assert updated.status == READY_SUBMIT_STATUS
    assert updated.reviewer_result is None
    assert updated.final_score is None
```

更新 `test_load_skips_submitted` / `test_resubmit_creates_new_record` 中的 `rec.status = "待确认"` → `READY_SUBMIT_STATUS`（`"待提交"`），`assert new_rec.status == "待提交"` → `assert new_rec.status == DRAFT_STATUS`。

- [ ] **Step 2: 运行测试确认失败**

Run: `cd backend && pytest tests/test_evaluations.py::test_upsert_ready_submit_comment_only_keeps_result tests/test_evaluations.py::test_upsert_ready_submit_score_change_clears_result -v`  
Expected: FAIL

- [ ] **Step 3: 实现 evaluation 服务**

重写 `backend/app/services/evaluation.py` 顶部常量与核心函数：

```python
DRAFT_STATUS = "待生成结果"
READY_SUBMIT_STATUS = "待提交"
LOCKED_STATUS = "已提交"
ACTIVE_STATUSES = (DRAFT_STATUS, READY_SUBMIT_STATUS)


def _scores_from_record(rec: EvaluationRecord) -> list[Optional[int]]:
    return [getattr(rec, f"score_{i}") for i in range(1, 13)]


def _scores_changed(rec: EvaluationRecord, scores: list[Optional[int]]) -> bool:
    return _scores_from_record(rec) != list(scores)


def _clear_generated_fields(rec: EvaluationRecord) -> None:
    rec.avg_values = None
    rec.avg_capability = None
    rec.avg_output = None
    rec.final_score = None
    rec.sys_suggestion = None
    rec.reviewer_result = None


def upsert_draft(...) -> EvaluationRecord:
    rec = find_active_record(db, employee_id, reviewer_name)
    now = datetime.utcnow()
    if not rec:
        rec = EvaluationRecord(
            employee_id=employee_id,
            reviewer_name=reviewer_name,
            status=DRAFT_STATUS,
            create_time=now,
            update_time=now,
        )
        db.add(rec)
        _apply_scores(rec, scores)
        rec.advantage = advantage
        rec.disadvantage = disadvantage
        rec.status = DRAFT_STATUS
        rec.update_time = now
        db.commit()
        db.refresh(rec)
        return rec

    scores_changed = _scores_changed(rec, scores)
    _apply_scores(rec, scores)
    rec.advantage = advantage
    rec.disadvantage = disadvantage

    if rec.status == READY_SUBMIT_STATUS:
        if scores_changed:
            _clear_generated_fields(rec)
        # 保持 READY_SUBMIT_STATUS
    else:
        rec.status = DRAFT_STATUS

    rec.update_time = now
    db.commit()
    db.refresh(rec)
    return rec


def generate_result(...) -> EvaluationRecord:
    ...
    rec.status = READY_SUBMIT_STATUS
    ...


def submit_record(db: Session, record_id: int) -> EvaluationRecord:
    ...
    if rec.status != READY_SUBMIT_STATUS:
        raise ValueError("仅待提交状态可提交")
    if not rec.reviewer_result:
        raise ValueError("请先生成结果")
    rec.status = LOCKED_STATUS
    ...
```

- [ ] **Step 4: 运行全部评审测试**

Run: `cd backend && pytest tests/test_evaluations.py -v`  
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add backend/app/services/evaluation.py backend/tests/test_evaluations.py
git commit -m "feat(backend): upsert_draft branches for 待提交 auto-save"
```

---

## Task 3: 评委页 — 晋升判定前移与提交确认

**Files:**
- Modify: `web/src/pages/review/Evaluation.tsx`

- [ ] **Step 1: 扩展 applyRecord 与状态常量**

在 `Evaluation.tsx` 顶部增加：

```typescript
const DRAFT_STATUS = '待生成结果'
const READY_SUBMIT_STATUS = '待提交'
```

扩展 `applyRecord` 增加 `setReviewerResult`：

```typescript
function applyRecord(
  record: EvaluationRecord | null,
  setters: {
    setScores: (s: (number | null)[]) => void
    setAdvantage: (v: string) => void
    setDisadvantage: (v: string) => void
    setStatus: (s: string | null) => void
    setRecordId: (id: number | null) => void
    setReviewerResult: (v: string | null) => void
  },
) {
  if (record) {
    setters.setScores([...record.scores])
    setters.setAdvantage(record.advantage ?? '')
    setters.setDisadvantage(record.disadvantage ?? '')
    setters.setStatus(record.status)
    setters.setRecordId(record.id)
    setters.setReviewerResult(record.reviewer_result)
  } else {
    setters.setScores([...EMPTY_SCORES])
    setters.setAdvantage('')
    setters.setDisadvantage('')
    setters.setStatus(DRAFT_STATUS)
    setters.setRecordId(null)
    setters.setReviewerResult(null)
  }
}
```

组件内：

```typescript
const [reviewerResult, setReviewerResult] = useState<string | null>(null)
const readonly = status === '已提交'
const canSubmit =
  status === READY_SUBMIT_STATUS && reviewerResult != null && !readonly
const needsRegenerate =
  status === READY_SUBMIT_STATUS && reviewerResult == null && !readonly
```

`loadDraft` 的 `applyRecord` 调用传入 `setReviewerResult`。

- [ ] **Step 2: 生成结果弹窗移到 handleGenerate**

替换 `handleGenerate`：

```typescript
const handleGenerate = () => {
  if (!validateReviewerAndEmployee()) return
  if (!validateForGenerate()) return

  const { finalScore } = calculateScores(scores)
  if (finalScore === null) return

  const { sys, result } = suggestResult(finalScore)

  if (finalScore > 2 && finalScore < 4) {
    Modal.confirm({
      title: '生成评审结果',
      content: '总分未达绝对标准，请选择是否同意晋升。',
      okText: '同意晋升',
      cancelText: '不同意晋升',
      closable: false,
      maskClosable: false,
      onOk: () => void doGenerate(sys, '通过晋升'),
      onCancel: () => void doGenerate(sys, '不通过晋升'),
    })
    return
  }

  void doGenerate(sys, result!)
}
```

`doGenerate` 成功后增加 `setReviewerResult(record.reviewer_result)`。

- [ ] **Step 3: 简化 handleSubmit / submitFlow**

```typescript
const submitFlow = async () => {
  if (!employee || !recordId) return
  setSaving(true)
  try {
    const record = await submitEvaluation(recordId)
    setStatus(record.status)
    message.success('提交成功')
  } catch (err) {
    message.error(err instanceof Error ? err.message : '提交失败')
  } finally {
    setSaving(false)
  }
}

const handleSubmit = () => {
  if (!canSubmit || !recordId || !reviewerResult) {
    message.warning('请先生成结果')
    return
  }
  Modal.confirm({
    title: '提交评审',
    content: `当前判定：${reviewerResult}。提交后不可修改，确定提交吗？`,
    okText: '确定提交',
    cancelText: '取消',
    onOk: () => submitFlow(),
  })
}
```

删除 `submitFlow` 的 `reviewerResultOverride` 及提交时 2–4 分弹窗。

- [ ] **Step 4: 实时计分行展示晋升结果**

在「最终总分」后追加：

```tsx
<Text>
  晋升结果：
  {reviewerResult ? (
    <Text
      strong
      type={reviewerResult === '通过晋升' ? 'success' : 'danger'}
    >
      {reviewerResult}
    </Text>
  ) : (
    <Text strong>—</Text>
  )}
</Text>
```

`needsRegenerate` 时在按钮区上方显示：

```tsx
{needsRegenerate && (
  <Text type="warning">分数已变更，请重新生成结果后再提交</Text>
)}
```

- [ ] **Step 5: 构建验证**

Run: `cd web && npm run build`  
Expected: PASS

- [ ] **Step 6: Commit**

```bash
git add web/src/pages/review/Evaluation.tsx
git commit -m "feat(web): promotion verdict at generate and confirm-only submit"
```

---

## Task 4: 自动暂存 Hook

**Files:**
- Create: `web/src/hooks/useAutoSaveDraft.ts`
- Modify: `web/src/pages/review/Evaluation.tsx`

- [ ] **Step 1: 创建 useAutoSaveDraft**

新建 `web/src/hooks/useAutoSaveDraft.ts`：

```typescript
import { useCallback, useEffect, useRef } from 'react'
import { message } from 'antd'
import { saveDraft, type DraftPayload } from '../api/evaluations'

const DEBOUNCE_MS = 1500

type SaveStatus = 'idle' | 'saving' | 'saved'

interface Options {
  enabled: boolean
  payload: DraftPayload | null
  onSaved: (record: import('../api/evaluations').EvaluationRecord) => void
  setSaveStatus: (s: SaveStatus) => void
}

export function useAutoSaveDraft({ enabled, payload, onSaved, setSaveStatus }: Options) {
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const lastSavedRef = useRef<string>('')
  const payloadRef = useRef(payload)
  payloadRef.current = payload

  const flush = useCallback(async () => {
    if (timerRef.current) {
      clearTimeout(timerRef.current)
      timerRef.current = null
    }
    const p = payloadRef.current
    if (!enabled || !p) return
    const key = JSON.stringify(p)
    if (key === lastSavedRef.current) return

    setSaveStatus('saving')
    try {
      const record = await saveDraft(p)
      lastSavedRef.current = key
      onSaved(record)
      setSaveStatus('saved')
      window.setTimeout(() => setSaveStatus('idle'), 3000)
    } catch (err) {
      setSaveStatus('idle')
      message.error(err instanceof Error ? err.message : '自动保存失败')
    }
  }, [enabled, onSaved, setSaveStatus])

  useEffect(() => {
    if (!enabled || !payload) return
    if (timerRef.current) clearTimeout(timerRef.current)
    timerRef.current = setTimeout(() => void flush(), DEBOUNCE_MS)
    return () => {
      if (timerRef.current) clearTimeout(timerRef.current)
    }
  }, [enabled, payload, flush])

  useEffect(() => {
    const onBeforeUnload = () => {
      void flush()
    }
    window.addEventListener('beforeunload', onBeforeUnload)
    return () => window.removeEventListener('beforeunload', onBeforeUnload)
  }, [flush])

  return { flush }
}
```

- [ ] **Step 2: 接入 Evaluation.tsx**

移除 `handleSaveDraft` 与「暂存」按钮。

增加：

```typescript
const [saveStatus, setSaveStatus] = useState<'idle' | 'saving' | 'saved'>('idle')

const draftPayload = useMemo(() => {
  if (!employee || !reviewerName.trim() || readonly) return null
  return {
    employee_id: employee.id,
    reviewer_name: reviewerName.trim(),
    scores,
    advantage: advantage || null,
    disadvantage: disadvantage || null,
  }
}, [employee, reviewerName, scores, advantage, disadvantage, readonly])

const onDraftSaved = useCallback((record: EvaluationRecord) => {
  setStatus(record.status)
  setRecordId(record.id)
  setReviewerResult(record.reviewer_result)
}, [])

const { flush } = useAutoSaveDraft({
  enabled: !readonly && !!draftPayload,
  payload: draftPayload,
  onSaved: onDraftSaved,
  setSaveStatus,
})
```

- 切换员工 `handleEmployeeSelect`：先 `await flush()` 再 `loadDraft`
- `handleReviewerBlur`：已有 loadDraft，前加 `void flush()`
- 实时计分 Card `title` 旁显示 saveStatus 文案

- [ ] **Step 3: 构建验证**

Run: `cd web && npm run build`  
Expected: PASS

- [ ] **Step 4: Commit**

```bash
git add web/src/hooks/useAutoSaveDraft.ts web/src/pages/review/Evaluation.tsx
git commit -m "feat(web): debounced auto-save draft, remove manual save button"
```

---

## Task 5: 管理端汇总筛选状态名

**Files:**
- Modify: `web/src/pages/admin/Summary.tsx:70-78`

- [ ] **Step 1: 更新筛选选项**

```typescript
const STATUS_OPTIONS = [
  { label: '待生成结果', value: '待生成结果' },
  { label: '待提交', value: '待提交' },
  { label: '已提交', value: '已提交' },
]
```

删除旧 `待确认` 选项。

- [ ] **Step 2: 构建验证**

Run: `cd web && npm run build`  
Expected: PASS

- [ ] **Step 3: Commit**

```bash
git add web/src/pages/admin/Summary.tsx
git commit -m "fix(web): summary status filter uses renamed labels"
```

---

## Task 6: AdminAccount 模型与种子迁移

**Files:**
- Modify: `backend/app/models.py`
- Modify: `backend/app/migrate.py`
- Modify: `backend/app/main.py`
- Test: `backend/tests/test_auth.py`（新建）

- [ ] **Step 1: 写失败测试 — 种子后可登录**

新建 `backend/tests/test_auth.py`：

```python
import pytest
from datetime import datetime
from fastapi.testclient import TestClient
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool

from app.database import Base, get_db
from app.main import app
from app.migrate import migrate_admin_account
from app.models import AdminAccount
from app.config import settings


@pytest.fixture
def engine():
    eng = create_engine(
        "sqlite:///:memory:",
        connect_args={"check_same_thread": False},
        poolclass=StaticPool,
    )
    Base.metadata.create_all(eng)
    return eng


@pytest.fixture
def db(engine):
    Session = sessionmaker(bind=engine)
    session = Session()
    yield session
    session.close()


@pytest.fixture
def client(engine):
    Session = sessionmaker(bind=engine)

    def override_get_db():
        session = Session()
        try:
            yield session
        finally:
            session.close()

    app.dependency_overrides[get_db] = override_get_db
    yield TestClient(app)
    app.dependency_overrides.clear()


def test_admin_seed_and_login(client, engine):
    migrate_admin_account()
    r = client.post(
        "/api/auth/login",
        json={"username": settings.admin_username, "password": settings.admin_password},
    )
    assert r.status_code == 200
    assert r.json()["code"] == 0
    assert r.json()["data"]["access_token"]
```

- [ ] **Step 2: 运行测试确认失败**

Run: `cd backend && pytest tests/test_auth.py::test_admin_seed_and_login -v`  
Expected: FAIL — 登录仍走 env 明文或 `migrate_admin_account` 未定义

- [ ] **Step 3: 实现模型与迁移**

`backend/app/models.py` 追加：

```python
class AdminAccount(Base):
    __tablename__ = "admin_account"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    username: Mapped[str] = mapped_column(String(50), unique=True, nullable=False)
    password_hash: Mapped[str] = mapped_column(String(255), nullable=False)
    update_time: Mapped[datetime] = mapped_column(DateTime, nullable=False, default=datetime.utcnow)
```

`backend/app/migrate.py`：

```python
from passlib.context import CryptContext
from app.config import settings
from app.models import AdminAccount

pwd_context = CryptContext(schemes=["bcrypt"], deprecated="auto")


def migrate_admin_account() -> None:
    inspector = inspect(engine)
    if "admin_account" not in inspector.get_table_names():
        AdminAccount.__table__.create(engine)

    db = SessionLocal()
    try:
        if db.query(AdminAccount).count() == 0:
            db.add(
                AdminAccount(
                    username=settings.admin_username,
                    password_hash=pwd_context.hash(settings.admin_password),
                    update_time=datetime.utcnow(),
                )
            )
            db.commit()
    finally:
        db.close()
```

`main.py` startup 在 `create_all` 前调用 `migrate_admin_account()`。

- [ ] **Step 4: 运行测试**

Run: `cd backend && pytest tests/test_auth.py::test_admin_seed_and_login -v`  
Expected: 仍 FAIL（auth 未改 DB）— 继续 Task 7

- [ ] **Step 5: Commit**

```bash
git add backend/app/models.py backend/app/migrate.py backend/app/main.py backend/tests/test_auth.py
git commit -m "feat(backend): add admin_account table with env seed migration"
```

---

## Task 7: bcrypt 认证与改密 API

**Files:**
- Modify: `backend/app/auth.py`
- Modify: `backend/app/routers/auth.py`
- Modify: `backend/app/schemas.py`
- Test: `backend/tests/test_auth.py`

- [ ] **Step 1: 写失败测试 — 改密**

在 `test_auth.py` 追加：

```python
def test_change_password_and_relogin(client, engine):
    migrate_admin_account()
    login = client.post(
        "/api/auth/login",
        json={"username": settings.admin_username, "password": settings.admin_password},
    )
    token = login.json()["data"]["access_token"]

    bad = client.post(
        "/api/auth/change-password",
        json={"old_password": "wrong", "new_password": "newpass1"},
        headers={"Authorization": f"Bearer {token}"},
    )
    assert bad.status_code == 400

    ok = client.post(
        "/api/auth/change-password",
        json={"old_password": settings.admin_password, "new_password": "newpass1"},
        headers={"Authorization": f"Bearer {token}"},
    )
    assert ok.json()["code"] == 0

    old_login = client.post(
        "/api/auth/login",
        json={"username": settings.admin_username, "password": settings.admin_password},
    )
    assert old_login.status_code == 401

    new_login = client.post(
        "/api/auth/login",
        json={"username": settings.admin_username, "password": "newpass1"},
    )
    assert new_login.json()["code"] == 0
```

- [ ] **Step 2: 运行测试确认失败**

Run: `cd backend && pytest tests/test_auth.py -v`  
Expected: FAIL

- [ ] **Step 3: 实现 auth**

`backend/app/schemas.py`：

```python
class ChangePasswordRequest(BaseModel):
    old_password: str
    new_password: str = Field(min_length=6)
```

`backend/app/auth.py`：

```python
from passlib.context import CryptContext
from sqlalchemy.orm import Session
from app.database import SessionLocal
from app.models import AdminAccount

pwd_context = CryptContext(schemes=["bcrypt"], deprecated="auto")


def authenticate_admin(username: str, password: str) -> Optional[AdminAccount]:
    db = SessionLocal()
    try:
        account = db.query(AdminAccount).filter(AdminAccount.username == username).first()
        if not account or not pwd_context.verify(password, account.password_hash):
            return None
        return account
    finally:
        db.close()


def create_access_token(username: str) -> str:
    expire = datetime.now(timezone.utc) + timedelta(minutes=settings.access_token_expire_minutes)
    payload = {"sub": username, "role": "admin", "exp": expire}
    return jwt.encode(payload, settings.secret_key, algorithm=ALGORITHM)


def change_password(db: Session, username: str, old_password: str, new_password: str) -> None:
    account = db.query(AdminAccount).filter(AdminAccount.username == username).first()
    if not account or not pwd_context.verify(old_password, account.password_hash):
        raise ValueError("原密码不正确")
    account.password_hash = pwd_context.hash(new_password)
    account.update_time = datetime.utcnow()
    db.commit()
```

`backend/app/routers/auth.py`：

```python
from app.database import get_db
from app.auth import authenticate_admin, change_password, create_access_token, require_admin
from app.schemas import ChangePasswordRequest
from sqlalchemy.orm import Session

@router.post("/login")
def login(body: LoginRequest):
    account = authenticate_admin(body.username, body.password)
    if not account:
        return fail("用户名或密码错误", status_code=401)
    token = create_access_token(account.username)
    return ok(TokenResponse(access_token=token).model_dump())


@router.post("/change-password")
def change_password_route(
    body: ChangePasswordRequest,
    admin: str = Depends(require_admin),
    db: Session = Depends(get_db),
):
    try:
        change_password(db, admin, body.old_password, body.new_password)
    except ValueError as e:
        return fail(str(e), status_code=400)
    return ok(None)
```

更新 `backend/tests/test_employees.py` 中 `create_access_token()` → `create_access_token(settings.admin_username)` 并在 fixture 中调用 `migrate_admin_account()`。

- [ ] **Step 4: 运行全部后端测试**

Run: `cd backend && pytest -v`  
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add backend/app/auth.py backend/app/routers/auth.py backend/app/schemas.py backend/tests/test_auth.py backend/tests/test_employees.py
git commit -m "feat(backend): db bcrypt auth and change-password endpoint"
```

---

## Task 8: 管理端修改密码 UI

**Files:**
- Create: `web/src/api/auth.ts`
- Modify: `web/src/routes/AdminLayout.tsx`

- [ ] **Step 1: 添加 API**

新建 `web/src/api/auth.ts`：

```typescript
import client from './client'

export async function changePassword(oldPassword: string, newPassword: string): Promise<void> {
  await client.post('/auth/change-password', {
    old_password: oldPassword,
    new_password: newPassword,
  })
}
```

- [ ] **Step 2: AdminLayout 增加 Modal**

在 `AdminLayout.tsx`：

```typescript
import { useState } from 'react'
import { Button, Form, Input, Modal, message } from 'antd'
import { changePassword } from '../api/auth'
import { useAuth } from '../hooks/useAuth'

// 组件内：
const [pwdOpen, setPwdOpen] = useState(false)
const [pwdLoading, setPwdLoading] = useState(false)
const [pwdForm] = Form.useForm()
const { logout } = useAuth()

const handleChangePassword = async () => {
  const values = await pwdForm.validateFields()
  if (values.new_password !== values.confirm_password) {
    message.error('两次输入的新密码不一致')
    return
  }
  setPwdLoading(true)
  try {
    await changePassword(values.old_password, values.new_password)
    message.success('密码已修改，请重新登录')
    setPwdOpen(false)
    pwdForm.resetFields()
    logout()
  } catch (err) {
    message.error(err instanceof Error ? err.message : '修改失败')
  } finally {
    setPwdLoading(false)
  }
}
```

侧边栏底部在退出登录上方加：

```tsx
<Button type="text" block style={{ color: '#fff', marginBottom: 8 }} onClick={() => setPwdOpen(true)}>
  修改密码
</Button>
<Modal
  title="修改密码"
  open={pwdOpen}
  onCancel={() => setPwdOpen(false)}
  onOk={handleChangePassword}
  confirmLoading={pwdLoading}
  destroyOnClose
>
  <Form form={pwdForm} layout="vertical">
    <Form.Item name="old_password" label="旧密码" rules={[{ required: true }]}>
      <Input.Password />
    </Form.Item>
    <Form.Item name="new_password" label="新密码" rules={[{ required: true, min: 6 }]}>
      <Input.Password />
    </Form.Item>
    <Form.Item name="confirm_password" label="确认新密码" rules={[{ required: true }]}>
      <Input.Password />
    </Form.Item>
  </Form>
</Modal>
```

- [ ] **Step 3: 构建验证**

Run: `cd web && npm run build`  
Expected: PASS

- [ ] **Step 4: Commit**

```bash
git add web/src/api/auth.ts web/src/routes/AdminLayout.tsx
git commit -m "feat(web): admin change-password modal with forced re-login"
```

---

## Task 9: 端到端验证

**Files:** 无新增

- [ ] **Step 1: 后端全量测试**

Run: `cd backend && pytest -v`  
Expected: 全部 PASS

- [ ] **Step 2: 前端构建**

Run: `cd web && npm run build`  
Expected: PASS

- [ ] **Step 3: 手动冒烟（有运行环境时）**

1. 评委页：改分 → 1.5s 后自动保存 → 刷新恢复
2. 生成结果：2–4 分弹窗在生成时出现；实时计分显示晋升结果
3. 待提交改分：晋升结果清空、提交 disabled、警告文案出现
4. 重新生成后可提交；提交仅确认弹窗
5. 管理端：改密 → 旧密码失效 → 跳转登录

---

## Spec Coverage Checklist

| Spec § | Task |
|--------|------|
| §1.2 状态重命名 + 迁移 | Task 1 |
| §2.1–2.3 生成判定 / 提交确认 | Task 3 |
| §2.4 实时计分晋升结果 | Task 3 |
| §2.6 移除暂存按钮 | Task 4 |
| §3 自动暂存 | Task 4 |
| §3.5 upsert 分支 | Task 2 |
| §1.2 汇总筛选 | Task 5 |
| §4 AdminAccount + 改密 | Task 6, 7, 8 |
| §6 测试要点 | Task 1–8, 9 |
