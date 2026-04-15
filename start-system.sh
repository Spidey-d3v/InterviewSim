#!/usr/bin/env bash
# =============================================================================
# start-system.sh — macOS/Linux equivalent of start-system.ps1
# Launches all Lattice services in separate Terminal tabs/windows.
#
# Usage:
#   chmod +x start-system.sh
#   ./start-system.sh              # uses default conda env 'pupil310'
#   ./start-system.sh myenv        # uses a custom conda env name
# =============================================================================

set -euo pipefail

CONDA_ENV="${1:-pupil310}"
PROJECT_DIR="$(cd "$(dirname "$0")" && pwd)"

# ─── Colors ──────────────────────────────────────────────────────────────────
GREEN='\033[0;32m'
CYAN='\033[0;36m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# ─── Helpers ─────────────────────────────────────────────────────────────────

check_port() {
    # Returns 0 (true) if port is in use
    lsof -iTCP:"$1" -sTCP:LISTEN -t >/dev/null 2>&1
}

open_terminal_tab() {
    # $1 = tab title
    # $2 = working directory
    # $3 = command to run
    local title="$1"
    local workdir="$2"
    local cmd="$3"

    if [[ "$OSTYPE" == "darwin"* ]]; then
        # macOS: open a new Terminal.app tab
        osascript <<EOF
tell application "Terminal"
    activate
    do script "cd '${workdir}' && echo -e '\\n[${title}] starting...\\n' && ${cmd}"
end tell
EOF
    else
        # Linux: try common terminal emulators
        if command -v gnome-terminal &>/dev/null; then
            gnome-terminal --tab --title="$title" -- bash -c "cd '$workdir' && echo -e '\n[$title] starting...\n' && $cmd; exec bash"
        elif command -v xterm &>/dev/null; then
            xterm -T "$title" -e "cd '$workdir' && echo -e '\n[$title] starting...\n' && $cmd; exec bash" &
        else
            echo -e "${YELLOW}No supported terminal emulator found. Run manually:${NC}"
            echo "  cd $workdir && $cmd"
        fi
    fi
}

# ─── 1. Docker Infrastructure ───────────────────────────────────────────────

echo -e "${CYAN}[1/4] Starting Docker infrastructure (LiveKit + Redis)...${NC}"
cd "$PROJECT_DIR"
docker compose up -d
docker compose ps

# ─── 2. Vision Server (port 8000) ───────────────────────────────────────────

echo -e "${CYAN}[2/4] Starting Vision Server (port 8000)...${NC}"
if check_port 8000; then
    echo -e "${YELLOW}Vision Server already running on port 8000. Skipping launch.${NC}"
else
    open_terminal_tab \
        "Vision Server" \
        "$PROJECT_DIR/Vision" \
        "conda run --no-capture-output -n $CONDA_ENV uvicorn vision_server:app --host 0.0.0.0 --port 8000"
fi

sleep 2

# ─── 3. convFlow Backend (port 8001) ────────────────────────────────────────

echo -e "${CYAN}[3/4] Starting convFlow Backend (port 8001)...${NC}"
if check_port 8001; then
    echo -e "${YELLOW}convFlow already running on port 8001. Skipping launch.${NC}"
else
    open_terminal_tab \
        "convFlow Backend" \
        "$PROJECT_DIR/convFlow" \
        "conda run --no-capture-output -n $CONDA_ENV uvicorn main:app --host 0.0.0.0 --port 8001"
fi

sleep 2

# ─── 4. Frontend Dev Server (port 3000) ─────────────────────────────────────

echo -e "${CYAN}[4/4] Starting Frontend Dev Server...${NC}"
if check_port 3000; then
    echo -e "${YELLOW}Frontend appears to be running on port 3000. Skipping launch.${NC}"
else
    open_terminal_tab \
        "Frontend" \
        "$PROJECT_DIR/frontend" \
        "npm run dev"
fi

# ─── Done ────────────────────────────────────────────────────────────────────

echo ""
echo -e "${GREEN}All services were launched in separate Terminal windows.${NC}"
echo -e "${GREEN}Open: http://localhost:3000/front/interview${NC}"
echo ""
