#!/bin/bash
# 打包 OpenTeleprompter.app —— 一个可直接双击的 macOS 应用包。
# 用法：bash scripts/build-app.sh [release|debug]

set -euo pipefail

CONFIG="${1:-release}"
cd "$(dirname "$0")/.."

# 用 Xcode 工具链（Command Line Tools 不含 Swift Testing 等）
export DEVELOPER_DIR="${DEVELOPER_DIR:-/Applications/Xcode.app/Contents/Developer}"

echo "==> swift build --configuration $CONFIG"
swift build --configuration "$CONFIG"

BINARY=".build/$(swift build --configuration "$CONFIG" --show-bin-path)/TeleprompterApp"
if [ ! -f "$BINARY" ]; then
    BINARY=".build/arm64-apple-macosx/$CONFIG/TeleprompterApp"
fi
if [ ! -f "$BINARY" ]; then
    BINARY=$(find .build -type f -name TeleprompterApp | head -1)
fi
if [ ! -f "$BINARY" ]; then
    echo "找不到构建产物 TeleprompterApp"; exit 1
fi

APP="OpenTeleprompter.app"
echo "==> 打包 $APP"
rm -rf "$APP"
mkdir -p "$APP/Contents/MacOS"
mkdir -p "$APP/Contents/Resources"
cp "$BINARY" "$APP/Contents/MacOS/OpenTeleprompter"
cp App-Info.plist "$APP/Contents/Info.plist"

# ad-hoc 签名（没有开发者账号时也能跑，首次打开需右键 → 打开）
echo "==> ad-hoc 签名"
codesign --force --deep --sign - "$APP" 2>&1 || {
    echo "警告：codesign 失败，继续"
}

# 去除隔离属性，避免 Gatekeeper 提示
xattr -rd com.apple.quarantine "$APP" 2>/dev/null || true

echo ""
echo "完成：$(pwd)/$APP"
echo "双击运行，或：open \"$(pwd)/$APP\""
echo ""
echo "首次运行会弹出权限请求："
echo "  - 麦克风（朗读追踪）"
echo "  - 语音识别（转写）"
echo "  - 屏幕录制（面试模式下捕获系统音频）"
