#!/bin/bash
# 后端健康检查 + 保活脚本
# 如果后端无响应，通过 pm2 重启

HEALTH_URL="http://127.0.0.1:8000/api/health"
LOG_FILE="/Users/dongfuxlab/workspace/jinshengprod/logs/healthcheck.log"

mkdir -p "$(dirname "$LOG_FILE")"

if ! curl -s -f -m 10 "$HEALTH_URL" > /dev/null 2>&1; then
    echo "$(date '+%Y-%m-%d %H:%M:%S') healthcheck failed, restarting backend..." >> "$LOG_FILE"
    /opt/homebrew/bin/pm2 restart jinsheng-backend >> "$LOG_FILE" 2>&1
else
    echo "$(date '+%Y-%m-%d %H:%M:%S') healthcheck ok" >> "$LOG_FILE"
fi
