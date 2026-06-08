# 评委端体验优化与管理员改密 — 设计规格书

| 属性 | 值 |
|------|-----|
| 版本 | V1.0 |
| 日期 | 2026-06-08 |
| 状态 | 待实施 |
| 关联 | `2026-06-08-evaluation-resubmit-design.md`、`2026-06-08-promotion-review-design.md` |

---

## 1. 概述

优化评委端评审流程（晋升判定前移、自动暂存）及管理端密码自助修改能力。

### 1.1 需求摘要

| # | 需求 | 决策 |
|---|------|------|
| 1 | 生成结果时完成晋升判定，实时计分行展示；提交仅确认；2–4 分可重新生成改选 | 2–4 分在生成时弹窗选择（方案 A） |
| 2 | 打分过程自动暂存，去掉「暂存」按钮 | 防抖 + 切换/离开兜底（方案 C）；`待确认` 不暂停 |
| 3 | 管理员可修改密码 | 写入数据库 `admin_account` 表（方案 A）；改密后强制重新登录 |

### 1.2 方案选择（已否决项）

| 领域 | 否决方案 | 原因 |
|------|----------|------|
| 晋升判定 | 提交时弹窗选择 | 与需求「生成时判定」冲突 |
| 自动暂存 | `待确认` 时暂停 | 用户明确要求不暂停 |
| 自动暂存 | 仅 localStorage | 换设备/清缓存丢数据 |
| 改密码 | 写 `.env` 文件 | 容器部署不友好，需重启 |

---

## 2. 评委端 — 晋升判定时机（§1）

### 2.1 生成结果行为

| 总分区间 | 行为 |
|----------|------|
| ≤ 2 | 直接调用 `generateResult`，`reviewer_result = 不通过晋升`，无弹窗 |
| ≥ 4 | 直接调用 `generateResult`，`reviewer_result = 通过晋升`，无弹窗 |
| 2 < 总分 < 4 | 弹窗「同意晋升 / 不同意晋升」，选择后生成并写入 `reviewer_result` |

弹窗规格（与现提交弹窗类似，文案调整）：

- `title`: 生成评审结果
- `content`: 总分未达绝对标准，请选择是否同意晋升。
- `okText`: 同意晋升 → `reviewer_result = 通过晋升`
- `cancelText`: 不同意晋升 → `reviewer_result = 不通过晋升`
- `closable: false`, `maskClosable: false`

### 2.2 再次生成（2–4 分改选）

状态为 `待确认` 或 `待提交` 且当前总分仍在 (2, 4) 时，再次点击「生成结果」：

1. 校验分数与评语完整（与现逻辑一致）
2. 再次弹出 §2.1 选择弹窗
3. 覆盖活跃记录的 `reviewer_result` 及计分字段，状态设为 `待确认`

≤2 / ≥4 再次生成：按新分数重新自动判定，无弹窗。

### 2.3 提交行为

移除提交环节的晋升选择弹窗。统一为确认弹窗：

| 场景 | 弹窗内容 |
|------|----------|
| 任意已生成记录 | `当前判定：{reviewer_result}。提交后不可修改，确定提交吗？` |
| `okText` | 确定提交 |
| `cancelText` | 取消 |

`submitFlow` 不再接受 `reviewerResultOverride` 参数；直接 `submitEvaluation(recordId)`。

### 2.4 实时计分行 UI

在「最终总分」后增加：

```
晋升结果：{reviewer_result | —}
```

| 时机 | 显示 |
|------|------|
| 无 `reviewer_result`（含 `待提交`、改分后退回） | `—` |
| `待确认` 或 `已提交` | 显示 `reviewer_result`；`通过晋升` 用 `type="success"`，`不通过晋升` 用 `type="danger"` |

`reviewer_result` 来源：后端 `record.reviewer_result`（`load` / `generate` / `saveDraft` 响应），前端本地 state 与之一致。

### 2.5 状态机

```
待提交 ←─自动暂存─ 打分中
待提交 ─生成结果→ 待确认 ─提交→ 已提交
```

生成结果规则说明文案保留，位置不变。

### 2.6 按钮变更

| 按钮 | 变更 |
|------|------|
| 暂存 | **移除** |
| 生成结果 | 逻辑按 §2.1–2.2 |
| 提交 | 逻辑按 §2.3 |
| 清空重写 | 不变 |

---

## 3. 评委端 — 自动暂存（§2）

### 3.1 接口

复用 `POST /api/evaluations/draft`（`upsert_draft`），不新增 API。

### 3.2 触发时机

| 触发 | 行为 |
|------|------|
| **防抖保存** | 修改 12 项分数、突出优势、待发展项后，停止输入 **1.5 秒** 调用 `saveDraft` |
| **切换员工** | 切换前先保存当前员工草稿，再 `load` 新员工 |
| **评委姓名 blur** | 已选员工时立即保存 |
| **离开页面** | `beforeunload` 时有未决保存则 `fetch` + `keepalive: true` 兜底（与防抖 pending 合并） |

### 3.3 保存条件

同时满足才保存：

- `reviewer_name` 非空
- 已选中 `employee`
- `status !== 已提交`

允许部分填写：分数可为 `null`，评语可为空。

### 3.4 用户体验

| 项 | 规格 |
|----|------|
| 成功 | 不弹 `message.success` |
| 失败 | `message.error` |
| 状态指示 | 实时计分 Card 标题旁：`保存中…` / `已保存`（3 秒后淡出）/ 默认空白 |

### 3.5 `待确认` 时自动暂存（后端逻辑变更）

**不暂停**自动暂存。`upsert_draft` 按变更类型分支：

| 变更 | 行为 |
|------|------|
| 仅 `advantage` / `disadvantage` | 更新字段；**保持 `status = 待确认`**；保留 `reviewer_result` 及计分汇总字段 |
| 任意 `score_*` 变动 | 更新分数；**`status → 待提交`**；清空 `avg_values`、`avg_capability`、`avg_output`、`final_score`、`sys_suggestion`、`reviewer_result` |

判定「分数是否变动」：与库中当前 `score_1..score_12` 逐位比较（含 `null`）。

前端同步：分数变动导致 draft 响应 `status = 待提交` 且无 `reviewer_result` 时，清空本地晋升结果展示。

### 3.6 实现要点（前端）

- 使用 `useRef` 记录上次已保存 payload 快照，避免无变化重复请求
- 防抖 timer 在 unmount / 切换员工前 `flush`（立即保存）
- `readonly` 时不注册防抖、不触发保存

---

## 4. 管理端 — 修改密码（§3）

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
- 表为空 → 插入一条：`username = settings.admin_username`，`password_hash = bcrypt(settings.admin_password)`

之后登录**仅以 DB 为准**；`settings.admin_*` 仅作首次种子，运行时改 env 不影响已存在记录。

### 4.3 认证改造

| 函数 | 变更 |
|------|------|
| `authenticate_admin` | 查 `admin_account`，`bcrypt.verify(plain, hash)` |
| `create_access_token` | `sub` = DB `username` |

依赖：`passlib[bcrypt]` 或等价 bcrypt 库（写入 `requirements.txt`）。

### 4.4 API

```
POST /api/auth/change-password
Authorization: Bearer <token>
Body: { "old_password": string, "new_password": string }
```

| 校验 | 规则 |
|------|------|
| 认证 | `require_admin` |
| `old_password` | bcrypt 校验当前哈希 |
| `new_password` | 长度 ≥ 6 |
| 成功 | 更新 `password_hash`、`update_time` |

| 错误 | HTTP | 文案 |
|------|------|------|
| 旧密码错误 | 400 | 原密码不正确 |
| 新密码过短 | 422 | 新密码至少 6 位 |

### 4.5 前端 UI

- 入口：`AdminLayout` 侧边栏底部，「退出登录」上方，「修改密码」文字按钮
- 形式：Modal + Form
  - 旧密码（`Input.Password`）
  - 新密码
  - 确认新密码（前端校验与 new 一致）
- 成功流程：
  1. `message.success('密码已修改，请重新登录')`
  2. 清除 `admin_token`（复用 `logout` 逻辑）
  3. `navigate('/admin/login')`

### 4.6 安全说明

- 仅支持修改当前登录管理员的密码（单管理员场景）
- 不暴露 `password_hash`
- 不在本次范围：多管理员、找回密码、密码强度策略（大小写数字）

---

## 5. 文件变更预估

| 文件 | 变更 |
|------|------|
| `backend/app/models.py` | 新增 `AdminAccount` |
| `backend/app/migrate.py` | `migrate_admin_account()` |
| `backend/app/main.py` | startup 调用迁移 |
| `backend/app/auth.py` | DB + bcrypt 认证 |
| `backend/app/routers/auth.py` | `change-password` |
| `backend/app/schemas.py` | `ChangePasswordRequest` |
| `backend/app/services/evaluation.py` | `upsert_draft` 分支逻辑 |
| `backend/requirements.txt` | bcrypt 依赖 |
| `backend/tests/test_auth.py` | 新建：登录、改密 |
| `backend/tests/test_evaluations.py` | 草稿分支、待确认改评语/改分 |
| `web/src/pages/review/Evaluation.tsx` | 判定前移、自动暂存、晋升结果展示、去暂存按钮 |
| `web/src/routes/AdminLayout.tsx` | 修改密码入口 |
| `web/src/pages/admin/ChangePassword.tsx` 或内联 Modal | 改密表单 |
| `web/src/api/auth.ts` | `changePassword` |
| `web/src/hooks/useAuth.ts` | 可选扩展 |

---

## 6. 测试要点

### 6.1 晋升判定

1. 总分 1.8 → 生成无弹窗 → 实时计分显示「不通过晋升」→ 提交仅确认
2. 总分 4.2 → 生成无弹窗 → 显示「通过晋升」
3. 总分 3.0 → 生成弹窗 → 选同意/不同意 → 显示对应结果
4. `待确认` + 总分 3.0 → 再次生成 → 可改选
5. 提交弹窗不出现晋升二选一

### 6.2 自动暂存

1. 改分后 1.5s 内自动保存；刷新可恢复
2. 切换员工前保存旧员工草稿
3. `待确认` 只改评语 → 保持 `待确认` + `reviewer_result`
4. `待确认` 改任意分数 → `待提交`，晋升结果清空
5. `已提交` 不触发保存
6. 无「暂存」按钮

### 6.3 改密码

1. 首次启动从 env 种子可登录
2. 旧密码错误 → 400
3. 改密成功 → 旧密码不能登录，新密码可登录
4. 前端清 token 跳转登录页

---

## 7. 不在本次范围

- 多管理员账号
- 用户名修改
- 评委端离线暂存（Service Worker）
- 管理端密码强度策略 UI
- 修改 `evaluation-resubmit` 已实施的 load / 重提逻辑（本 spec 为增量）
