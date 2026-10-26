# HANDOFF —— 交接文档（给下一个 AI agent）

> 读完本文 + 仓库即可开工，不需要重新摸索。最后更新：2026-10-26，对应 v0.1.4。
> 先读 `DEVELOPMENT.md`（硬性开发规范），再按需查 `CHANGELOG.md`（版本历史）与 `PENDING.md`（待改批次）。

## 1. 项目是什么

ExPermit 实验记录本：**本地优先**的电子实验记录本（ELN），数据全存设备 IndexedDB（Dexie），无后端。一套代码三种形态：

- **网页版**：React 19 + TypeScript + Vite + Tailwind 4 + Radix，Hash 路由，纯静态产物；GitHub Pages 线上地址 `fengtong2001-ui.github.io/expermit-eln/`
- **Windows 桌面版**：Electron 45 壳（`electron/main.cjs`），app://local 协议加载本地资源；与 macOS 壳（native/mac，作者写的）同契约（--selftest/--sync/--www）
- 源头仓库：`https://github.com/fengtong2001-ui/expermit-eln`（公开）

核心概念：实验 = 内容块列表（protocol 步骤/泳道/抗体/试剂/孔板/qPCR/表格/文本/文件/培养），块经 `BlockFrame` 本地草稿 + 去抖保存；多设备同步 = GitHub 私库或 WebDAV 行级合并（`src/lib/sync/`）；全局撤回栈（`src/lib/undo.ts`）；桌面版自动更新（热更为主，见 §5）。

## 2. 本机/网络事实（省 token 关键，全部实测）

| 事实 | 结论 |
|---|---|
| github.com 的 git/HTTPS 与 release 下载域（release-assets/objects/raw） | **间歇~持续 TLS reset，不可依赖** |
| api.github.com、codeload.github.com、uploads.github.com（PS 系统栈） | **稳定可用** |
| git push | 时通时断；失败用 `node scripts/api_push.mjs`（Git Data API 快照推送，见 §5 坑⑦'） |
| npm 官方源 | 会被 reset；装包一律加 `--registry=https://registry.npmmirror.com` |
| Electron 二进制 | `.npmrc` 已配 npmmirror 镜像；若 postinstall 静默跳过，手动 `node node_modules/electron/install.js`（带 `ELECTRON_MIRROR` 环境变量） |
| GITHUB_TOKEN | 在 `~/.eln/secrets.env`（classic，repo 权限）。PowerShell 读法见 `scripts/make_release.mjs` 或直接 `Get-Content` 解析 |
| git | 便携 MinGit：`C:\Users\FT\tools\mingit\cmd\git.exe`（新 shell 里 PATH 未必有，用全路径） |
| Node/npm | v24.13 / 11.6（jsdom 有 EBADENGINE 警告，无害） |
| shell | cmd 语义；`tail`/`echo #` 不可用；node -e 内联引号必炸，写临时 .mjs |

## 3. 代码地图（按改动频率）

```
electron/main.cjs        桌面壳：app:// 协议、selftest、--sync、IPC（更新/热更/数据目录）、热更 staged 切换
electron/preload.cjs     contextBridge → window.expermitDesktop（desktop.ts 是其类型）
src/lib/undo.ts          全局撤回栈（pushUndo/undoById/popUndo/useUndoTop）
src/lib/bca.ts           BCA 蛋白定量：标曲拟合、浓度回算、WB 上样配平
src/blocks/BcaBlock.tsx  BCA 实验块（OD 粘贴、右键菜单、撤销接入）
src/lib/updater.ts       检查更新（api.github.com releases/latest）+ 升级编排（热更→exe→浏览器）
src/lib/scheduleDone.ts  日程完成态唯一权威（与实验状态双向联动）
src/lib/repo.ts          所有 Dexie 写操作；软删除+30天回收站；快照
src/lib/db.ts            Dexie schema（version 2 已移除 usages 表）
src/blocks/ProtocolBlock.tsx  实验步骤：table+列头+无框清单式+dnd 拖动+计时按钮/编辑弹层（新 UI 范式参照）
src/components/context-menu.tsx 右键菜单基建（Radix ContextMenu）；接入模式见 ProtocolBlock/Schedule
src/components/ScheduleDialog.tsx 新建安排弹窗（日程页+今天页共用）
src/pages/Settings.tsx   设置页：关于与更新（更新日志渲染/检查频率/立即检查）、数据位置
CHANGELOG.md             版本日志（设置页内渲染它；新版本段落写在最上）
PENDING.md               用户的攒批待改清单（用户说开工才动）
DEVELOPMENT.md           开发规范（§5 右键菜单、§6 桌面版、§7 已移除功能）
scripts/make_release.mjs 发版一条龙（见 §5）
scripts/api_push.mjs     git push 兜底
release-assets/          热更新资源包（www-<版本>.zip + shell-min.json，只保留当前版本）
```

## 4. 开发循环

```bash
npx tsc -b && npx vitest run   # 必须全绿（当前 9 文件/32 用例）
npm run dev                     # localhost:5173 浏览器验证
```

浏览器验证（ZCode IAB）注意：受限 playwright 的 `locator.click` 在 portal/表格元素上大面积超时；**稳定做法 = `playwright.evaluate` 派发原生事件**（`el.click()`、右键用 `dispatchEvent(new MouseEvent('contextmenu',{bubbles:true,...}))`——Radix ContextMenu 正常响应）。dnd-kit 拖动必须 CDP 真实输入：`cua.move` hover 后 `cua.drag` 多点路径，合成 PointerEvent 无效。视觉判断用截图 + 视觉模型（记得视觉模型会有 5-10% 误报，代码事实优先）。

## 5. 发版全流程（v0.1.4 起固化）

```bash
# 1. 改代码 → tsc/vitest 绿 → 浏览器验证
# 2. 升 package.json version；CHANGELOG.md 顶部加段落（用户可感知的语言，不写实现细节）
npm install --package-lock-only        # 同步 lock 的 version 字段
npm run build                          # 产出 dist/
# 3. 打包桌面版（镜像环境变量见下）
set ELECTRON_BUILDER_BINARIES_MIRROR=https://npmmirror.com/mirrors/electron-builder-binaries/
set ELECTRON_MIRROR=https://npmmirror.com/mirrors/electron/
npx electron-builder --win
"release\win-unpacked\ExPermit 实验记录本.exe" --selftest    # 必须 SELFTEST OK（exit 0）
# 4. git add -A && git commit（身份已在仓库 config：fengtong2001-ui）
# 5. 一条龙发版（GITHUB_TOKEN 从 ~/.eln/secrets.env 读进环境）：
node scripts/make_release.mjs
#    它会：生成 release-assets/www-<ver>.zip 提交 → api_push 推远端 → 建 Release → 上传 Setup exe
# 6. CI 等绿（api.github.com/actions/runs，npm install 不是 npm ci——见坑⑨）
# 7. 复制 release/ExPermit-Setup-<ver>.exe 与 Portable 到桌面 D:\Table，删旧版本
```

macOS 两种壳：Electron 版 `npm run dist:mac`（功能对齐 Windows，含检查更新/数据位置迁移，未签名需右键打开）；`native/mac/build.sh` 是更轻的 Swift 原生壳（Liquid Glass、⌘Z 焦点分流、原生文件面板，但**没有**桌面更新与数据位置迁移）。

热更新机制（v0.1.4 起，务必理解再动更新相关代码）：客户端从 **codeload 拉 tag zipball** → 解出 `release-assets/www-<ver>.zip` → 写 `resources/update-staged` → relaunch → 启动早期 `applyStagedUpdate()` 原子切换 `www`。壳（electron/*.cjs）变更时：`release-assets/shell-min.json` 的 `shellFrom` 要求 > `main.cjs` 的 `SHELL_CAP` → 客户端回落完整安装包。**改了壳就必须：升 SHELL_CAP + 发完整包**；只改网页层则热更即可，用户无感升级。

## 6. 坑清单（全部真金白银踩过）

1. **electron-builder 不打包 devDependencies**（files 里显式写 node_modules/<pkg>/** 无效）——运行时要 require 的包必须 `npm i --save`（fflate 由此入 dependencies）。
2. **selftest 失败弹 Error 框的进程会锁 app.asar**（重打包 EBUSY）——重打包前杀 win-unpacked 路径的进程（按 ExecutablePath 过滤，别杀用户已装的正式版）。
3. **selftest 必须用一次性 userData**（已实现）——否则与用户正开着的实例抢数据目录锁 → indexedDB:false 假失败。
4. **npm 11 的 lock 不写 Tailwind oxide wasm32 可选依赖的 bundleDependencies 条目**，Linux `npm ci` 报 Missing——CI 一律 `npm install`（已写入 workflow 注释，别改回）。
5. **api_push**：远端是 API 快照 commit 时本地无该对象 → 按 tree 哈希找等价本地 commit 作基准；找不到自动全量上传（~111 文件，rate limit 内，正常）。404 在 make_release 里 = Release 不存在，要 catch。
6. **make_release 的 node fetch 上传 121MB asset 可能超时**（undici headers timeout）——兜底：PowerShell `Invoke-RestMethod -InFile`（系统网络栈，稳）。Release 创建顺序必须**先推资源包再建 Release**（tag 打在远端 main HEAD，含资源包热更才拉得到）。
7. **preload 传参**：渲染进程 argv 会被塞 `/prefetch:1` 等内部开关——必须 `--key=<encodeURIComponent(v)>` 单参数形式，不能 indexOf+1。
8. **CHANGELOG 措辞**：写用户可感知的变化，不写实现细节/界面琐碎（用户明确要求过）。
9. **升级安装**：NSIS 向导式（oneClick:false，可选目录）；用户旧实例开着时安装器会要求关闭，正常。

## 7. 用户偏好（不遵守会返工）

- **UI 只留功能标签**：无说明段落、无示例值 placeholder（2-4 字功能词或干脆不要）、表格列头承担提示
- 界面改动**必须与现有风格一致**（Tailwind slate/brand 色系、圆角卡片、深浅双色）
- **删除类/结构性操作必须可撤回**（pushUndo 接入）；右键菜单是次要操作入口（主操作仍要在可见处）
- 攒批机制：用户丢截图/一句话说「先记录」→ 写 `PENDING.md`；说「开工」才动代码
- 用户常在手机上对话：交付给用户的东西要**可复制、步骤最少、能代办就代办**（如安装包直接放桌面 D:\Table）
- 重活（大范围通读/批量机械改动）派给 flash 子代理，给精确到 file:line 的指令并要求自测（tsc+vitest）；主会话只做设计决策、关键文件、验证与发版
- 数据是科研记录：**任何改动先保数据安全**（软删除/快照/备份机制不要破坏；危险操作默认拒绝+二次确认）

## 8. 当前状态（2026-10-26）

- 线上：网页版 v0.1.4（Pages，CI 自动）；桌面：用户 D:\Table 有 Setup/Portable-0.1.4，用户可能还开着更旧版本（启动会自动提示更新）
- 远端 main = 本地内容一致（API 快照推送，sha 不同属正常，别尝试 pull --rebase 以外的骚操作；git 通道恢复时直接 push 会 non-FF，先 `git fetch && git reset --soft origin/main` 并轨）
- `PENDING.md` 当前为空，等下一批
- 遗留可做：坚果云 WebDAV 桌面版同步接入方案已分析完（见记忆/会话，结论：main 进程 net.fetch 无 CORS，加 `sync:http` IPC 即可，约半天）——用户尚未点头

## 9. 仓库拆分（2026-10-26）

核心仓不再直接出安装包，只出**核心制品**；各平台仓只放壳与打包流水线（源码不复制，数据模型/同步协议永远一致）：

| 仓库 | 内容 | 打包入口 |
|---|---|---|
| `expermit-eln`（本仓） | 网页版 + Electron 壳源码（`electron/`） | `npm run build && node scripts/pack-artifacts.mjs` → `artifacts/www-<ver>.zip`、`shell-<ver>.zip` |
| `expermit-mac` | Electron 打包 + Swift 原生壳（`native/mac` 已迁过去） | Actions → Build macOS（填版本） |
| `expermit-win` | NSIS 安装版 + 免安装版 | Actions → Build Windows（填版本） |
| `expermit-ios` | Xcode 工程（WKWebView 壳） | Actions → Build iOS（模拟器编译校验）；真机需本地 Xcode 签名 |

- 核心仓 Release 发布时，`core-artifacts.yml` 会自动把 `www-<ver>.zip` 与 `shell-<ver>.zip` 附加到该 Release（也可以手动 dispatch）。**`make_release.mjs` 照旧可用**，发布事件会触发该工作流。
- 平台仓用 `scripts/fetch-core.mjs`（iOS 为 `fetch-www.mjs`）从核心 Release 下载制品；本地开发可加 `--core ../expermit-eln` 直接用本地 `dist/`。
- 升级指向：`electron/main.cjs` 读取应用内 `resources/update-config.json` 的 `installerRepo`（平台仓各自填自己），决定“完整安装包/下载页”指向哪个仓；热更新仍从核心仓拉网页包。缺该文件时行为与拆分前完全一致。
- 本仓已移除 `native/mac`、`native/ios`、`macos-build.yml`。壳代码仍在 `electron/`（Web/桌面的共同基础），改壳需按 §5 升 `SHELL_CAP` 并发完整包。
