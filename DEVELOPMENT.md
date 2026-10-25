# 开发规范

改动 UI / 交互前先读这里。所有规范都来自实际踩过的坑，新增代码必须遵守；`npx tsc -b` 与 `npx vitest run` 全绿才算完成。

## 1. 可撤销的删除（全局撤回栈）

所有**结构性操作**（删除内容块、块内删除行/分组/泳道/步骤、删除实验、删除日程、删除试剂、归档、标记完成）必须接入 `src/lib/undo.ts`：

```ts
import { pushUndo } from '@/lib/undo'
const uid = pushUndo('删除步骤', () => void 恢复函数())  // 删除后立刻登记
toast('…', { action: { label: '撤销', onClick: () => undoById(uid) } })  // toast 上的撤销精确撤这一条
```

- 入口共三个：Ctrl/Cmd+Z（非输入焦点时，`Shell.tsx` 已接管）、右下角常驻「撤回」浮条（`UndoBar`，自动出现）、toast「撤销」按钮。
- **块内删行**的固定模式：`pushUndo('删除XX', () => 保存函数(structuredClone(删除前的数据)))`，恢复必须走与删除相同的保存链路（onChange / set / setRows），参考 `src/blocks/ProtocolBlock.tsx` 的 RowDelete。
- 文字编辑的撤销归输入框 / Tiptap 原生行为，**不要**把打字内容塞进撤回栈。
- 软删除（`deletedAt`）是 30 天回收站机制；撤回栈是即时反悔窗口，两者互补，不要用 `db.add` 恢复软删记录（id 冲突，应 `update` 清 `deletedAt`）。

## 2. 输入框样式

四个层级，新增输入框对号入座：

| 场景 | 类 | 说明 |
|---|---|---|
| 表单 | `field` | 常显边框，浅/深双色齐全（`src/index.css`） |
| 表格单元格 | `cell` | 常显浅边框（slate-200 / dark:slate-700），hover 加深，focus 品牌色 |
| 清单式（步骤/行内长列表） | 参照 `ProtocolBlock` 的 `bare` | 无框、行 hover 微亮、focus 轻背景提示位置；列多时用 `<table>` + thead |
| 行内编辑（日程条目等） | 参照 `Schedule.tsx` | `rounded-md border … hover:border-slate-300 focus:border-brand-500 dark:border-slate-700` |

- **每个可输入框必须「看得见能输入」**：要么自身有持续可见的边框，要么有轻背景/列头提示位置。标题类大字输入（实验标题、块标题）是唯一例外。
- **表格类块（步骤、泳道、试剂、抗体、qPCR…）：每列用途写在列头（thead 或列头行），格内输入一律不留 placeholder。**
- **禁止在带 `field`/`cell` 的输入框上追加写死的 `bg-white`、`text-slate-900` 等单色类**：utilities 层会覆盖组件层（`@layer components`）里的 `dark:` 配色，深色模式下变成白底白字。需要定制时必须同时给 `dark:` 变体。
- 深色模式由 `<html>.dark` class 切换（`src/lib/theme.ts`），`.dark { color-scheme: dark }` 让日期选择器等原生控件自动变深。新 UI 必须浅深双色都写。

## 3. 占位符（placeholder）

- 只允许 **2–4 字功能词**：`条件参数`、`样品`、`上样量`、`备注`。
- 字段上方已有 `label` 或表格列头的，**直接不写 placeholder**（「名称」「储存温度」这类不需要提示）。
- 禁止示例值（`如 HeLa`、`1000`、`GAPDH`）和说明句（`支持 Markdown：# 标题…`）。Tiptap 正文占位符是「记录」，heading 是「标题」。
- 依据：界面只留功能标签，解释性文字一概不要（用户既定偏好，历史多轮迭代确认）。

## 4. 状态同步

- 日程条目的完成态 = `schedule.done` **或** 关联实验 `status` 为 done/archived，统一走 `src/lib/scheduleDone.ts` 的 `schedDone` / `toggleScheduleDone`。勾选关联了实验的日程会联动完成/重新打开实验。**任何页面不许绕过它直接 `updateSchedule({ done })`**，否则日程页与实验列表的完成态会再次分裂。
- 同类规则：一个实体的同一状态只能有一个权威来源（experiment.status 是实验完成态的唯一权威；schedule.done 只对手工日程负责）。

## 5. 右键二级菜单（0.1.3 起）

- **右键是次要操作的正式入口**：除左侧边栏主导航外，条目类 UI（实验卡片、项目、日程条目、内容块、块内表格行、孔板分组等）都必须提供右键菜单；后续新增条目类 UI 一并遵守。
- 菜单先放常用项（打开/复制/移动/删除/完成…），结构可随时扩充；**主操作仍必须出现在界面可见处**，右键只是快捷方式，不承载唯一入口。
- 统一用 `src/components/context-menu.tsx`（Radix ContextMenu 封装，观感与 ui.tsx 的 Menu 一致），模式：`<ContextMenu><ContextMenuTrigger asChild>条目</ContextMenuTrigger><ContextMenuContent>…</ContextMenuContent></ContextMenu>`；只读态用 Trigger 的 `disabled`。
- 文本编辑区（输入框、Tiptap）的右键交给浏览器/编辑器原生行为，**不要**拦截。

## 6. 桌面版（Electron）

- 网页与壳的唯一通道是 preload 注入的 `window.expermitDesktop`（类型见 `src/lib/desktop.ts`：版本信息、下载/安装更新、更改数据目录、下载进度订阅）；网页版下为 `undefined`，所有桌面专属 UI 必须先判 `isDesktop`。
- 更新流程统一走 `src/lib/updater.ts`（GitHub Releases 为版本源）；发版 = 升 package.json version + CHANGELOG 追加 + 打 tag + 建 Release 并上传 `ExPermit-Setup-<版本>.exe`。
- 数据存储位置：marker 文件 `%APPDATA%/expermit-data-location.json` 指向自定义目录，壳启动时（ready 前）读取并迁移/切换 userData（`electron/main.cjs` 的 `applyCustomDataDir`）。
- 壳的完整契约（app://local、--selftest、--sync）见 `electron/main.cjs` 头注与 README。

## 7. 已移除的功能（不要复活）

- 从旧版 ExPermit 导入（0.1.2 删，legacy.ts 已移除）。
- 试剂库存自动扣减（0.1.2 删）：usages 表已从 Dexie schema 移除（version 2）且不再参与多设备同步；库存数量保留在试剂库中手动维护。旧设备同步数据里的 usages 记录会被自动忽略。

## 8. 其他约定

- 块编辑器数据流：`BlockFrame` 持有本地草稿 + `useDebouncedSave` 去抖保存，编辑器内一切修改走 `onChange`（不要直写 db）。去抖实现保证「保存中新输入不丢」，撤销回调延迟执行也能正确落库。
- 新内容块：在 `src/blocks/` 建 `XxxBlock.tsx` + `defs.ts` 注册 + `registry.tsx` 注册图标；行删除必须带 `pushUndo`（见 §1）。
- 改完必须跑：`npx tsc -b && npx vitest run`；涉及 UI 的改动在浅色与深色两种主题下都检查一遍。
