#!/usr/bin/env bash
# Eidolon Graph Editor 一键启动 / 停止脚本
#
# 启动(后端 FastAPI :8000 + 前端 Vite :5173):
#   bash scripts/start.sh
#   前台运行,就绪后提示访问 http://localhost:5173;Ctrl+C 同时关闭前后端。
#
# 停止(终端直接关闭后残留的孤儿进程也可用此命令清理):
#   bash scripts/start.sh stop
#   只结束监听 8000 / 5173 的 node / python / uv 服务进程,不误伤其他进程。
#
# 日志:workspace/logs/(workspace 已 gitignore)
# 首次运行会自动执行 npm install(前端依赖)。
#
# 依赖:uv + npm。后端依赖(fastapi / eidolon-graph 等)由 uv 首次运行
#      自动安装(git 源 pin rev,见 README);脚本强制使用仓内 .venv,
#      已激活的外部环境(如 conda)不影响启动;本脚本在 monorepo 检出与
#      独立 clone 两种形态下均可直接使用。
set -euo pipefail

# Windows 下 PowerShell 直接敲 bash 会进入 WSL bash(路径/端口/进程检测全错),显式拒绝
if [ -r /proc/version ] && grep -qi microsoft /proc/version; then
    echo "[graph-editor] 检测到 WSL bash——请使用 Git Bash 运行(右键目录 Git Bash Here,或 VSCode 终端选择 Git Bash 配置)"
    exit 1
fi

# 仓库根:优先 git 推导(monorepo 检出与独立 clone 均正确),非 git 环境回退脚本目录
REPO="$(git rev-parse --show-toplevel 2>/dev/null)"
[ -n "$REPO" ] || REPO="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"

BACKEND_DIR="$REPO/backend"
FRONTEND_DIR="$REPO/frontend"
LOG_DIR="$REPO/workspace/logs"
BACKEND_PORT=8000
FRONTEND_PORT=5173
BACKEND_URL="http://127.0.0.1:$BACKEND_PORT"
FRONTEND_URL="http://localhost:$FRONTEND_PORT"

is_windows() { case "$(uname -s)" in MINGW*|MSYS*|CYGWIN*) return 0;; *) return 1;; esac; }

# 监听指定端口的进程 PID(Windows 走 PowerShell,不依赖 netstat 本地化输出)
port_pids() {
    local port=$1
    if is_windows; then
        powershell -NoProfile -Command \
            "(Get-NetTCPConnection -LocalPort $port -State Listen).OwningProcess" \
            2>/dev/null | tr -d '\r'
    else
        command -v lsof >/dev/null 2>&1 && lsof -ti :"$port" 2>/dev/null || true
    fi
}

# 结束单个监听进程(带镜像名校验,避免误杀复用 PID 的无关进程)
kill_pid() {
    local pid=$1 img
    [ -n "$pid" ] || return 0
    if is_windows; then
        img=$(powershell -NoProfile -Command \
            "(Get-Process -Id $pid -ErrorAction SilentlyContinue).ProcessName" \
            2>/dev/null | tr -d '\r' | tr 'A-Z' 'a-z')
        case "$img" in
            node|python|uv|pythonw)
                taskkill //PID "$pid" //F >/dev/null 2>&1 || true ;;
            *)
                echo "  [skip] PID $pid(${img:-不存在})不是 node/python 服务进程,跳过" ;;
        esac
    else
        kill "$pid" 2>/dev/null || true
    fi
}

# 结束监听编辑器端口的服务进程(start 前台退出与 stop 子命令共用同一逻辑)
stop_services() {
    local port pid
    for port in "$BACKEND_PORT" "$FRONTEND_PORT"; do
        for pid in $(port_pids "$port"); do
            kill_pid "$pid"
        done
    done
}

# stop 子命令:带反馈输出与结果验证
cmd_stop() {
    local before=0 after=0
    before=$(port_pids "$BACKEND_PORT" "$FRONTEND_PORT" | wc -l)
    echo "[graph-editor] 停止服务 ..."
    stop_services
    sleep 1
    after=$(port_pids "$BACKEND_PORT" "$FRONTEND_PORT" | wc -l)
    if [ "$after" = 0 ]; then
        [ "$before" = 0 ] && echo "[graph-editor] 未发现运行中的编辑器服务" || echo "[graph-editor] 已停止"
    else
        echo "[graph-editor] 仍有进程占用端口,请检查:$LOG_DIR/backend.log $LOG_DIR/frontend.log"
    fi
}

# 前台运行退出(Ctrl+C / 失败)时,结束监听编辑器端口的服务进程
cleanup() {
    stop_services >/dev/null 2>&1
    echo "[graph-editor] 已停止"
}

start() {
    for tool in uv npm curl; do
        command -v "$tool" >/dev/null 2>&1 || {
            echo "[graph-editor] 缺少依赖:$tool(需先安装)"
            exit 1
        }
    done

    # 端口占用检查(可能编辑器已在运行)
    if curl -s -m 1 "$BACKEND_URL/api/health" >/dev/null 2>&1; then
        echo "[graph-editor] 后端已在 $BACKEND_URL 运行——编辑器可能已经启动,直接访问 $FRONTEND_URL 即可"
        echo "[graph-editor] 如需重启,先执行:bash scripts/start.sh stop"
        exit 1
    fi

    mkdir -p "$LOG_DIR"
    : >"$LOG_DIR/backend.log"
    : >"$LOG_DIR/frontend.log"

    # 首次运行自动安装前端依赖
    if [ ! -d "$FRONTEND_DIR/node_modules" ]; then
        echo "[graph-editor] 首次运行:安装前端依赖(npm install,请稍候) ..."
        (cd "$FRONTEND_DIR" && npm install) >"$LOG_DIR/npm-install.log" 2>&1
    fi

    # 后端(FastAPI)
    echo "[graph-editor] 启动后端:$BACKEND_URL(日志:$LOG_DIR/backend.log)"
    # 强制使用仓内 .venv:清除 VIRTUAL_ENV/CONDA_PREFIX,避免 uv 误用激活的外部环境
    (cd "$BACKEND_DIR" && env -u VIRTUAL_ENV -u CONDA_PREFIX -u CONDA_DEFAULT_ENV \
        UV_PROJECT_ENVIRONMENT="$REPO/.venv" \
        uv run uvicorn main:app --host 127.0.0.1 --port "$BACKEND_PORT") \
        >>"$LOG_DIR/backend.log" 2>&1 &
    BACKEND_PID=$!

    local ok=0
    for _ in $(seq 1 60); do
        if curl -sf -m 1 "$BACKEND_URL/api/health" >/dev/null 2>&1; then ok=1; break; fi
        sleep 0.5
    done
    [ "$ok" = 1 ] || {
        echo "[graph-editor] 后端启动失败,日志:$LOG_DIR/backend.log"
        exit 1
    }

    # 前端(Vite)
    echo "[graph-editor] 启动前端:$FRONTEND_URL(日志:$LOG_DIR/frontend.log)"
    (cd "$FRONTEND_DIR" && exec npm run dev) >>"$LOG_DIR/frontend.log" 2>&1 &
    FRONTEND_PID=$!

    ok=0
    for _ in $(seq 1 60); do
        if curl -sf -m 1 -o /dev/null "$FRONTEND_URL" 2>/dev/null; then ok=1; break; fi
        sleep 0.5
    done
    [ "$ok" = 1 ] || {
        echo "[graph-editor] 前端启动失败,日志:$LOG_DIR/frontend.log"
        exit 1
    }

    echo
    echo "[graph-editor] ✓ Eidolon Graph Editor 已启动"
    echo "  前端: http://localhost:$FRONTEND_PORT"
    echo "  后端: http://127.0.0.1:$BACKEND_PORT(/api/health)"
    echo "  日志: $LOG_DIR/backend.log / frontend.log"
    echo "  Ctrl+C 停止前后端"
    echo

    # 前台等待;Ctrl+C 时 wait 被中断,EXIT trap 结束两个服务
    wait "$BACKEND_PID" "$FRONTEND_PID" 2>/dev/null || true
}

trap 'exit 130' INT
trap 'exit 143' TERM
trap cleanup EXIT

case "${1:-start}" in
    start) start ;;
    stop) cmd_stop ;;
    *)
        echo "用法: bash scripts/start.sh [start|stop]"
        exit 1
        ;;
esac
