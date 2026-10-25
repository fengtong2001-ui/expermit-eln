// Preload 在页面任何脚本之前执行（等价 macOS 的 atDocumentStart 注入）
// --sync '<json>'：把同步配置写进本应用 userData 对应 origin 的 localStorage
// 用 --sync-json=<encodeURIComponent(json)> 单参数传递，避免被 Electron 追加的内部开关（/prefetch 等）干扰
'use strict'
const PREFIX = '--sync-json='
const arg = process.argv.find((a) => typeof a === 'string' && a.startsWith(PREFIX))
if (arg) {
  try { localStorage.setItem('eln-sync-config', decodeURIComponent(arg.slice(PREFIX.length))) } catch {}
}
