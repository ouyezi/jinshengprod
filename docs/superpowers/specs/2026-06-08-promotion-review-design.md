# 研发晋升评审系统 — 设计规格书

| 属性 | 值 |
|------|-----|
| 版本 | V1.0 |
| 日期 | 2026-06-08 |
| 状态 | 待实施 |

---

## 1. 概述

本系统规范研发人员（P5–P10）晋升评审流程，替代纸质/Excel 评审，提供员工管理、能力标准配置、评委独立打分、结果汇总导出。

### 1.1 角色

| 角色 | 认证方式 | 权限 |
|------|----------|------|
| 系统管理员 (Admin) | 账号 `admin` / 密码 `dongfu123` → JWT | 员工管理、标准配置、评审汇总 |
| 评审评委 (Reviewer) | 无登录，手动填写评委姓名 | 晋升评审打分 |

### 1.2 设计决策

| 决策 | 选择 |
|------|------|
| 技术栈 | FastAPI + React + TypeScript + Ant Design 5 + Vite |
| 前端形态 | 单应用双路由：`/admin/*` + `/review/*` |
| 数据库 | SQLite（开发默认），环境变量可切换 MySQL |
| 历史回填 | **不保留** — 仅恢复当前评委自己的草稿 |
| 已有代码 | 复用 `backend/app/` 下 models、auth、scoring、schemas |

---

## 2. 架构

### 2.1 项目结构

```
jinshengprod/
├── backend/
│   └── app/
│       ├── main.py
│       ├── config.py          # ✅ 已有
│       ├── database.py        # ✅ 已有
│       ├── models.py          # ✅ 已有
│       ├── schemas.py         # ✅ 已有
│       ├── auth.py            # ✅ 已有
│       ├── scoring.py         # ✅ 已有
│       ├── routers/
│       │   ├── auth.py
│       │   ├── employees.py
│       │   ├── standards.py
│       │   └── evaluations.py
│       └── services/
│           ├── excel.py
│           └── evaluation.py
└── web/
    └── src/
        ├── routes/
        │   ├── AdminLayout.tsx
        │   └── ReviewerLayout.tsx
        ├── pages/
        │   ├── admin/Login.tsx, Employees.tsx, Standards.tsx, Summary.tsx
        │   └── review/Evaluation.tsx
        ├── components/ScoreMatrix.tsx, ConfirmModal.tsx, ...
        ├── hooks/useAuth.ts
        └── utils/scoring.ts
```

### 2.2 路由与权限

| 路由 | 角色 | 鉴权 |
|------|------|------|
| `/admin/login` | Admin | 公开 |
| `/admin/employees` | Admin | JWT |
| `/admin/standards` | Admin | JWT |
| `/admin/summary` | Admin | JWT |
| `/review` | Reviewer | 无 Token |

**双层防护**：前端路由守卫 + 后端 `require_admin()` 中间件。Reviewer API 拒绝 Admin Token。

---

## 3. 数据模型

### 3.1 user_info

| 字段 | 类型 | 约束 | 说明 |
|------|------|------|------|
| id | BigInt | PK, AUTO_INCREMENT | |
| name | VARCHAR(50) | NOT NULL, INDEX | 同名导入覆盖更新 |
| current_level | VARCHAR(10) | NOT NULL | P5–P10 |
| target_level | VARCHAR(10) | NOT NULL | P5–P10 |
| performance_history | VARCHAR(255) | NULL | 空白导入写 NULL |
| update_time | DateTime | NOT NULL | |

### 3.2 promotion_standard

| 字段 | 类型 | 约束 |
|------|------|------|
| level | VARCHAR(10) | PK (P5–P10) |
| pragmatic_desc … ai_depth_desc | TEXT | NOT NULL，12 维 |

启动时种子初始化 P5–P10 空标准。

### 3.3 evaluation_record

| 字段 | 类型 | 约束 | 说明 |
|------|------|------|------|
| id | BigInt | PK | |
| employee_id | BigInt | NOT NULL, INDEX | FK → user_info.id |
| reviewer_name | VARCHAR(50) | NOT NULL, INDEX | |
| status | VARCHAR(20) | NOT NULL | 待提交 / 待确认 / 已提交 |
| score_1 … score_12 | INT | NULL | 1–5 |
| avg_values | DECIMAL(4,2) | NULL | 价值观均分 |
| avg_capability | DECIMAL(4,2) | NULL | 能力模型均分 |
| avg_output | DECIMAL(4,2) | NULL | 工作成果均分 |
| final_score | DECIMAL(4,2) | NULL | 最终总分 |
| sys_suggestion | VARCHAR(50) | NULL | 通过 / 不通过 / 评委自选 |
| reviewer_result | VARCHAR(50) | NULL | 通过晋升 / 不通过晋升 |
| advantage | TEXT | NULL | 突出优势 |
| disadvantage | TEXT | NULL | 待发展项 |
| create_time | DateTime | NOT NULL | |
| update_time | DateTime | NOT NULL | |

**唯一约束**：`(employee_id, reviewer_name)` — 防并发覆盖。

---

## 4. API 规格

### 4.1 统一响应

```json
{ "code": 0, "data": {}, "message": "ok" }
{ "code": 40001, "data": null, "message": "错误描述" }
```

### 4.2 认证

| 方法 | 路径 | 权限 | 说明 |
|------|------|------|------|
| POST | /api/auth/login | 公开 | → JWT |
| GET | /api/auth/me | Admin | 验证 Token |

### 4.3 员工

| 方法 | 路径 | 权限 | 说明 |
|------|------|------|------|
| GET | /api/employees | Admin | 模糊搜索 |
| GET | /api/employees/search | 公开 | Autocomplete，仅 id+name |
| POST | /api/employees | Admin | 新增 |
| PUT | /api/employees/{id} | Admin | 修改 |
| DELETE | /api/employees/{id} | Admin | 删除 |
| DELETE | /api/employees/all | Admin | 清空 |
| GET | /api/employees/template | Admin | Excel 模板 |
| POST | /api/employees/import | Admin | Excel 导入 |

### 4.4 晋升标准

| 方法 | 路径 | 权限 |
|------|------|------|
| GET | /api/standards/{level} | 公开 |
| PUT | /api/standards/{level} | Admin |

### 4.5 评审

| 方法 | 路径 | 权限 | 说明 |
|------|------|------|------|
| GET | /api/evaluations/load | 公开 | 查当前评委草稿 |
| POST | /api/evaluations/draft | 公开 | 暂存 → 待提交 |
| POST | /api/evaluations/generate | 公开 | 生成结果 → 待确认 |
| POST | /api/evaluations/submit | 公开 | 提交 → 已提交 |
| GET | /api/evaluations/summary | Admin | 汇总查询 |
| GET | /api/evaluations/export | Admin | Excel 导出 |

**load 逻辑**：按 `employee_id + reviewer_name` 查 status ∈ {待提交, 待确认}；无则返回空表单。

---

## 5. 计分公式

```
价值观得分   = round((score_1 + score_2 + score_3) / 3, 2)
能力模型得分 = round((score_4 + … + score_10) / 7, 2)
工作成果得分 = round((score_11 + score_12) / 2, 2)
最终总分     = round(价值观×0.2 + 能力模型×0.4 + 工作成果×0.4, 2)
```

舍入：`Decimal` + `ROUND_HALF_UP`。前后端共用同一公式。

**生成结果三分支**：

| 条件 | 系统建议 | 评委确认结果 |
|------|----------|--------------|
| 总分 ≤ 2 | 不通过 | 不通过晋升 |
| 总分 ≥ 4 | 通过 | 通过晋升 |
| 2 < 总分 < 4 | 评委自选 | 评委选择 |

---

## 6. 页面规格

### 6.1 页面一：员工信息管理（Admin）

- 工具栏：下载模板、导入、清空全部（二次确认，PRD 原文）
- 搜索栏：姓名模糊过滤
- 表格：姓名、当前职级、目标职级、近两年绩效、更新时间、操作（修改/删除）
- Excel：绩效空白 → NULL；同名 → 覆盖更新

### 6.2 页面二：晋升标准管理（Admin）

- Tabs：P5–P10
- 12 维 Textarea + 底部保存
- 未保存切换 Tab → 确认弹窗

### 6.3 页面三：晋升评审（Reviewer）

- 头部：评委姓名（必填）+ 员工 AutoComplete（必填）
- 员工卡片：`当前职级 → 目标职级`；绩效栏仅非 NULL 非空时渲染
- 12 维矩阵：4 列（主要维度 / 子维度 / 标准文本 / 1–5 下拉）
- 实时计分：4 项分数动态展示
- 评语：突出优势 + 待发展项（生成结果时必填）
- 四按钮：清空重写 / 暂存 / 生成结果 / 提交

**状态机**：

```
待提交 ←暂存─ 初始
待提交 ─生成结果→ 待确认 ─提交→ 已提交(只读)
```

- 草稿触发：评委姓名 onBlur + 员工 onChange
- 已提交后再 load → 只读展示

### 6.4 页面四：评审汇总（Admin）

- 查询：员工姓名 + 评委姓名（模糊）
- 表格 26 列（PRD 顺序），横向滚动
- 导出：列头与表格一致

---

## 7. 错误处理

| HTTP | 场景 | 前端 |
|------|------|------|
| 403 | Admin 未授权 | 跳转登录 |
| 400 | 参数错误 | Toast |
| 409 | 已提交不可改 | Toast |
| 500 | 服务端异常 | Toast |

清空员工不级联删除 evaluation_record；汇总 LEFT JOIN，员工已删时姓名显示「已删除」。

---

## 8. 测试要点

- 计分边界：全 1/全 5/3.996→4.00/2.00/2.01/4.00
- 权限：Admin 接口 403、Reviewer 接口开放
- 状态机：暂存→回填→生成→提交→只读→409
- Excel：NULL 绩效、同名覆盖、26 列导出顺序
- 并发：同员工多评委独立记录

---

## 9. 实施计划

| 步骤 | 范围 | 验收 |
|------|------|------|
| Step 1 | 后端全部 API + 种子 + 计分单测 | Swagger 可调；单测通过 |
| Step 2 | 管理端 P1 + P2 | 员工/标准全流程 |
| Step 3 | 操作端 P3 | 评审状态机完整 |
| Step 4 | 管理端 P4 + 联调 | 汇总导出 + 边界测试 |

---

## 10. 共享组件

| 组件 | 用途 |
|------|------|
| ScoreMatrix | 12 维评审矩阵 |
| ScoreCalculator (util) | 前后端一致计分 |
| AdminRouteGuard | JWT 路由守卫 |
| ConfirmModal | 二次确认 |
| EmployeeForm | 员工编辑 Dialog |
