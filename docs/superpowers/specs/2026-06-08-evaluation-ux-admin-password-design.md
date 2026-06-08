# 评委端体验优化与管理员改密 — 设计规格书

| 属性 | 值 |
|------|-----|
| 版本 | V1.1 |
| 日期 | 2026-06-08 |
| 状态 | 待实施 |
| 关联 | `2026-06-08-evaluation-resubmit-design.md`、`2026-06-08-promotion-review-design.md` |

---

## 1. 概述

优化评委端评审流程（晋升判定前移、自动暂存、状态命名澄清）及管理端密码自助修改能力。

### 1.1 需求摘要

| # | 需求 | 决策 |
|---|------|------|
| 1 | 生成结果时完成晋升判定，实时计分行展示；提交仅确认；2–4 分可重新生成改选 | 2–4 分在生成时弹窗选择（方案 A） |
| 2 | 打分过程自动暂存，去掉「暂存」按钮 | 防抖 + 切换/离开兜底（方案 C）；`待提交` 状态不暂停 |
| 3 | 管理员可修改密码 | 写入数据库 `admin_account` 表（方案 A）；改密后强制重新登录 |

### 1.2 状态重命名（V1.1）

原命名易混淆，本次统一重命名 `evaluation_record.status`：

| 旧值 | 新值 | 含义 |
|------|------|------|
| `待提交` | **`待生成结果`** | 打分/草稿中，尚未生成晋升结果 |
| `待确认` | **`待提交`** | **已生成结果**，等待评委最终提交 |
| `已提交` | `已提交` | 不变，已锁定 |

**数据迁移**（`migrate_evaluation_status_labels()`，startup 执行）：

```sql
UPDATE evaluation_record SET status = '待生成结果' WHERE status = '待提交';
UPDATE evaluation_record SET status = '待提交'      WHERE status = '待确认';
```

注意：必须先更新旧 `待提交` → `待生成结果`，再更新旧 `待确认` → `待提交`，避免两步互相覆盖。

**代码常量**：

```python
DRAFT_STATUS = "待生成结果"      # 原 待提交
READY_SUBMIT_STATUS = "待提交"    # 原 待确认
LOCKED_STATUS = "已提交"
ACTIVE_STATUSES = (DRAFT_STATUS, READY_SUBMIT_STATUS)
```

**前端**：

- `canSubmit = status === '待提交' && reviewerResult != null && !readonly`
- 状态展示文案与 DB 值一致，不再使用旧名

**管理端汇总页**筛选选项同步改为：`待生成结果` / `待提交` / `已提交`。

### 1.3 方案选择（已否决项）

| 领域 | 否决方案 | 原因 |
|------|----------|------|
| 晋升判定 | 提交时弹窗选择 | 与需求「生成时判定」冲突 |
| 自动暂存 | `待提交` 时暂停 | 用户明确要求不暂停 |
| 自动暂存 | 改分后退回 `待生成结果` | 用户选择方案 B：保持 `待提交`，清空结果并禁用提交 |
| 自动暂存 | 仅 localStorage | 换设备/清缓存丢数据 |
| 改密码 | 写 `.env` 文件 | 容器部署不友好，需重启 |

---

## 2. 评委端 — 晋升判定时机

### 2.1 生成结果行为

| 总分区间 | 行为 |
|----------|------|
| ≤ 2 | 直接调用 `generateResult`，`reviewer_result = 不通过晋升`，无弹窗 |
| ≥ 4 | 直接调用 `generateResult`，`reviewer_result = 通过晋升`，无弹窗 |
| 2 < 总分 < 4 | 弹窗「同意晋升 / 不同意晋升」，选择后生成并写入 `reviewer_result` |

弹窗规格：

- `title`: 生成评审结果
- `content`: 总分未达绝对标准，请选择是否同意晋升。
- `okText`: 同意晋升 → `reviewer_result = 通过晋升`
- `cancelText`: 不同意晋升 → `reviewer_result = 不通过晋升`
- `closable: false`, `maskClosable: false`

生成成功后：`status = 待提交`（已生成、可提交）。

### 2.2 再次生成（2–4 分改选）

`status ∈ {待生成结果, 待提交}` 且总分仍在 (2, 4) 时，再次点击「生成结果」：

1. 校验分数与评语完整
2. 再次弹出 §2.1 选择弹窗
3. 覆盖活跃记录的 `reviewer_result` 及计分字段，`status = 待提交`

≤2 / ≥4 再次生成：按新分数自动判定，无弹窗。

### 2.3 提交行为

移除提交环节的晋升选择弹窗。统一为确认弹窗：

| 场景 | 弹窗内容 |
|------|----------|
| 有 `reviewer_result` | `当前判定：{reviewer_result}。提交后不可修改，确定提交吗？` |
| `okText` | 确定提交 |
| `cancelText` | 取消 |

`submitFlow` 不再接受 `reviewerResultOverride`；直接 `submitEvaluation(recordId)`。

**提交前置条件**：`status === '待提交'` 且 `reviewer_result` 非空（改分后结果清空时，提交按钮 disabled）。

### 2.4 实时计分行 UI

在「最终总分」后增加：

```
晋升结果：{reviewer_result | —}
```

| 时机 | 显示 |
|------|------|
| 无 `reviewer_result`（`待生成结果`，或 `待提交` 但改分后结果已清空） | `—` |
| `待提交` 且有 `reviewer_result`，或 `已提交` | 显示结果；通过 `type="success"`，不通过 `type="danger"` |

### 2.5 状态机

```
待生成结果 ←─自动暂存─ 打分中
待生成结果 ─生成结果→ 待提交 ─提交→ 已提交
```

生成结果规则说明文案保留，位置不变。

### 2.6 按钮变更

| 按钮 | 变更 |
|------|------|
| 暂存 | **移除** |
| 生成结果 | 逻辑按 §2.1–2.2 |
| 提交 | `待提交` 且有 `reviewer_result` 时可点；逻辑按 §2.3 |
| 清空重写 | 不变 |

---

## 3. 评委端 — 自动暂存

### 3.1 接口

复用 `POST /api/evaluations/draft`（`upsert_draft`），不新增 API。

### 3.2 触发时机

| 触发 | 行为 |
|------|------|
| **防抖保存** | 修改分数或评语后，停止输入 **1.5 秒** 调用 `saveDraft` |
| **切换员工** | 切换前先保存当前员工草稿，再 `load` 新员工 |
| **评委姓名 blur** | 已选员工时立即保存 |
| **离开页面** | `beforeunload` 时 `fetch` + `keepalive: true` 兜底 |

### 3.3 保存条件

- `reviewer_name` 非空
- 已选中 `employee`
- `status !== 已提交`

允许部分填写：分数可为 `null`，评语可为空。

### 3.4 用户体验

| 项 | 规格 |
|----|------|
| 成功 | 不弹 `message.success` |
| 失败 | `message.error` |
| 状态指示 | 实时计分 Card 标题旁：`保存中…` / `已保存`（3 秒后淡出） |

### 3.5 自动暂存与状态（方案 B）

**`待提交` 状态不暂停**自动暂存。`upsert_draft` 按当前 `status` 与变更类型分支：

#### A. 当前 `status = 待生成结果`

| 变更 | 行为 |
|------|------|
| 任意字段 | 更新字段；**保持 `待生成结果`** |

#### B. 当前 `status = 待提交`（已生成过结果）

| 变更 | 行为 |
|------|------|
| 仅 `advantage` / `disadvantage` | 更新字段；**保持 `待提交`**；保留 `reviewer_result` 及计分汇总 |
| 任意 `score_*` 变动 | 更新分数；**保持 `待提交`**；清空 `avg_values`、`avg_capability`、`avg_output`、`final_score`、`sys_suggestion`、`reviewer_result` |

判定「分数是否变动」：与库中 `score_1..score_12` 逐位比较（含 `null`）。

**改分后的 UX**：

- 状态仍显示 `待提交`，但晋升结果为 `—`
- 「提交」按钮 **disabled**
- 提示（`Text type="warning"`）：`分数已变更，请重新生成结果后再提交`
- 重新「生成结果」后恢复 `reviewer_result`，提交按钮重新启用

### 3.6 实现要点（前端）

- `useRef` 记录上次已保存 payload，避免无变化重复请求
- 防抖 timer 在 unmount / 切换员工前 `flush`
- `readonly` 时不保存
- 本地维护 `reviewerResult` state，与 `canSubmit` 联动

---

## 4. 管理端 — 修改密码

### 4.1 数据模型

新增表 `admin_account`：

| 字段 | 类型 | 约束 |
|------|------|------|
| `id` | INTEGER | PK |
| `username` | VARCHAR(50) | UNIQUE NOT NULL |
| `password_hash` | VARCHAR(255) | NOT NULL |
| `update_time` | DATETIME | NOT NULL |

### 4.2 启动种子

`migrate_admin_account()` 在 startup 调用：

- 表不存在 → 创建
- 表为空 → 从 `settings.admin_username` / `settings.admin_password` 种子一条 bcrypt 记录

之后登录仅以 DB 为准。

### 4.3 认证改造

- `authenticate_admin`：查 DB + bcrypt
- `create_access_token`：`sub` = DB `username`
- 依赖：`passlib[bcrypt]`（写入 `requirements.txt`）

### 4.4 API

```
POST /api/auth/change-password
Authorization: Bearer <token>
Body: { "old_password": string, "new_password": string }
```

| 校验 | 规则 |
|------|------|
| `old_password` | 必须正确 |
| `new_password` | 长度 ≥ 6 |

成功：更新哈希；失败：400（原密码不正确）/ 422（新密码过短）。

### 4.5 前端 UI

- 入口：`AdminLayout` 侧边栏，「退出登录」上方「修改密码」
- Modal：旧密码 / 新密码 / 确认新密码
- 成功：提示 → 清 token → 跳转 `/admin/login`

---

## 5. 文件变更预估

| 文件 | 变更 |
|------|------|
| `backend/app/models.py` | `AdminAccount`；默认 status `待生成结果` |
| `backend/app/migrate.py` | `migrate_evaluation_status_labels()`、`migrate_admin_account()` |
| `backend/app/main.py` | startup 调用迁移 |
| `backend/app/services/evaluation.py` | 状态常量重命名、`upsert_draft` 分支、`submit` 校验 |
| `backend/app/auth.py` / `routers/auth.py` | bcrypt + change-password |
| `backend/tests/test_evaluations.py` | 新状态名 + 自动暂存分支 |
| `backend/tests/test_auth.py` | 登录、改密 |
| `web/src/pages/review/Evaluation.tsx` | 判定前移、自动暂存、状态/提交逻辑 |
| `web/src/pages/admin/Summary.tsx` | 筛选选项新状态名 |
| `web/src/routes/AdminLayout.tsx` | 修改密码入口 |
| `web/src/api/auth.ts` | `changePassword` |

---

## 6. 测试要点

### 6.1 状态迁移

1. 库中旧 `待提交` 记录 → `待生成结果`
2. 库中旧 `待确认` 记录 → `待提交`
3. `已提交` 不变

### 6.2 晋升判定

1. 总分 ≤2 / ≥4 → 生成无弹窗，晋升结果正确
2. 2–4 分 → 生成弹窗，可改选
3. 提交仅确认，不出现晋升二选一
4. `待提交` 无 `reviewer_result` 时提交按钮 disabled

### 6.3 自动暂存

1. `待生成结果` 改分/评语 → 保持 `待生成结果`
2. `待提交` 只改评语 → 保持 `待提交` + `reviewer_result`
3. `待提交` 改分 → 保持 `待提交`，结果清空，提交 disabled，提示重新生成
4. 重新生成后 → 可提交
5. 无「暂存」按钮

### 6.4 改密码

1. env 种子可登录；改密后旧密码失效；强制重新登录

---

## 7. 不在本次范围

- 多管理员账号
- 评委端离线暂存
- 管理端密码强度策略 UI
