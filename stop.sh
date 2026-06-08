#!/bin/bash
# ============================================================
# 研发晋升评审系统 - 一键关闭脚本
# 停止后端 (FastAPI) 和前端 (Vite/React) 服务
# ============================================================

PROJECT_DIR="$(cd "$(dirname "$0")" && pwd)"
PID_DIR="$PROJECT_DIR/.pids"
LOG_DIR="$PROJECT_DIR/logs"

# 颜色定义
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

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

# 根据端口查找并停止进程
kill_by_port() {
    local port=$1
    local name=$2
    local pid

    pid=$(lsof -t -i :"$port" 2>/dev/null)
    if [ -n "$pid" ]; then
        log_info "停止 $name (端口: $port, PID: $pid)..."
        kill "$pid" 2>/dev/null
        sleep 1
        # 检查是否仍在运行
        if lsof -i :"$port" > /dev/null 2>&1; then
            kill -9 "$pid" 2>/dev/null
            sleep 0.5
        fi
        if ! lsof -i :"$port" > /dev/null 2>&1; then
            log_success "$name 已停止"
        else
            log_error "$name 停止失败"
        fi
    else
        log_warn "$name (端口: $port) 未在运行"
    fi
}

# 根据 PID 文件停止进程
kill_by_pidfile() {
    local pidfile=$1
    local name=$2

    if [ -f "$pidfile" ]; then
        local pid
        pid=$(cat "$pidfile")
        if [ -n "$pid" ] && kill -0 "$pid" 2>/dev/null; then
            log_info "停止 $name (PID: $pid)..."
            kill "$pid" 2>/dev/null
            sleep 1
            if kill -0 "$pid" 2>/dev/null; then
                kill -9 "$pid" 2>/dev/null
                sleep 0.5
            fi
            if ! kill -0 "$pid" 2>/dev/null; then
                log_success "$name 已停止"
            fi
        fi
        rm -f "$pidfile"
    fi
}

# ===== 主流程 =====
echo "============================================================"
echo "     研发晋升评审系统 - 关闭脚本"
echo "============================================================"
echo ""

# 方法1: 通过 PID 文件停止
if [ -d "$PID_DIR" ]; then
    kill_by_pidfile "$PID_DIR/backend.pid" "后端服务"
    kill_by_pidfile "$PID_DIR/frontend.pid" "前端服务"
fi

# 方法2: 通过端口查找并停止（兜底）
echo ""
kill_by_port 8000 "后端服务"
kill_by_port 5173 "前端服务"

# 清理 PID 目录
if [ -d "$PID_DIR" ]; then
    rm -rf "$PID_DIR"
fi

echo ""
echo "============================================================"
echo -e "${GREEN}所有服务已关闭${NC}"
echo "============================================================"
