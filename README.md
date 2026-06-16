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

## 生产环境部署

生产环境使用 **PM2** 守护后端、**Nginx** 托管前端静态文件并反向代理 API。

### 1. 安装依赖

```bash
# 后端 Python 依赖
cd backend
python3 -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt

# 前端 npm 依赖
cd ../web
npm install

# macOS 安装 Nginx（如未安装）
brew install nginx
```

### 2. 构建前端

```bash
cd web
npm run build
```

### 3. 启动后端（PM2）

```bash
pm2 start ecosystem.config.js
```

### 4. 启动 Nginx

```bash
# 配置已放置于 /opt/homebrew/etc/nginx/servers/jinsheng.conf
/opt/homebrew/bin/nginx
```

### 5. 访问

- 前端：http://10.55.10.188:5173/
- 后端 API：http://10.55.10.188:8000/docs

---

## 服务管理

### 查看服务状态

```bash
pm2 status
```

### 重启服务

```bash
# 重启后端
pm2 restart jinsheng-backend

# 重载 Nginx 配置
/opt/homebrew/bin/nginx -s reload

# 重启完整环境（停止 → 构建 → 启动）
pm2 stop all
pkill nginx
cd web && npm run build
cd ..
pm2 start ecosystem.config.js
/opt/homebrew/bin/nginx
```

### 停止服务

```bash
pm2 stop all
pkill nginx
```

---

## 日志查看

### 后端访问日志

```bash
# Uvicorn 访问日志（含所有 API 请求）
tail -f logs/pm2-backend-out.log
```

### 后端错误日志

```bash
tail -f logs/pm2-backend-error.log
tail -f logs/pm2-backend.log
```

### 评审提交业务日志

评委正式提交评审后，后端会在 `backend/logs/submissions/` 下按日追加 JSONL 文件（如 `2026-06-09.jsonl`），记录完整评审快照，作为数据库旁路备份。日志写入失败不会阻断提交。

```bash
ls backend/logs/submissions/
cat backend/logs/submissions/2026-06-09.jsonl
```

### Nginx 错误日志

```bash
tail -f /opt/homebrew/var/log/nginx/error.log
```

---

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
