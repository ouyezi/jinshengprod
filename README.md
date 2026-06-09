# 研发晋升评审系统

## 项目结构

```
jinshengprod/
├── backend/          # FastAPI 后端（SQLite + JWT 管理端认证）
├── web/              # 统一前端（管理端 + 评委操作端）
└── README.md
```

## 快速启动

### 后端

```bash
cd backend
python -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
uvicorn app.main:app --reload --port 8000
```

### 前端

```bash
cd web
npm install
npm run dev   # http://localhost:5173，/api 代理至后端 8000 端口
```

生产构建：

```bash
cd web
npm run build
```

## 提交日志备份

评委正式提交评审后，后端会在 `backend/logs/submissions/` 下按日追加 JSONL 文件（如 `2026-06-09.jsonl`），记录完整评审快照，作为数据库旁路备份。日志写入失败不会阻断提交；可通过应用错误日志排查。目录已在 `.gitignore` 中忽略。

## 默认账号

- 管理员：`admin` / `dongfu123`

## 页面说明

| 路由 | 说明 |
|------|------|
| `/admin/login` | 管理端登录，JWT 鉴权 |
| `/admin/employees` | 员工管理：增删改查、Excel 模板下载与批量导入 |
| `/admin/standards` | 晋升标准配置：按 P5–P10 职级维护 12 项能力维度描述 |
| `/admin/summary` | 评审汇总：按员工/评委筛选、26 列明细展示、Excel 导出 |
| `/review` | 评委操作端：员工搜索、12 项打分、草稿/生成结果/提交，无需登录 |

## API 文档

启动后端后访问：http://localhost:8000/docs
