# 员工表结构改造 — 设计规格书

| 属性 | 值 |
|------|-----|
| 版本 | V1.0 |
| 日期 | 2026-06-08 |
| 状态 | 已确认，待实施 |
| 关联 | [2026-06-08-promotion-review-design.md](./2026-06-08-promotion-review-design.md) |

---

## 1. 背景与目标

将员工数据结构从简化的 4 字段（姓名、当前职级、目标职级、近两年绩效）对齐到 FY26 提名汇总 Excel 的 14 列格式，并同步更新导入逻辑、管理端列表、评审页展示。

### 1.1 已确认的设计决策

| 决策 | 选择 |
|------|------|
| 目标职级 | 导入时自动 `当前职级 +1`，管理员可事后手动修改 |
| 职级范围 | 员工 `current_level` / `target_level` 支持 P4–P10；晋升标准仍只配置 P5–P10 |
| 导入主键 | 工号（`employee_no`）必填、唯一，同工号覆盖更新 |
| 评审页展示 | 完整版：组织信息 + 职级路径 + 三段绩效 + 提名情况 + 提名理由 + 备注 |
| 管理端列表 | 宽表：14 列 Excel 字段 + 目标职级 + 更新时间 + 操作，横向滚动 |
| 数据模型方案 | 扁平扩展 `user_info` 表（推荐方案，已采纳） |

---

## 2. 数据模型

### 2.1 `user_info` 新结构

| 字段 | 类型 | 约束 | Excel 列 | 说明 |
|------|------|------|----------|------|
| id | BigInt | PK, AUTO_INCREMENT | — | 不变 |
| employee_no | VARCHAR(20) | NOT NULL, UNIQUE | 工号 | 导入主键，如 SH-1945 |
| name | VARCHAR(50) | NOT NULL, INDEX | 姓名 | |
| division_center | VARCHAR(50) | NULL | 分管中心 | |
| department | VARCHAR(50) | NULL | 一级部门 | |
| education | VARCHAR(20) | NULL | 学历 | |
| position | VARCHAR(100) | NULL | 岗位 | |
| current_level | VARCHAR(10) | NOT NULL | 职级 | P4–P10 |
| target_level | VARCHAR(10) | NOT NULL | — | 导入时自动 +1，可手动改 |
| perf_fy24 | VARCHAR(10) | NULL | FY24年度等级 | A/B/S 等 |
| perf_fy25 | VARCHAR(10) | NULL | FY25年度等级 | |
| perf_fy25h1 | VARCHAR(10) | NULL | FY25H1等级 | |
| join_date | Date | NULL | 入职时间 | |
| remark | VARCHAR(255) | NULL | 备注 | |
| nomination_status | VARCHAR(20) | NULL | 提名情况 | 提名晋升 / 特殊提名 |
| nomination_reason | TEXT | NULL | 提名理由 | 长文本，保留换行 |
| update_time | DateTime | NOT NULL | — | 不变 |

**删除字段**：`performance_history`

### 2.2 职级常量

```python
EMPLOYEE_LEVELS = ["P4", "P5", "P6", "P7", "P8", "P9", "P10"]  # 员工 current/target
STANDARD_LEVELS = ["P5", "P6", "P7", "P8", "P9", "P10"]       # promotion_standard 不变
```

### 2.3 目标职级自动推算

```
P4 → P5, P5 → P6, P6 → P7, P7 → P8, P8 → P9, P9 → P10
P10 → 导入报错（无法晋升）
```

手动新增/编辑时：选择 `current_level` 后前端自动填充 `target_level`（P10 时禁用并提示）。

### 2.4 数据库迁移

- 开发环境（SQLite）：检测旧表结构，执行 ALTER 或重建 `user_info`
- 不迁移 `performance_history` 历史数据；管理员清空后按新模板重新导入
- `evaluation_record` 通过 `employee_id` 关联，不因员工字段扩展而变更

---

## 3. API 变更

### 3.1 Schema（`UserInfoCreate` / `UserInfoUpdate` / `UserInfoResponse`）

新增全部字段；删除 `performance_history`。`target_level` 在创建/更新请求中必填（前端根据当前职级自动填充）。

### 3.2 员工接口

| 方法 | 路径 | 变更 |
|------|------|------|
| GET | /api/employees | 返回新字段；保留 `name` 查询参数，同时模糊匹配姓名和工号 |
| GET | /api/employees/search | 返回 `{ id, name, employee_no }` |
| POST | /api/employees | 校验 `employee_no` 唯一、`current_level` ∈ EMPLOYEE_LEVELS |
| PUT | /api/employees/{id} | 同上；工号唯一性排除自身 |
| GET | /api/employees/template | 14 列 Excel 模板（与提名汇总表头一致） |
| POST | /api/employees/import | 新导入逻辑（见 §4） |

其余 CRUD 端点路径不变。

---

## 4. Excel 导入/导出

### 4.1 模板表头（14 列，顺序固定）

```
分管中心 | 一级部门 | 工号 | 姓名 | 学历 | 岗位 | 职级 |
FY24年度等级 | FY25年度等级 | FY25H1等级 | 入职时间 | 备注 | 提名情况 | 提名理由
```

模板不含「目标职级」列（由系统计算）。

### 4.2 导入规则

1. 从第 2 行起逐行解析；空行（工号为空）跳过
2. 按 `employee_no` 匹配：存在则覆盖全部字段，不存在则新增
3. `target_level` = `current_level` 自动 +1，不读取 Excel
4. 空白单元格 → NULL；`nomination_reason` 保留原始换行
5. `join_date` 支持 Excel 日期类型和 `YYYY-MM-DD` 字符串

### 4.3 校验与错误

| 条件 | 处理 |
|------|------|
| 工号为空 | 跳过行 |
| 姓名为空 | 报错，跳过行 |
| 职级为空或不在 P4–P10 | 报错，跳过行 |
| 当前职级为 P10 | 报错「无法自动推算目标职级」，跳过行 |
| 工号重复（同文件多行） | 后行覆盖前行（最后写入生效） |

返回格式不变：`{ success, errors: [{ row, reason }] }`

---

## 5. 前端变更

### 5.1 管理端 — 员工列表（`Employees.tsx`）

宽表横向滚动，列顺序：

1. 分管中心、一级部门、工号、姓名、学历、岗位
2. 职级、目标职级
3. FY24年度等级、FY25年度等级、FY25H1等级
4. 入职时间、备注、提名情况
5. 提名理由（200px，超长 `ellipsis` + Tooltip）
6. 更新时间、操作（修改/删除）

搜索框提示改为「搜索姓名或工号」。

工具栏不变：下载模板、导入、清空全部、新增。

### 5.2 管理端 — 员工表单（`EmployeeForm.tsx`）

全部新字段可编辑；布局分组：

- **基本信息**：工号、姓名、分管中心、一级部门、学历、岗位、入职时间
- **晋升信息**：当前职级、目标职级（选当前职级自动推算）、提名情况
- **绩效**：FY24 / FY25 / FY25H1 三个 Input
- **其他**：备注（Input）、提名理由（TextArea）

职级下拉选项为 P4–P10。

### 5.3 评审页 — 员工信息卡片（`Evaluation.tsx`）

使用 `Descriptions` + 独立区块展示：

| 区块 | 字段 |
|------|------|
| 组织信息 | 分管中心、一级部门、工号、岗位、学历、入职时间 |
| 晋升信息 | 当前职级 → 目标职级、提名情况 |
| 绩效 | FY24 / FY25 / FY25H1（有值才显示） |
| 提名理由 | 独立可折叠长文本区块 |
| 备注 | 有值才显示 |

AutoComplete 选项显示为 `姓名（工号）`。

加载晋升标准仍按 `target_level`（须为 P5–P10；若 target 为 P5 则正常，P4 员工 target 为 P5 亦正常）。

### 5.4 TypeScript 类型（`api/employees.ts`）

`Employee` / `EmployeePayload` 对齐后端新 Schema；删除 `performance_history`；新增全部字段；`LEVELS` 扩展为 P4–P10。

---

## 6. 错误处理

| 场景 | HTTP | 前端 |
|------|------|------|
| 工号重复（手动新增） | 400 | Toast「工号已存在」 |
| 职级无效 | 400 | Toast |
| 导入部分失败 | 200 + errors 数组 | 展示成功/失败条数及错误明细 |
| 员工不存在 | 404 | Toast |
| P10 无法晋升（表单） | 前端拦截 | 禁用目标职级并提示 |

清空员工不级联删除 `evaluation_record`（行为不变）。

---

## 7. 测试要点

- 导入 FY26 提名汇总样例：13 行全部成功；`target_level` 正确（P4→P5 等）
- 同工号二次导入：字段覆盖更新
- P10 员工导入：报错跳过
- 手动新增：工号唯一校验、职级自动推算
- 评审页：完整字段展示；提名理由折叠
- 管理端：14 列宽表横向滚动正常
- 搜索：姓名和工号均可命中
- 晋升标准：P4 员工 target P5 可正常加载 P5 标准

---

## 8. 影响范围（文件清单）

| 层 | 文件 |
|----|------|
| 模型 | `backend/app/models.py` |
| Schema | `backend/app/schemas.py` |
| 导入 | `backend/app/services/excel.py` |
| 路由 | `backend/app/routers/employees.py` |
| 迁移 | `backend/app/database.py` 或独立 migration |
| 测试 | `backend/tests/test_employees.py`（新增/更新） |
| API 类型 | `web/src/api/employees.ts` |
| 列表页 | `web/src/pages/admin/Employees.tsx` |
| 表单 | `web/src/components/EmployeeForm.tsx` |
| 评审页 | `web/src/pages/review/Evaluation.tsx` |

`evaluation_record`、`promotion_standard`、计分逻辑、汇总导出**不在本次范围**。
