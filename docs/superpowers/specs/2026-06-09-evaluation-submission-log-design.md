# 评审正式提交日志备份 — 设计规格书

| 属性 | 值 |
|------|-----|
| 版本 | V1.0 |
| 日期 | 2026-06-09 |
| 状态 | 待实施 |
| 关联 | `2026-06-08-promotion-review-design.md`、`2026-06-08-evaluation-resubmit-design.md` |

---

## 1. 概述

评委端点击「提交」、评审记录状态变为「已提交」时，在后端同步追加一条 JSONL 日志，作为 SQLite 数据库的旁路备份，降低因数据库异常导致的数据丢失风险。

### 1.1 需求边界（已确认）

| 决策项 | 选择 |
|--------|------|
| 触发范围 | 仅**正式提交**（`待提交` → `已提交`） |
| 失败策略 | **数据库优先**：DB 提交成功即返回 200；日志写入失败不阻断提交，仅记录应用错误日志 |
| 文件组织 | 按日追加：`logs/submissions/YYYY-MM-DD.jsonl` |
| 日志内容 | **完整快照**：评审记录全字段 + 员工关联信息 |

### 1.2 方案选择

采用 **方案 A：在 `submit_record()` 提交成功后调用独立日志模块**。

| 方案 | 说明 | 结论 |
|------|------|------|
| A | `submit_record()` commit 成功后调用 `submission_log` 模块 | ✅ 采用 |
| B | Router 层 `/submit` 返回前写日志 | ❌ 与 service 分离，易漏记 |
| C | 前端双写或额外备份 API | ❌ 多一跳、可绕过、不匹配防 DB 丢失目标 |

---

## 2. 数据流

```
评委点击「提交」
  → POST /api/evaluations/submit
  → submit_record(): 校验 → status=已提交 → db.commit() 成功
  → append_submission_log(record, employee)   # 同步、best-effort
  → 返回 200（无论日志是否写入成功）
```

- 日志在 `db.commit()` **之后**写入，避免「文件已有记录但 DB 未落库」。
- **暂存**（`/draft`）、**生成结果**（`/generate`）不触发日志。

---

## 3. 日志文件规格

### 3.1 路径与命名

| 项 | 值 |
|----|-----|
| 默认目录 | `logs/submissions/`（相对 backend 工作目录） |
| 配置项 | `submission_log_dir`，默认 `"logs/submissions"` |
| 文件名 | `YYYY-MM-DD.jsonl`，日期取 **UTC**（与 `datetime.utcnow()` 一致） |
| 格式 | JSON Lines，UTF-8，`ensure_ascii=False` |
| 写入 | 追加模式 `open(path, "a")`，每行一条 JSON + `\n` |

目录在首次写入时 `mkdir(parents=True, exist_ok=True)` 懒创建。`logs/` 已在 `.gitignore` 中，日志文件不入库。

### 3.2 单行 JSON 结构

```json
{
  "logged_at": "2026-06-09T10:30:00",
  "event": "evaluation_submitted",
  "record": {
    "id": 42,
    "employee_id": 1,
    "employee_name": "张三",
    "target_level": "P7",
    "reviewer_name": "李四",
    "status": "已提交",
    "scores": [3, 4, 3, 3, 4, 3, 3, 4, 3, 3, 4, 3],
    "avg_values": 3.25,
    "avg_capability": 3.33,
    "avg_output": 3.5,
    "final_score": 3.3,
    "sys_suggestion": "建议通过",
    "reviewer_result": "通过晋升",
    "advantage": "...",
    "disadvantage": "...",
    "create_time": "2026-06-09T09:00:00",
    "update_time": "2026-06-09T10:30:00"
  },
  "employee": {
    "id": 1,
    "employee_no": "E001",
    "name": "张三",
    "division_center": "研发中心",
    "department": "平台部",
    "current_level": "P6",
    "target_level": "P7"
  }
}
```

| 字段 | 来源 |
|------|------|
| `logged_at` | 写入时刻，`datetime.utcnow().isoformat()` |
| `event` | 固定 `"evaluation_submitted"` |
| `record` | 复用现有 `record_to_dict(rec, employee)` |
| `employee` | 提交时刻 `UserInfo` 快照：id、工号、姓名、事业部、部门、当前/目标职级 |

`employee` 补充 `record_to_dict` 中未包含的工号、部门等字段，使单行日志可独立还原一条提交。

---

## 4. 实现要点

### 4.1 新增模块

`backend/app/services/submission_log.py`：

- `append_submission_log(record: EvaluationRecord, employee: UserInfo | None) -> None`
- 内部：解析目录、拼路径、序列化、追加写入
- 任意异常捕获后 `logging.error(...)`，**不向上抛出**

### 4.2 改动 `submit_record`

`backend/app/services/evaluation.py` 中，`db.commit()` 与 `db.refresh(rec)` 成功后：

1. 查询 `UserInfo`（若调用方未传入 employee，在 `submit_record` 内 `db.get`）
2. 调用 `append_submission_log(rec, emp)`

Router 层 `/submit` **无需**额外逻辑。

### 4.3 配置

`backend/app/config.py` 新增：

```python
submission_log_dir: str = "logs/submissions"
```

可通过环境变量 `SUBMISSION_LOG_DIR` 覆盖（pydantic-settings 默认行为）。

### 4.4 错误处理

| 场景 | 行为 |
|------|------|
| DB commit 失败 | 抛 `ValueError`，不写日志，API 409 |
| 日志目录不存在 | 自动创建后写入 |
| 日志写入失败 | API 仍 200；`logging.error` 记录 record_id、路径、异常信息 |
| 员工记录缺失 | `employee` 字段为 `null`，`record` 仍完整写入 |

评委端无新增提示或 UI 变更。

---

## 5. 测试要点

### 5.1 后端单元测试

1. 正常提交 → 当天 `jsonl` 新增一行，`event`、`record.status`、`employee` 字段正确
2. 同日多次提交 → 同一文件多行
3. 日志目录不存在 → 自动创建并成功写入
4. monkeypatch 使 `open` 抛异常 → API 200，DB 状态为「已提交」，无未捕获异常
5. 非法状态提交（非「待提交」）→ 不写日志

### 5.2 手动验证

1. 评委端完成一次正式提交
2. 检查 `backend/logs/submissions/` 下当天文件内容可读、JSON 合法

---

## 6. 文档与部署

- `README.md` 补充：正式提交会按日落盘至 `logs/submissions/`
- 生产部署时确保 backend 进程对 `submission_log_dir` 有写权限
- 运维通过应用日志排查日志写入失败

---

## 7. 不在本次范围

- 管理端查看/检索提交日志 UI
- 从 JSONL 自动恢复进数据库的工具或脚本
- 暂存、生成结果的日志
- 日志轮转、保留天数、压缩归档策略
- 前端 localStorage 双写
- 日志写入失败时的评委端告警
