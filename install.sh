#!/usr/bin/env bash
set -e

# Silent install of Kilo CLI (npm)
if ! command -v npm >/dev/null 2>&1; then
  echo "Error: npm not found. Please install Node.js and npm before running this installer."
  exit 1
fi
npm install -g @kilocode/cli >/dev/null 2>&1

# Roxera configuration repository
REPO="roxera/roxera-cli-config"
API_URL="https://api.github.com/repos/$REPO/releases/latest"
INSTALL_DIR="$HOME/.config/roxera"
BIN_DIR="$HOME/.local/bin"

# Get latest release info (fallback to tag if API fails)
LATEST_TAG=$(curl -fsS "$API_URL" | grep -o '"tag_name":"[^"]*' | cut -d'"' -f4 || echo "v0.0.0")
DOWNLOAD_URL="https://github.com/$REPO/releases/download/$LATEST_TAG/roxera-config.zip"

# Create directories
mkdir -p "$INSTALL_DIR" "$BIN_DIR"

# Download and extract
echo "Downloading Roxera CLI..."
curl -Lfs "$DOWNLOAD_URL" -o "/tmp/roxera.zip"
unzip -o "/tmp/roxera.zip" -d "$INSTALL_DIR" >/dev/null
# The extracted folder may be something like roxera-roxera-cli-config-<hash>
EXTRACTED=$(ls -dt "$INSTALL_DIR"/*/ | head -1)
if [ -n "$EXTRACTED" ]; then
  mv "$EXTRACTED"/* "$INSTALL_DIR"/
  rmdir "$EXTRACTED"
fi

# Write version file
echo "$LATEST_TAG" > "$INSTALL_DIR/VERSION"

# Create launcher script
cat > "$BIN_DIR/roxera" << 'EOF'
#!/usr/bin/env bash
set -e

CONFIG_DIR="$HOME/.config/roxera"
VERSION_FILE="$CONFIG_DIR/VERSION"

# Handle update command
if [ "$1" = "update" ]; then
  echo "Updating Roxera CLI..."
  # Fetch latest release
  LATEST_URL=$(curl -fsS "https://api.github.com/repos/roxera/roxera-cli-config/releases/latest" | grep -o '"zipball_url":"[^"]*' | cut -d'"' -f4)
  TMPDIR=$(mktemp -d)
  curl -Lfs "$LATEST_URL" -o "$TMPDIR/update.zip"
  unzip -o "$TMPDIR/update.zip" -d "$TMPDIR/extract" >/dev/null
  EXTRACTED=$(ls -dt "$TMPDIR/extract"/*/ | head -1)
  if [ -n "$EXTRACTED" ]; then
    rm -rf "$CONFIG_DIR"/*
    mv "$EXTRACTED"/* "$CONFIG_DIR"/
    rm -rf "$TMPDIR"
  fi
  # Update version file
  NEW_TAG=$(curl -fsS "https://api.github.com/repos/roxera/roxera-cli-config/releases/latest" | grep -o '"tag_name":"[^"]*' | cut -d'"' -f4)
  echo "$NEW_TAG" > "$VERSION_FILE"
  echo "Update complete. Please restart your terminal."
  exit 0
fi

# Background update check (non-blocking)
(
  CURRENT_VERSION=$(cat "$VERSION_FILE" 2>/dev/null || echo "0.0.0")
  LATEST_TAG=$(curl -fsS "https://api.github.com/repos/roxera/roxera-cli-config/releases/latest" | grep -o '"tag_name":"[^"]*' | cut -d'"' -f4 || echo "0.0.0")
  if [ "$LATEST_TAG" != "$CURRENT_VERSION" ] && [ "$CURRENT_VERSION" != "0.0.0" ]; then
    echo ""
    echo "рџљЂ Р”РѕСЃС‚СѓРїРЅР° РЅРѕРІР°СЏ РІРµСЂСЃРёСЏ Roxera CLI: $LATEST_TAG"
    echo "   РўРµРєСѓС‰Р°СЏ РІРµСЂСЃРёСЏ: $CURRENT_VERSION"
    echo "   Р’С‹РїРѕР»РЅРёС‚Рµ 'roxera update' РґР»СЏ РѕР±РЅРѕРІР»РµРЅРёСЏ"
    echo ""
  fi
) &

# Launch Kilo with Roxera config
export KILO_CONFIG_DIR="$CONFIG_DIR"
exec kilo "$@"
EOF

chmod +x "$BIN_DIR/roxera"

echo
echo "Roxera CLI installed successfully."
echo "Please restart your terminal or run: source ~/.profile"
echo "Then use the command: roxera"
echo