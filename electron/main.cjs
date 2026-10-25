// ExPermit for Windows —— Electron 壳：Chromium + 本地资源（app://local/）
// 与 native/mac/main.swift 同契约：--sync '<json>' / --selftest / --www <path>
// 数据（IndexedDB）存在应用自己的 userData 目录，不上传；同步功能由网页自己完成。
'use strict'
const { app, protocol, BrowserWindow, shell, net, Menu, ipcMain, dialog } = require('electron')
const path = require('node:path')
const fs = require('node:fs')
const { spawn } = require('node:child_process')
const { pathToFileURL } = require('node:url')

// app:// 需在 ready 前注册为 standard+secure，localStorage / IndexedDB / fetch 才可用
protocol.registerSchemesAsPrivileged([
  { scheme: 'app', privileges: { standard: true, secure: true, supportFetchAPI: true, stream: true } },
])

const MIME = {
  html: 'text/html', js: 'text/javascript', mjs: 'text/javascript', css: 'text/css',
  json: 'application/json', webmanifest: 'application/manifest+json', svg: 'image/svg+xml',
  png: 'image/png', jpg: 'image/jpeg', jpeg: 'image/jpeg', gif: 'image/gif', webp: 'image/webp',
  woff: 'font/woff', woff2: 'font/woff2', ttf: 'font/ttf', ico: 'image/x-icon',
  txt: 'text/plain', map: 'application/json', wasm: 'application/wasm',
}

function argValue(name) {
  const i = process.argv.indexOf(name)
  return i !== -1 && i + 1 < process.argv.length ? process.argv[i + 1] : null
}
const selftest = process.argv.includes('--selftest')
const syncJson = argValue('--sync')
const wwwArg = argValue('--www')

let win = null

// —— 数据存储位置：marker（写在 userData 之外，固定可达）指向自定义目录 ——
// 启动时若自定义目录尚无数据，先把默认 userData 复制过去，再切换；失败则回落默认位置。
const dataMarker = () => path.join(app.getPath('appData'), 'expermit-data-location.json')
function applyCustomDataDir() {
  try {
    if (!fs.existsSync(dataMarker())) return
    const { dir } = JSON.parse(fs.readFileSync(dataMarker(), 'utf8'))
    if (!dir || typeof dir !== 'string') return
    const target = path.resolve(dir)
    const def = app.getPath('userData')
    if (target === path.resolve(def) || !fs.existsSync(path.dirname(target))) return
    if (!fs.existsSync(target)) fs.cpSync(def, target, { recursive: true })
    app.setPath('userData', target)
  } catch {
    /* marker 损坏则继续用默认位置 */
  }
}

function registerIpc() {
  ipcMain.handle('app:info', () => ({ version: app.getVersion(), dataDir: app.getPath('userData') }))

  // 下载新版本安装包（只信 GitHub 域名），流式落盘并回报进度
  ipcMain.handle('update:download', async (event, url) => {
    if (typeof url !== 'string' || !/^https:\/\/(github\.com|objects\.githubusercontent\.com|release-assets\.githubusercontent\.com)\//.test(url)) throw new Error('bad url')
    const res = await net.fetch(url, { redirect: 'follow' })
    if (!res.ok || !res.body) throw new Error(`HTTP ${res.status}`)
    const total = Number(res.headers.get('content-length')) || 0
    const file = path.join(app.getPath('temp'), `ExPermit-Setup-${Date.now()}.exe`)
    const out = fs.createWriteStream(file)
    const reader = res.body.getReader()
    let loaded = 0
    for (;;) {
      const { done, value } = await reader.read()
      if (done) break
      out.write(Buffer.from(value))
      loaded += value.length
      if (total) event.sender.send('update:progress', Math.min(100, Math.round((loaded / total) * 100)))
    }
    await new Promise((resolve, reject) => out.end((err) => (err ? reject(err) : resolve())))
    return file
  })

  // 静默运行安装包升级（仅允许我们下载到 temp 的文件），旧数据不受影响
  ipcMain.handle('update:install', (_e, exePath) => {
    if (typeof exePath !== 'string' || !exePath.startsWith(app.getPath('temp'))) throw new Error('bad path')
    spawn(exePath, ['/S'], { detached: true, stdio: 'ignore' }).unref()
    setTimeout(() => app.quit(), 300)
  })

  // 更改数据存储位置：选目录 → 写 marker → 重启（启动时完成数据迁移）
  ipcMain.handle('data:choose', async () => {
    const r = await dialog.showOpenDialog(win, { properties: ['openDirectory'], title: '选择数据存储位置' })
    if (r.canceled || !r.filePaths[0]) return null
    const dir = r.filePaths[0]
    await fs.promises.writeFile(dataMarker(), JSON.stringify({ dir }, null, 2), 'utf8')
    app.relaunch()
    app.exit(0)
    return dir
  })
}

function resourceRoot() {
  if (wwwArg) return path.resolve(wwwArg)
  // 打包后 dist 经 extraResources 放在 resources/www；开发时直接用项目 dist
  if (app.isPackaged) return path.join(process.resourcesPath, 'www')
  return path.join(__dirname, '..', 'dist')
}

function startApp() {
  const root = resourceRoot()
  registerIpc()

  // 把本地 www/ 目录挂到 app://local/，防目录穿越
  protocol.handle('app', async (request) => {
    let rel
    try {
      rel = decodeURIComponent(new URL(request.url).pathname).replace(/^\/+/, '')
    } catch {
      return new Response(null, { status: 400 })
    }
    if (!rel || rel.endsWith('/')) rel += 'index.html'
    const file = path.normalize(path.join(root, rel))
    const relToRoot = path.relative(root, file)
    if (relToRoot.startsWith('..') || path.isAbsolute(relToRoot)) return new Response(null, { status: 404 })
    if (!fs.existsSync(file)) return new Response(null, { status: 404 })
    const ext = path.extname(file).slice(1).toLowerCase()
    const mime = MIME[ext] || 'application/octet-stream'
    const resp = await net.fetch(pathToFileURL(file).toString())
    return new Response(resp.body, { status: resp.status, headers: { 'Content-Type': mime, 'Cache-Control': 'no-cache' } })
  })

  win = new BrowserWindow({
    width: 1240,
    height: 840,
    minWidth: 960,
    minHeight: 620,
    title: 'ExPermit 实验记录本',
    show: false,
    webPreferences: {
      preload: path.join(__dirname, 'preload.cjs'),
      contextIsolation: true,
      nodeIntegration: false,
      spellcheck: false,
      additionalArguments: syncJson ? [`--sync-json=${encodeURIComponent(syncJson)}`] : [],
    },
  })
  win.setName?.('ExPermit')
  if (!selftest) win.once('ready-to-show', () => win.show()) // 自检静默跑，不弹窗
  Menu.setApplicationMenu(null) // 编辑快捷键（复制/粘贴等）由 Chromium 内建，无需菜单

  // 外链（比如 GitHub 同步说明页）交给系统浏览器；应用内只允许 app://local
  win.webContents.setWindowOpenHandler(({ url }) => {
    if (/^https?:/i.test(url)) void shell.openExternal(url)
    return { action: 'deny' }
  })
  win.webContents.on('will-navigate', (event, url) => {
    if (!url.startsWith('app://')) {
      event.preventDefault()
      if (/^https?:/i.test(url)) void shell.openExternal(url)
    }
  })

  if (selftest) {
    let done = false
    const finish = (ok, detail) => {
      if (done) return
      done = true
      console.log(`SELFTEST ${ok ? 'OK' : 'FAIL'} ${detail}`)
      app.exit(ok ? 0 : 2)
    }
    setTimeout(() => finish(false, 'timeout'), 60_000)
    win.webContents.once('did-finish-load', () => {
      setTimeout(() => {
        const js = `(async function () {
          try {
            var text = document.body.innerText || ''
            var rendered = text.indexOf('进行中的实验') >= 0 || text.indexOf('试剂库') >= 0
            var idb = await new Promise(function (res) {
              try { var req = indexedDB.open('expermit-eln'); req.onsuccess = function () { res(true) }; req.onerror = function () { res(false) } }
              catch (e) { res(false) }
            })
            var github
            try { github = (await fetch('https://api.github.com/rate_limit')).status } catch (e) { github = 'blocked: ' + e.message }
            return { rendered: rendered, indexedDB: idb, github: github, title: document.title }
          } catch (e) { return { error: String(e) } }
        })()`
        win.webContents.executeJavaScript(js, true).then((r) => {
          const ok = r && r.rendered === true && r.indexedDB === true && r.github === 200
          finish(ok, JSON.stringify(r))
        }).catch((e) => finish(false, String(e)))
      }, 2000)
    })
    win.webContents.once('did-fail-load', (_e, code, desc) => finish(false, `nav-error: ${code} ${desc}`))
  }

  win.on('closed', () => { win = null })
  win.loadURL('app://local/index.html')
}

if (selftest) {
  // 自检独立跑，不与常驻实例抢锁；userData 也用一次性目录，避免与已安装实例的数据目录锁冲突
  app.setPath('userData', path.join(app.getPath('temp'), `expermit-selftest-${Date.now()}`))
  app.whenReady().then(startApp)
} else {
  const gotLock = app.requestSingleInstanceLock()
  if (!gotLock) {
    app.quit()
  } else {
    app.on('second-instance', () => {
      if (win) { if (win.isMinimized()) win.restore(); win.show(); win.focus() }
    })
    applyCustomDataDir()
    app.whenReady().then(startApp)
  }
}

app.on('window-all-closed', () => app.quit())
