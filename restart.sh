#!/bin/bash
# ============================================================
# 研发晋升评审系统 - 生产环境手动重启脚本
# 功能：停止服务 → 拉取最新代码 → 安装依赖 → 构建前端 → 启动服务
# ============================================================

set -e

PROJECT_DIR="/Users/dongfuxlab/workspace/jinshengprod"
BACKEND_DIR="$PROJECT_DIR/backend"
FRONTEND_DIR="$PROJECT_DIR/web"
LOG_DIR="$PROJECT_DIR/logs"
NGINX_CONF="/opt/homebrew/etc/nginx/servers/jinsheng.conf"

# 颜色定义
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'

log_info() { echo -e "${BLUE}[INFO]${NC} $1"; }
log_ok() { echo -e "${GREEN}[OK]${NC} $1"; }
log_warn() { echo -e "${YELLOW}[WARN]${NC} $1"; }
log_error() { echo -e "${RED}[ERROR]${NC} $1"; }

cd "$PROJECT_DIR"

echo "============================================================"
echo "     研发晋升评审系统 - 生产环境手动重启"
echo "============================================================"
echo ""

# ===== 1. 停止服务 =====
log_info "停止现有服务..."
pm2 stop all 2>/dev/null || log_warn "pm2 服务未运行"
pkill nginx 2>/dev/null || log_warn "nginx 未运行"
sleep 1
log_ok "服务已停止"

# ===== 2. 拉取最新代码 =====
log_info "拉取最新代码..."
git pull
log_ok "代码已更新"

# ===== 3. 安装后端依赖 =====
log_info "检查后端 Python 依赖..."
source "$BACKEND_DIR/.venv/bin/activate"
cd "$BACKEND_DIR"
if [ ! -f ".deps_installed" ] || [ "requirements.txt" -nt ".deps_installed" ]; then
    pip install -q -r requirements.txt
    touch .deps_installed
    log_ok "后端依赖已更新"
else
    log_info "后端依赖已是最新"
fi

# ===== 4. 安装前端依赖 =====
log_info "检查前端 npm 依赖..."
cd "$FRONTEND_DIR"
if [ ! -d "node_modules" ] || [ "package.json" -nt "node_modules/.package-lock.json" ]; then
    npm install --silent
    log_ok "前端依赖已更新"
else
    log_info "前端依赖已是最新"
fi

# ===== 5. 构建前端 =====
log_info "构建前端静态文件..."
npm run build
log_ok "前端构建完成"

# ===== 6. 启动后端 =====
log_info "启动后端服务..."
cd "$PROJECT_DIR"
pm2 start ecosystem.config.js
sleep 4

if ! lsof -i :8000 > /dev/null 2>&1; then
    log_error "后端启动失败，请检查日志: $LOG_DIR/pm2-backend-error.log"
    exit 1
fi
log_ok "后端启动成功（端口 8000）"

# ===== 7. 启动 Nginx =====
log_info "启动 Nginx..."
/opt/homebrew/bin/nginx
sleep 2

if ! lsof -i :5173 > /dev/null 2>&1; then
    log_error "Nginx 启动失败，请检查日志: /opt/homebrew/var/log/nginx/error.log"
    exit 1
fi
log_ok "Nginx 启动成功（端口 5173）"

# ===== 8. 验证 =====
echo ""
echo "============================================================"
echo -e "${GREEN}重启完成！${NC}"
echo "============================================================"
echo ""
pm2 status
echo ""
echo "访问地址:"
LOCAL_IP=$(ifconfig | grep "inet " | grep -v 127.0.0.1 | awk '{print $2}' | head -1)
echo "  前端: http://$LOCAL_IP:5173/"
echo "  API:  http://$LOCAL_IP:8000/docs"
echo ""
echo "日志文件:"
echo "  后端: $LOG_DIR/pm2-backend-out.log"
echo "  提交: $BACKEND_DIR/logs/submissions/"
echo "  Nginx: /opt/homebrew/var/log/nginx/error.log"
echo "============================================================"
