# ExPermit 实验记录本

本地优先的电子实验记录本（ELN）。数据只存在你自己的浏览器里，不需要服务器，断网也能用，可以装到手机主屏当 App。

借鉴自 [eln](https://github.com/fengtong2001-ui/eln) 的思路（插件式内容块、完成后锁定与审计、快照、回收站、离线优先），并合并了旧版 ExPermit 的孔板、试剂库和日程，在交互上重新设计。

## 功能

- **今天**：今日安排、进行中的实验、过期或库存不足的试剂，一屏看完。
- **实验**：文档式编辑，块与块之间可以插入、拖动排序。删除块可以撤销。页头一直显示保存状态。
- **内容块**：
  - 文本（Markdown 快捷输入、待办）
  - 图片与文件（拖拽、粘贴截图、手机拍照）
  - 数据表（可从 Excel 粘贴，自动算均值 ± SD）
  - 实验步骤（可勾选，带孵育计时器）
  - 孔板布局（6–96 孔，按 ANSI/SBS 横放；支持框选、⌘C/⌘V、分组上色）
  - 培养容器（T25 / T75 / 培养皿，传代 +1）
  - 试剂消耗（从试剂库选择，勾选后自动扣库存）
  - 抗体（按稀释比算原液用量并扣库存）
  - 泳道表
  - qPCR（2^-ΔΔCt 相对定量，Livak & Schmittgen 2001）
- **试剂库**：批号、有效期、存放位置、库存。同量纲单位自动换算（µL ↔ mL）。能反查每种试剂用在了哪些实验。
- **日程**：月历视图，实验可以带计划日期，双击日期即可新建当天的实验。
- **历史版本**：每天第一次打开、标记完成、恢复旧版本之前都会自动保存一份。旧版本可以预览、原地恢复，或另存为新实验。另有操作记录。
- **完成后锁定**：标记完成后内容变为只读。解锁编辑会被计入审计。
- **模板**：内置 WB、qPCR、细胞培养、孔板检测几套模板，也可以把任意实验存为模板。
- **搜索**：⌘K 全局搜索实验、内容块和试剂，中文子串直接命中，点击结果会定位到对应的块。
- **多设备同步**：通过 GitHub 私有仓库或 WebDAV（NAS / Nextcloud）在电脑和手机之间自动同步。行级合并：谁改的最新听谁的，删除会同步，附件跟着走，不会整库覆盖谁。
- **备份**：一键导出整个数据库为 zip（含图片），也可以从 zip 恢复。单个实验可以导出为 Markdown + 附件。

## 线上地址

<https://fengtong2001-ui.github.io/expermit-eln/>

推送到 main 会自动测试并发布。**注意：不同浏览器、不同设备、无痕窗口里的数据互不相通**（数据在各自浏览器的 IndexedDB 里），换设备先用「设置与备份」导出/导入。

## 使用

```bash
npm install
npm run dev        # http://localhost:5173
npm test           # 单元测试
npm run build      # 产物在 dist/，纯静态文件，可放到任何静态托管
```

### 分享给其他人用

- **网页版**：把线上地址发给对方即可，打开就能用（数据在各自浏览器里，互不可见）。
- **开同步**：设置与备份 → 多设备同步，是三步向导（建私有仓库 → 建只授权该仓库的令牌 → 粘贴），全程有直达链接和清单；或者由已配好的人点「复制配置链接」，对方在设置页粘贴导入，一步完成（链接含令牌，只发给自己信任的设备）。
- **共用同一份同步数据**（例如实验室共用）：仓库所有者把对方的 GitHub 账号加为该私有仓库的 Collaborator（仓库 Settings → Collaborators）；对方在向导第 ② 步建令牌时无法选择别人的仓库，改用 classic token（勾 repo 只读+读写）或由所有者提供配置链接即可。合并规则与单人相同：行级合并、最新为准。
- **macOS App**：把 `ExPermit.app` 打包 zip 发给对方（同架构 Mac 可直接运行；若被 Gatekeeper 拦，右键 → 打开）。

### 多设备同步

「设置与备份 → 多设备同步」里配置，推荐 **GitHub 私有仓库**（GitHub API 允许浏览器跨域，必定可用）：

1. 新建一个私有空仓库（如 `lab-sync`）；公开仓库会被拒绝。
2. 建 Fine-grained token：只授权这个仓库、只勾 Contents 读写。
3. 在每台设备的浏览器里填同样的配置，勾「自动同步」。

也支持 WebDAV（NAS、Nextcloud 等）。注意浏览器直连 WebDAV 需要服务器允许跨域：自建 NAS / Nextcloud 可以配置；坚果云不支持浏览器直连（设置页的「测试连接」会说明原因）。

同步是本地优先的行级合并，不是整库覆盖：两台设备各自改动会合并成并集，同一行以修改时间新的为准；删除会以墓碑形式同步并在 30 天后彻底清理。令牌 / 密码只保存在各自设备的浏览器 localStorage 里。

## 仓库拆分（2026-10-26）

网页层与 Electron 壳源码在本仓；各平台只做打包，源码不复制，数据模型与同步协议永远一致：

| 仓库 | 内容 |
|---|---|
| **expermit-eln**（本仓） | 网页版源码、Electron 壳源码、核心制品发布（`www-<ver>.zip` / `shell-<ver>.zip`） |
| [expermit-mac](https://github.com/fengtong2001-ui/expermit-mac) | macOS 打包：Electron dmg + Swift 原生壳 |
| [expermit-win](https://github.com/fengtong2001-ui/expermit-win) | Windows 打包：NSIS 安装版 + 免安装版 |
| [expermit-ios](https://github.com/fengtong2001-ui/expermit-ios) | iOS 壳（Xcode 工程）：模拟器编译校验 + 未签名 IPA，真机需本地签名 |
| expermit-android（规划中） | Android 壳 |

核心发版（tag `v<ver>` 或手动 dispatch）会自动把 `www-<ver>.zip` 与 `shell-<ver>.zip`
附加到 Release；平台仓点一次「Run workflow」即可取制品打包并发布自己平台的安装包。

## 打包成桌面 / 手机应用

- **Windows**：`npm install && npm run build && npm run dist:win` 一键打出 `release/ExPermit-Setup-<版本>.exe`（一键安装版，装到开始菜单）和 `release/ExPermit-Portable-<版本>.exe`（免安装便携版，双击即用）。Electron 壳，数据存在应用自己的目录里。命令行跑 `"ExPermit 实验记录本.exe" --selftest` 可做无头自检；`--sync '<配置JSON>'` 可在启动前导入同步配置（与 macOS 壳同参数）。
- **macOS**：`npm install && npm run build && npm run dist:mac` 打出 `release/ExPermit-<版本>-<架构>.dmg`（Electron 壳，与 Windows 版同功能：检查更新、数据位置迁移、原生文件面板）。未做开发者签名，首次打开若被 Gatekeeper 拦，右键 → 打开。更轻量的原生 Swift 壳（Liquid Glass 外观、原生菜单与 ⌘Z 焦点分流；**不含**桌面版自动更新和数据位置迁移）已迁到 [expermit-mac](https://github.com/fengtong2001-ui/expermit-mac)，`./native/mac/build.sh` 在该仓。
- **iOS**：源码在 [expermit-ios](https://github.com/fengtong2001-ui/expermit-ios)（Xcode 工程 + WKWebView 壳）。在该仓 `npm install && node scripts/fetch-www.mjs --ver <版本>` 取本仓网页制品，打开 `ExPermit.xcodeproj`，在 Signing 里选自己的 Apple ID（免费账号即可），连手机按 ⌘R 安装。免费账号安装的应用 7 天过期，重新运行即可。
- 不装 Xcode 的替代方案：iPhone 用 Safari 打开线上地址 → 分享 → 添加到主屏幕，即可全屏离线使用（PWA）。
- 三个壳都用 `app://local` 协议加载本地网页：数据存在应用自己的沙盒里，和浏览器版互不相通；GitHub 同步在壳内可用（已实测）。

## 技术

React 19 + TypeScript + Vite，Tailwind CSS 4，Radix UI，Dexie（IndexedDB），Tiptap，dnd-kit，cmdk。路由用 hash 模式，构建产物是纯静态站点，并带 PWA 离线缓存。

## 数据与隐私

所有数据都保存在当前浏览器的 IndexedDB 中，不会发送到任何服务器。

- 清除浏览器数据，或换设备、换浏览器，都会看不到原来的数据。请定期在「设置与备份」里下载备份。
- 应用启动时会向浏览器申请持久存储，以降低空间紧张时被清理的风险。
