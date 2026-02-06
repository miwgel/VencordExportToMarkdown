#!/usr/bin/env bash
set -euo pipefail

# Colors
BOLD='\033[1m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
CYAN='\033[0;36m'
DIM='\033[2m'
NC='\033[0m'

info()    { echo -e "  ${CYAN}→${NC} $1"; }
success() { echo -e "  ${GREEN}✓${NC} $1"; }
warn()    { echo -e "  ${YELLOW}!${NC} $1"; }
fail()    { echo -e "  ${RED}✗${NC} $1"; }
step()    { echo -e "\n${BOLD}[$1/$TOTAL_STEPS] $2${NC}"; }

# All reads must use /dev/tty to work with curl | bash
prompt() {
    local message="$1"
    local answer
    read -rp "  $(echo -e "${YELLOW}?${NC}") $message " answer < /dev/tty
    echo "$answer"
}

ask_install() {
    local tool="$1"
    local install_cmd="$2"
    echo ""
    local answer
    answer=$(prompt "$tool is required but not installed. Install it? [Y/n]")
    answer="${answer:-y}"
    if [[ "$answer" =~ ^[Yy]$ ]]; then
        info "Installing $tool..."
        eval "$install_cmd"
        success "$tool installed"
        return 0
    else
        fail "Cannot continue without $tool."
        exit 1
    fi
}

discord_running() {
    pgrep -i discord &>/dev/null
}

TOTAL_STEPS=5
VENCORD_DIR=""
CLEANUP_VENCORD=false

cleanup() {
    if [ "$CLEANUP_VENCORD" = true ] && [ -n "$VENCORD_DIR" ] && [ -d "$VENCORD_DIR" ]; then
        info "Cleaning up build files..."
        rm -rf "$VENCORD_DIR"
        success "Build files removed"
    fi
}
trap cleanup EXIT

# Banner
echo ""
echo -e "${BOLD}ExportToMarkdown${NC} — Vencord Plugin Installer"
echo -e "${DIM}Export Discord chat history to Markdown files${NC}"

# ── Check dependencies ──────────────────────────────────────────

step 1 "Checking dependencies"

# git
if command -v git &>/dev/null; then
    success "git $(git --version | cut -d' ' -f3)"
else
    if [[ "$OSTYPE" == darwin* ]]; then
        ask_install "git (via Xcode Command Line Tools)" "xcode-select --install && echo 'Please re-run this script after Xcode CLT finishes installing.' && exit 0"
    else
        fail "git is required. Install it with your package manager (e.g. apt install git)"
        exit 1
    fi
fi

# node
if command -v node &>/dev/null; then
    success "node $(node --version)"
else
    if [[ "$OSTYPE" == darwin* ]]; then
        if command -v brew &>/dev/null; then
            ask_install "Node.js (via Homebrew)" "brew install node"
        else
            echo ""
            answer=$(prompt "Node.js is required. Install Homebrew first? [Y/n]")
            answer="${answer:-y}"
            if [[ "$answer" =~ ^[Yy]$ ]]; then
                info "Installing Homebrew..."
                /bin/bash -c "$(curl -fsSL https://raw.githubusercontent.com/Homebrew/install/HEAD/install.sh)"
                success "Homebrew installed"
                ask_install "Node.js" "brew install node"
            else
                fail "Cannot continue without Node.js."
                exit 1
            fi
        fi
    else
        fail "Node.js is required. Install it from https://nodejs.org or your package manager"
        exit 1
    fi
fi

# pnpm
if command -v pnpm &>/dev/null; then
    success "pnpm $(pnpm --version)"
else
    ask_install "pnpm" "npm install -g pnpm"
fi

# ── Clone Vencord source ────────────────────────────────────────

step 2 "Setting up Vencord build environment"

VENCORD_DIR=$(mktemp -d "${TMPDIR:-/tmp}/vencord-build.XXXXXX")
CLEANUP_VENCORD=true

info "Cloning Vencord source..."
git clone --depth 1 --quiet https://github.com/Vendicated/Vencord.git "$VENCORD_DIR"
success "Vencord source ready"

# ── Install dependencies ────────────────────────────────────────

step 3 "Installing dependencies"

info "Running pnpm install (this may take a minute)..."
cd "$VENCORD_DIR"
pnpm install --frozen-lockfile --silent 2>/dev/null || pnpm install --silent 2>/dev/null || pnpm install
success "Dependencies installed"

# ── Install plugin ──────────────────────────────────────────────

step 4 "Installing ExportToMarkdown plugin"

PLUGIN_DIR="$VENCORD_DIR/src/userplugins/exportToMarkdown"
git clone --depth 1 --quiet https://github.com/miwgel/VencordExportToMarkdown.git "$PLUGIN_DIR"
success "Plugin installed"

# ── Build & inject ──────────────────────────────────────────────

step 5 "Building and injecting into Discord"

info "Building Vencord..."
pnpm build &>/dev/null
success "Build complete"

# Check if Discord is running and offer to close it
if discord_running; then
    echo ""
    warn "Discord is currently running and must be closed for injection."
    answer=$(prompt "Close Discord now? [Y/n]")
    answer="${answer:-y}"
    if [[ "$answer" =~ ^[Yy]$ ]]; then
        info "Closing Discord..."
        if [[ "$OSTYPE" == darwin* ]]; then
            osascript -e 'quit app "Discord"' 2>/dev/null || killall Discord 2>/dev/null || true
        else
            killall Discord 2>/dev/null || killall discord 2>/dev/null || true
        fi
        # Wait for Discord to fully exit
        for i in {1..15}; do
            discord_running || break
            sleep 1
        done
        if discord_running; then
            fail "Discord is still running. Please close it manually and re-run this script."
            exit 1
        fi
        success "Discord closed"
    else
        warn "Please close Discord manually and re-run this script."
        exit 1
    fi
fi

info "Injecting into Discord..."
if pnpm inject; then
    echo ""
    echo -e "  ${GREEN}${BOLD}All done!${NC}"
    echo ""
    echo -e "  1. Open Discord"
    echo -e "  2. Go to ${BOLD}Settings → Vencord → Plugins${NC}"
    echo -e "  3. Enable ${BOLD}ExportToMarkdown${NC}"
    echo -e "  4. Right-click any channel → ${BOLD}Export to Markdown${NC}"
    echo ""
else
    echo ""
    fail "Injection failed. Make sure Discord is fully closed and try again."
    echo -e "  To retry, run this installer again."
    exit 1
fi
