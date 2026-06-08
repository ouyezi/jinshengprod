#!/bin/bash
# ============================================================
# 研发晋升评审系统 - 一键启动脚本
# 同时启动后端 (FastAPI) 和前端 (Vite/React)
# ============================================================

set -e

PROJECT_DIR="$(cd "$(dirname "$0")" && pwd)"
BACKEND_DIR="$PROJECT_DIR/backend"
FRONTEND_DIR="$PROJECT_DIR/web"
LOG_DIR="$PROJECT_DIR/logs"
PID_DIR="$PROJECT_DIR/.pids"

# 颜色定义
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# 创建必要的目录
mkdir -p "$LOG_DIR" "$PID_DIR"

log_info() {
    echo -e "${BLUE}[INFO]${NC} $1"
}

log_success() {
    echo -e "${GREEN}[OK]${NC} $1"
}

log_warn() {
    echo -e "${YELLOW}[WARN]${NC} $1"
}

log_error() {
    echo -e "${RED}[ERROR]${NC} $1"
}

# 检查端口是否被占用
check_port() {
    local port=$1
    if lsof -i :"$port" > /dev/null 2>&1; then
        return 0
    fi
    return 1
}

# 停止占用端口的进程
kill_port_process() {
    local port=$1
    local pid
    pid=$(lsof -t -i :"$port" 2>/dev/null)
    if [ -n "$pid" ]; then
        log_warn "端口 $port 已被占用 (PID: $pid)，正在停止..."
        kill "$pid" 2>/dev/null || true
        sleep 1
        # 强制终止
        if lsof -i :"$port" > /dev/null 2>&1; then
            kill -9 "$pid" 2>/dev/null || true
            sleep 0.5
        fi
    fi
}

# ===== 启动后端 =====
start_backend() {
    log_info "准备启动后端服务..."

    cd "$BACKEND_DIR"

    # 检查 Python3
    if ! command -v python3 &> /dev/null; then
        log_error "未找到 python3，请先安装 Python 3"
        exit 1
    fi

    # 创建虚拟环境
    if [ ! -d ".venv" ]; then
        log_info "创建 Python 虚拟环境..."
        python3 -m venv .venv
        log_success "虚拟环境创建完成"
    fi

    # 激活虚拟环境
    source .venv/bin/activate

    # 安装依赖
    if [ ! -f ".deps_installed" ] || [ "requirements.txt" -nt ".deps_installed" ]; then
        log_info "安装后端 Python 依赖..."
        pip install -q -r requirements.txt
        touch .deps_installed
        log_success "后端依赖安装完成"
    else
        log_info "后端依赖已是最新"
    fi

    # 检查端口
    if check_port 8000; then
        kill_port_process 8000
    fi

    # 启动后端
    log_info "启动 FastAPI 后端服务 (端口: 8000)..."
    nohup uvicorn app.main:app --host 0.0.0.0 --port 8000 --reload > "$LOG_DIR/backend.log" 2>&1 &
    BACKEND_PID=$!
    echo $BACKEND_PID > "$PID_DIR/backend.pid"

    # 等待后端启动
    for i in {1..30}; do
        if curl -s http://localhost:8000/health > /dev/null 2>&1 || curl -s http://localhost:8000/docs > /dev/null 2>&1; then
            break
        fi
        sleep 0.5
    done

    if check_port 8000; then
        log_success "后端服务已启动 ✓"
        log_info "  → API 地址: http://localhost:8000"
        log_info "  → API 文档: http://localhost:8000/docs"
    else
        log_error "后端服务启动失败，请查看日志: $LOG_DIR/backend.log"
        exit 1
    fi
}

# ===== 启动前端 =====
start_frontend() {
    log_info "准备启动前端服务..."

    cd "$FRONTEND_DIR"

    # 检查 Node.js
    if ! command -v npm &> /dev/null; then
        log_error "未找到 npm，请先安装 Node.js"
        exit 1
    fi

    # 安装依赖
    if [ ! -d "node_modules" ] || [ "package.json" -nt "node_modules/.package-lock.json" ]; then
        log_info "安装前端 npm 依赖..."
        npm install --silent
        log_success "前端依赖安装完成"
    else
        log_info "前端依赖已是最新"
    fi

    # 检查端口
    if check_port 5173; then
        kill_port_process 5173
    fi

    # 启动前端
    log_info "启动 Vite 前端开发服务器 (端口: 5173)..."
    nohup npm run dev -- --host > "$LOG_DIR/frontend.log" 2>&1 &
    FRONTEND_PID=$!
    echo $FRONTEND_PID > "$PID_DIR/frontend.pid"

    # 等待前端启动
    for i in {1..30}; do
        if curl -s http://localhost:5173 > /dev/null 2>&1; then
            break
        fi
        sleep 0.5
    done

    if check_port 5173; then
        log_success "前端服务已启动 ✓"
        log_info "  → 本机访问: http://localhost:5173"
        # 显示局域网地址
        LOCAL_IP=$(ifconfig | grep "inet " | grep -v 127.0.0.1 | awk '{print $2}' | head -1)
        if [ -n "$LOCAL_IP" ]; then
            log_info "  → 局域网访问: http://$LOCAL_IP:5173"
        fi
    else
        log_error "前端服务启动失败，请查看日志: $LOG_DIR/frontend.log"
        exit 1
    fi
}

# ===== 主流程 =====
echo "============================================================"
echo "     研发晋升评审系统 - 启动脚本"
echo "============================================================"
echo ""

# 检查是否有服务已在运行
BACKEND_RUNNING=false
FRONTEND_RUNNING=false

if check_port 8000; then
    BACKEND_RUNNING=true
fi
if check_port 5173; then
    FRONTEND_RUNNING=true
fi

if [ "$BACKEND_RUNNING" = true ] || [ "$FRONTEND_RUNNING" = true ]; then
    log_warn "检测到已有服务在运行"
    [ "$BACKEND_RUNNING" = true ] && log_warn "  → 后端 (端口 8000)"
    [ "$FRONTEND_RUNNING" = true ] && log_warn "  → 前端 (端口 5173)"
    echo ""
    read -p "是否重启所有服务? [Y/n] " -n 1 -r
    echo ""
    if [[ $REPLY =~ ^[Nn]$ ]]; then
        log_info "取消启动"
        exit 0
    fi
    [ "$BACKEND_RUNNING" = true ] && kill_port_process 8000
    [ "$FRONTEND_RUNNING" = true ] && kill_port_process 5173
    sleep 1
fi

# 启动服务
start_backend
echo ""
start_frontend

LOCAL_IP=$(ifconfig | grep "inet " | grep -v 127.0.0.1 | awk '{print $2}' | head -1)
echo ""
echo "============================================================"
echo -e "${GREEN}所有服务已启动成功!${NC}"
echo "============================================================"
echo ""
echo "  前端界面:"
echo "    本机访问:   http://localhost:5173"
[ -n "$LOCAL_IP" ] && echo "    局域网访问: http://$LOCAL_IP:5173"
echo ""
echo "  后端 API:"
echo "    本机访问:   http://localhost:8000"
[ -n "$LOCAL_IP" ] && echo "    局域网访问: http://$LOCAL_IP:8000"
echo "  API 文档: http://localhost:8000/docs"
echo ""
echo "  管理端登录: /admin/login"
echo "  评委端:     /review"
echo ""
echo "  默认管理员账号: admin / dongfu123"
echo ""
echo "  日志文件:"
echo "    后端: $LOG_DIR/backend.log"
echo "    前端: $LOG_DIR/frontend.log"
echo ""
echo "  使用 ./stop.sh 停止所有服务"
echo "============================================================"
