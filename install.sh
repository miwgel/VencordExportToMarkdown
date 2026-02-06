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

find_discord() {
    # Common Discord locations by platform
    local candidates=()
    if [[ "$OSTYPE" == darwin* ]]; then
        candidates=(
            "/Applications/Discord.app/Contents/Resources"
            "/Applications/Discord PTB.app/Contents/Resources"
            "/Applications/Discord Canary.app/Contents/Resources"
            "$HOME/Applications/Discord.app/Contents/Resources"
        )
    else
        candidates=(
            "/usr/share/discord/resources"
            "/usr/lib64/discord/resources"
            "/opt/discord/resources"
            "/opt/Discord/resources"
            "/usr/share/discord-ptb/resources"
            "/usr/share/discord-canary/resources"
            "/var/lib/flatpak/app/com.discordapp.Discord/current/active/files/discord/resources"
            "$HOME/.local/share/flatpak/app/com.discordapp.Discord/current/active/files/discord/resources"
            "/snap/discord/current/usr/share/discord/resources"
        )
    fi

    for candidate in "${candidates[@]}"; do
        if [ -f "$candidate/app.asar" ] || [ -f "$candidate/_app.asar" ]; then
            echo "$candidate"
            return 0
        fi
    done
    return 1
}

# Patch Discord by creating a tiny app.asar that loads the Vencord patcher.
# This replaces the GUI installer — no window, no download, pure Node.js.
patch_discord() {
    local resources_dir="$1"
    local dist_dir="$2"

    # Back up original app.asar if not already backed up
    if [ -f "$resources_dir/app.asar" ] && [ ! -f "$resources_dir/_app.asar" ]; then
        mv "$resources_dir/app.asar" "$resources_dir/_app.asar"
    elif [ -f "$resources_dir/app.asar" ] && [ -f "$resources_dir/_app.asar" ]; then
        rm -f "$resources_dir/app.asar"
    fi

    # Create patched app.asar using Node.js (generates proper asar binary format)
    node -e "
const fs = require('fs');
const distPath = process.argv[1];
const asarPath = process.argv[2];

const indexJs = 'require(\"' + distPath + '/patcher.js\")';
const pkg = '{\"name\":\"discord\",\"main\":\"index.js\"}';

const header = JSON.stringify({
  files: {
    'index.js': { size: indexJs.length, offset: '0' },
    'package.json': { size: pkg.length, offset: String(indexJs.length) }
  }
});

const headerLen = Buffer.byteLength(header);
const paddedHeaderLen = Math.ceil(headerLen / 4) * 4;
const headerPayloadLen = 4 + paddedHeaderLen;
const headerBufLen = 4 + headerPayloadLen;

const buf = Buffer.alloc(8 + headerBufLen + indexJs.length + pkg.length);
let off = 0;
buf.writeUInt32LE(4, off); off += 4;
buf.writeUInt32LE(headerBufLen, off); off += 4;
buf.writeUInt32LE(headerPayloadLen, off); off += 4;
buf.writeUInt32LE(headerLen, off); off += 4;
buf.write(header, off); off += paddedHeaderLen;
buf.write(indexJs, off); off += indexJs.length;
buf.write(pkg, off);
fs.writeFileSync(asarPath, buf);
" "$dist_dir" "$resources_dir/app.asar"
}

# Vencord's dev install needs dist/ to persist at a fixed path.
# We build here, then clean up everything except dist/ (~1MB kept).
VENCORD_DIR="$HOME/.vencord-export"
TOTAL_STEPS=5

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

# Discord
DISCORD_RESOURCES=""
if DISCORD_RESOURCES=$(find_discord); then
    success "Discord found at $DISCORD_RESOURCES"
else
    fail "Could not find Discord installation."
    echo -e "  If Discord is installed in a non-standard location, please open an issue."
    exit 1
fi

# ── Clone Vencord source ────────────────────────────────────────

step 2 "Setting up Vencord build environment"

if [ -d "$VENCORD_DIR" ]; then
    info "Removing previous build..."
    rm -rf "$VENCORD_DIR"
fi

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

info "Patching Discord..."
if patch_discord "$DISCORD_RESOURCES" "$VENCORD_DIR/dist"; then
    # Clean up build files but keep dist/ (Discord needs it at runtime)
    info "Cleaning up build files..."
    find "$VENCORD_DIR" -mindepth 1 -maxdepth 1 ! -name dist -exec rm -rf {} +
    success "Build files removed (kept ~1MB runtime in ~/.vencord-export/dist/)"

    echo ""
    echo -e "  ${GREEN}${BOLD}All done!${NC}"
    echo ""
    echo -e "  1. Open Discord"
    echo -e "  2. Go to ${BOLD}Settings → Vencord → Plugins${NC}"
    echo -e "  3. Enable ${BOLD}ExportToMarkdown${NC}"
    echo -e "  4. Right-click any channel → ${BOLD}Export to Markdown${NC}"
    echo ""
else
    fail "Patching failed. Please open an issue on GitHub."
    exit 1
fi
