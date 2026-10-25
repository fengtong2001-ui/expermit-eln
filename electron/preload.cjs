// Preload 在页面任何脚本之前执行（等价 macOS 的 atDocumentStart 注入）
'use strict'
const { contextBridge, ipcRenderer } = require('electron')

// --sync '<json>'：把同步配置写进本应用 userData 对应 origin 的 localStorage
// 用 --sync-json=<encodeURIComponent(json)> 单参数传递，避免被 Electron 追加的内部开关（/prefetch 等）干扰
const PREFIX = '--sync-json='
const arg = process.argv.find((a) => typeof a === 'string' && a.startsWith(PREFIX))
if (arg) {
  try { localStorage.setItem('eln-sync-config', decodeURIComponent(arg.slice(PREFIX.length))) } catch {}
}

// 桌面能力（网页侧通过 window.expermitDesktop 使用；网页版为 undefined）
contextBridge.exposeInMainWorld('expermitDesktop', {
  getInfo: () => ipcRenderer.invoke('app:info'),
  downloadUpdate: (url) => ipcRenderer.invoke('update:download', url),
  installUpdate: (exePath) => ipcRenderer.invoke('update:install', exePath),
  hotUpdate: (ver) => ipcRenderer.invoke('update:hot', ver),
  pickDataDir: () => ipcRenderer.invoke('data:pick-dir'),
  applyDataDir: (dir, deleteOld) => ipcRenderer.invoke('data:apply-dir', dir, deleteOld),
  onUpdateProgress: (cb) => {
    const listener = (_e, pct) => cb(pct)
    ipcRenderer.on('update:progress', listener)
    return () => ipcRenderer.removeListener('update:progress', listener)
  },
})
