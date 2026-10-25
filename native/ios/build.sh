#!/bin/bash
# 准备 iOS 工程：构建网页并拷进 ExPermit/www，然后（若装了 Xcode）尝试编译
# 前提：Xcode（App Store 安装，约 12GB）。没有 Xcode 时只准备资源并给出说明。
set -euo pipefail
cd "$(dirname "$0")/../.."

echo "—— 构建网页（dist/）——"
npm run build

echo "—— 拷入 iOS 工程 ——"
rm -rf native/ios/ExPermit/www
cp -R dist native/ios/ExPermit/www

if ! command -v xcodebuild >/dev/null || ! xcrun --sdk iphonesimulator --show-sdk-path >/dev/null 2>&1; then
  cat <<'EOF'

⚠️ 这台 Mac 还没有安装 Xcode，无法编译 iOS 应用。工程已就绪：

  1. 从 App Store 安装 Xcode（免费，需要你的 Apple ID，约 12GB）
  2. 打开 native/ios/ExPermit.xcodeproj
  3. Xcode → Settings → Accounts 添加你的 Apple ID（免费账号即可）
  4. 选中 ExPermit 目标 → Signing & Capability → Team 选你的账号
  5. 选 iPhone 模拟器按 ⌘R 验证；或数据线连 iPhone 选设备按 ⌘R 安装到手机

  免费账号装到真机的应用 7 天过期，重新按 ⌘R 即可；付费开发者账号（$99/年）可长期使用。

  不想装 Xcode 也可以：iPhone 用 Safari 打开
  https://fengtong2001-ui.github.io/expermit-eln/
  → 分享 → 添加到主屏幕，即可全屏离线使用（效果接近原生）。
EOF
  exit 0
fi

echo "—— 编译（iPhone 模拟器）——"
cd native/ios
xcodebuild -project ExPermit.xcodeproj -scheme ExPermit -destination 'generic/platform=iOS Simulator' build
echo "✓ 编译通过。用 Xcode 打开工程，选真机或模拟器运行。"
