#!/usr/bin/env bash
set -euo pipefail

# Run from a local checkout, so installation always uses the reviewed local code.
PLUGIN_ROOT="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
VENCORD_DIR="${VENCORD_DIR:-$PLUGIN_ROOT/.vencord-build}"
for tool in git node pnpm; do
    command -v "$tool" >/dev/null || { echo "Install $tool before continuing." >&2; exit 1; }
done

if [[ ! -d "$VENCORD_DIR" ]]; then
    git clone --depth 1 https://github.com/Vendicated/Vencord.git "$VENCORD_DIR"
fi
if [[ ! -f "$VENCORD_DIR/scripts/build/build.mjs" ]]; then
    echo "VENCORD_DIR must be a Vencord source checkout." >&2
    exit 1
fi
cd "$VENCORD_DIR"
pnpm install --frozen-lockfile
mkdir -p src/userplugins/exportToMarkdown
cp "$PLUGIN_ROOT/"*.ts "$PLUGIN_ROOT/"*.tsx src/userplugins/exportToMarkdown/
pnpm exec tsc --noEmit
pnpm build --standalone --disable-updater
printf '{}\n' > dist/package.json

# VESKTOP_CONFIG_DIR can select a portable/custom profile.
node "$PLUGIN_ROOT/scripts/configure-vesktop.mjs" "$VENCORD_DIR/dist" "${VESKTOP_CONFIG_DIR:-}"
echo "Installed. Open Vesktop, then right-click a channel or DM → Export to Markdown."
echo "Keep $VENCORD_DIR: Vesktop loads the build from this directory."
