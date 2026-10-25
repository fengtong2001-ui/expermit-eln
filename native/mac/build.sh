#!/bin/bash
# 构建 macOS 原生壳：dist → www 资源，swiftc 编译，组装 ExPermit.app，ad-hoc 签名
set -euo pipefail
cd "$(dirname "$0")/../.."

echo "—— 构建网页（dist/）——"
npm run build

APP="native/mac/ExPermit.app"
rm -rf "$APP"
mkdir -p "$APP/Contents/MacOS" "$APP/Contents/Resources"

echo "—— 编译 Swift 壳 ——"
swiftc -O \
  -target arm64-apple-macos12.0 \
  -framework AppKit -framework WebKit \
  -o "$APP/Contents/MacOS/ExPermit" \
  native/mac/main.swift

echo "—— 组装 .app ——"
cp -R dist "$APP/Contents/Resources/www"
cat > "$APP/Contents/Info.plist" <<'EOF'
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>CFBundleName</key><string>ExPermit</string>
  <key>CFBundleDisplayName</key><string>ExPermit 实验记录本</string>
  <key>CFBundleIdentifier</key><string>com.fengtong.expermit</string>
  <key>CFBundleVersion</key><string>1</string>
  <key>CFBundleShortVersionString</key><string>0.1.0</string>
  <key>CFBundlePackageType</key><string>APPL</string>
  <key>CFBundleExecutable</key><string>ExPermit</string>
  <key>LSMinimumSystemVersion</key><string>12.0</string>
  <key>NSHighResolutionCapable</key><true/>
  <key>LSApplicationCategoryType</key><string>public.app-category.productivity</string>
  <key>NSSupportsAutomaticGraphicsSwitching</key><true/>
  <key>NSAppTransportSecurity</key>
  <dict><key>NSAllowsArbitraryLoads</key><true/></dict>
</dict>
</plist>
EOF

codesign --force --sign - "$APP"
echo "✓ 构建完成：$APP"
echo "  自检：$APP/Contents/MacOS/ExPermit --selftest"
echo "  安装：拖到 /Applications 或直接双击运行"
