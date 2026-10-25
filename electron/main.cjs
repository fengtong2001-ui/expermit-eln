// ExPermit for Windows —— Electron 壳：Chromium + 本地资源（app://local/）
// 与 native/mac/main.swift 同契约：--sync '<json>' / --selftest / --www <path>
// 数据（IndexedDB）存在应用自己的 userData 目录，不上传；同步功能由网页自己完成。
'use strict'
const { app, protocol, BrowserWindow, shell, net, Menu } = require('electron')
const path = require('node:path')
const fs = require('node:fs')
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

function resourceRoot() {
  if (wwwArg) return path.resolve(wwwArg)
  // 打包后 dist 经 extraResources 放在 resources/www；开发时直接用项目 dist
  if (app.isPackaged) return path.join(process.resourcesPath, 'www')
  return path.join(__dirname, '..', 'dist')
}

function startApp() {
  const root = resourceRoot()

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
  // 自检独立跑，不与常驻实例抢锁
  app.whenReady().then(startApp)
} else {
  const gotLock = app.requestSingleInstanceLock()
  if (!gotLock) {
    app.quit()
  } else {
    app.on('second-instance', () => {
      if (win) { if (win.isMinimized()) win.restore(); win.show(); win.focus() }
    })
    app.whenReady().then(startApp)
  }
}

app.on('window-all-closed', () => app.quit())
