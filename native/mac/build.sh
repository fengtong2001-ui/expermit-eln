#!/bin/bash
# 构建 ExPermit for macOS 27 原生应用 (.app) 与安装镜像 (.dmg)
# 支持：
#   ./native/mac/build.sh              # 默认构建当前架构 + AppIcon.icns + .dmg
#   ./native/mac/build.sh --universal  # 编译 arm64 + x86_64 通用二进制（工具链不支持 x86_64 时自动降级）
set -euo pipefail
cd "$(dirname "$0")/../.."

echo "=== 1. 构建前端静态资源 (dist/) ==="
npm run build

APP="native/mac/ExPermit.app"
DMG="native/mac/ExPermit-macOS27.dmg"
rm -rf "$APP" "$DMG"
mkdir -p "$APP/Contents/MacOS" "$APP/Contents/Resources"

# 选择工具链：优先用 xcode-select 指向的完整 Xcode（自带全架构 Swift 运行时），
# 只有仅安装了 Command Line Tools 时才显式指定 CLT（避免 /usr/bin shim 在许可未同意时被挡）
if [[ "$(xcode-select -p 2>/dev/null || true)" == *"Xcode.app/Contents/Developer"* ]]; then
  SWIFTC="$(xcrun --find swiftc)"
  export SDKROOT="$(xcrun --sdk macosx --show-sdk-path)"
elif [ -x "/Library/Developer/CommandLineTools/usr/bin/swiftc" ]; then
  export DEVELOPER_DIR="/Library/Developer/CommandLineTools"
  export SDKROOT="$(ls -d /Library/Developer/CommandLineTools/SDKs/MacOSX*.sdk 2>/dev/null | sort -V | tail -1 || xcrun --sdk macosx --show-sdk-path)"
  SWIFTC="/Library/Developer/CommandLineTools/usr/bin/swiftc"
else
  SWIFTC="$(xcrun --find swiftc)"
  export SDKROOT="$(xcrun --sdk macosx --show-sdk-path)"
fi

# 部分 macOS 27 的 Command Line Tools 只带 arm64 的 Swift 兼容库，无法链接 x86_64；
# 这种情况下把 --universal 降级为当前架构，并在结尾注明，避免编译到一半失败。
UNIVERSAL=0
[[ "${1:-}" == "--universal" ]] && UNIVERSAL=1
COMPAT_LIB="$(dirname "$SWIFTC")/../lib/swift/macosx/libswiftCompatibility56.a"
if [ "$UNIVERSAL" = "1" ] && [ -f "$COMPAT_LIB" ] && ! lipo -info "$COMPAT_LIB" 2>/dev/null | grep -q x86_64; then
  echo "⚠️  当前工具链缺少 x86_64 Swift 兼容库，改为仅构建 $(uname -m) 架构（安装完整 Xcode 后可构建通用二进制）"
  UNIVERSAL=0
fi

echo "=== 2. 生成 macOS 27 圆角琉璃图标 (AppIcon.icns) ==="
ICONSET_DIR="$(mktemp -d)/AppIcon.iconset"
mkdir -p "$ICONSET_DIR"

# 使用 Swift CoreGraphics 原生绘制 1024x1024 macOS 27 风格图标（无需额外图像处理依赖）
cat > "${ICONSET_DIR}/../gen_icns.swift" << 'SWIFT_EOF'
import AppKit

let size = NSSize(width: 1024, height: 1024)
let img = NSImage(size: size)
img.lockFocus()

guard let ctx = NSGraphicsContext.current?.cgContext else { exit(1) }

// macOS 27 连续曲率圆角矩形底座 (824x824 居中 + 柔光渐变)
let rect = CGRect(x: 100, y: 100, width: 824, height: 824)
let path = CGPath(roundedRect: rect, cornerWidth: 185, cornerHeight: 185, transform: nil)
ctx.saveGState()
ctx.addPath(path)
ctx.clip()

let colors = [
  CGColor(red: 0.05, green: 0.58, blue: 0.53, alpha: 1.0),
  CGColor(red: 0.08, green: 0.72, blue: 0.65, alpha: 1.0),
  CGColor(red: 0.06, green: 0.38, blue: 0.42, alpha: 1.0)
] as CFArray
let space = CGColorSpaceCreateDeviceRGB()
if let grad = CGGradient(colorsSpace: space, colors: colors, locations: [0.0, 0.55, 1.0]) {
  ctx.drawLinearGradient(grad, start: CGPoint(x: 100, y: 924), end: CGPoint(x: 924, y: 100), options: [])
}

// 顶部 Liquid Glass 高光层
ctx.setFillColor(CGColor(red: 1, green: 1, blue: 1, alpha: 0.14))
ctx.fillEllipse(in: CGRect(x: 140, y: 540, width: 744, height: 420))
ctx.restoreGState()

// 绘制白色锥形瓶标志
ctx.setStrokeColor(CGColor(red: 1, green: 1, blue: 1, alpha: 0.96))
ctx.setLineWidth(44)
ctx.setLineCap(.round)
ctx.setLineJoin(.round)

let flask = CGMutablePath()
flask.move(to: CGPoint(x: 432, y: 700))
flask.addLine(to: CGPoint(x: 592, y: 700))
flask.move(to: CGPoint(x: 468, y: 700))
flask.addLine(to: CGPoint(x: 468, y: 560))
flask.addLine(to: CGPoint(x: 320, y: 310))
flask.addQuadCurve(to: CGPoint(x: 360, y: 250), control: CGPoint(x: 300, y: 250))
flask.addLine(to: CGPoint(x: 664, y: 250))
flask.addQuadCurve(to: CGPoint(x: 704, y: 310), control: CGPoint(x: 724, y: 250))
flask.addLine(to: CGPoint(x: 556, y: 560))
flask.addLine(to: CGPoint(x: 556, y: 700))
ctx.addPath(flask)
ctx.strokePath()

img.unlockFocus()

if let tiff = img.tiffRepresentation,
   let rep = NSBitmapImageRep(data: tiff),
   let png = rep.representation(using: .png, properties: [:]) {
  let outPath = CommandLine.arguments[1]
  try? png.write(to: URL(fileURLWithPath: outPath))
}
SWIFT_EOF

MASTER_PNG="${ICONSET_DIR}/../master.png"
"$SWIFTC" "${ICONSET_DIR}/../gen_icns.swift" -o "${ICONSET_DIR}/../gen_icns"
"${ICONSET_DIR}/../gen_icns" "$MASTER_PNG"

for s in 16 32 128 256 512; do
  sips -z $s $s "$MASTER_PNG" --out "${ICONSET_DIR}/icon_${s}x${s}.png" >/dev/null
  s2=$((s * 2))
  sips -z $s2 $s2 "$MASTER_PNG" --out "${ICONSET_DIR}/icon_${s}x${s}@2x.png" >/dev/null
done
iconutil -c icns "$ICONSET_DIR" -o "$APP/Contents/Resources/AppIcon.icns" || true

echo "=== 3. 编译 Swift 原生壳 (macOS 27 Liquid Glass) ==="
if [ "$UNIVERSAL" = "1" ]; then
  "$SWIFTC" -O -target arm64-apple-macos12.0 \
    -framework AppKit -framework WebKit -framework UniformTypeIdentifiers \
    -o "$APP/Contents/MacOS/ExPermit-arm64" native/mac/main.swift
  "$SWIFTC" -O -target x86_64-apple-macos12.0 \
    -framework AppKit -framework WebKit -framework UniformTypeIdentifiers \
    -o "$APP/Contents/MacOS/ExPermit-x86_64" native/mac/main.swift
  lipo -create -output "$APP/Contents/MacOS/ExPermit" \
    "$APP/Contents/MacOS/ExPermit-arm64" "$APP/Contents/MacOS/ExPermit-x86_64"
  rm -f "$APP/Contents/MacOS/ExPermit-arm64" "$APP/Contents/MacOS/ExPermit-x86_64"
else
  ARCH="$(uname -m)"
  "$SWIFTC" -O -target "${ARCH}-apple-macos12.0" \
    -framework AppKit -framework WebKit -framework UniformTypeIdentifiers \
    -o "$APP/Contents/MacOS/ExPermit" native/mac/main.swift
fi

echo "=== 4. 组装 ExPermit.app 与 Info.plist ==="
cp -R dist "$APP/Contents/Resources/www"
cat > "$APP/Contents/Info.plist" << 'EOF'
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>CFBundleName</key><string>ExPermit</string>
  <key>CFBundleDisplayName</key><string>ExPermit 实验记录本</string>
  <key>CFBundleIdentifier</key><string>com.fengtong.expermit</string>
  <key>CFBundleVersion</key><string>2</string>
  <key>CFBundleShortVersionString</key><string>0.2.0</string>
  <key>CFBundlePackageType</key><string>APPL</string>
  <key>CFBundleExecutable</key><string>ExPermit</string>
  <key>CFBundleIconFile</key><string>AppIcon</string>
  <key>LSMinimumSystemVersion</key><string>12.0</string>
  <key>NSHighResolutionCapable</key><true/>
  <key>NSSupportsAutomaticGraphicsSwitching</key><true/>
  <key>LSApplicationCategoryType</key><string>public.app-category.productivity</string>
  <key>NSAppTransportSecurity</key>
  <dict><key>NSAllowsArbitraryLoads</key><true/></dict>
</dict>
</plist>
EOF

codesign --force --deep --sign - "$APP"

echo "=== 5. 打包拖拽安装镜像 ExPermit-macOS27.dmg ==="
DMG_STAGE="$(mktemp -d)"
cp -R "$APP" "$DMG_STAGE/"
ln -s /Applications "$DMG_STAGE/Applications"
hdiutil create -volname "ExPermit 实验记录本" \
  -srcfolder "$DMG_STAGE" \
  -ov -format UDZO "$DMG" >/dev/null || true
rm -rf "$DMG_STAGE"

echo "✓ 构建完成:"
echo "  原生应用包: $APP"
echo "  安装包镜像: $DMG"
echo "  二进制架构: $(lipo -archs "$APP/Contents/MacOS/ExPermit" 2>/dev/null || echo "未知")"
echo "  运行自检:   $APP/Contents/MacOS/ExPermit --selftest"
