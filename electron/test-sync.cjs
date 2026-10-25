// 一次性验证:--sync 配置经 preload 写入 localStorage(preload 需在任何页面脚本前生效)
'use strict'
const { app, protocol, BrowserWindow, Menu, net } = require('electron')
const path = require('node:path')
const fs = require('node:fs')
const { pathToFileURL } = require('node:url')

const SYNC = JSON.stringify({ provider: 'webdav', url: 'http://t', user: 'u', password: 'p', path: '/t', auto: false })

protocol.registerSchemesAsPrivileged([{ scheme: 'app', privileges: { standard: true, secure: true, supportFetchAPI: true, stream: true } }])

app.whenReady().then(() => {
  const root = path.join(__dirname, '..', 'dist')
  protocol.handle('app', async (request) => {
    let rel = decodeURIComponent(new URL(request.url).pathname).replace(/^\/+/, '')
    if (!rel || rel.endsWith('/')) rel += 'index.html'
    const file = path.normalize(path.join(root, rel))
    if (!fs.existsSync(file)) return new Response(null, { status: 404 })
    const ext = path.extname(file).slice(1).toLowerCase()
    const mime = { html: 'text/html', js: 'text/javascript', css: 'text/css', svg: 'image/svg+xml' }[ext] || 'application/octet-stream'
    const r = await net.fetch(pathToFileURL(file).toString())
    return new Response(r.body, { headers: { 'Content-Type': mime } })
  })
  const win = new BrowserWindow({
    show: false,
    webPreferences: { preload: path.join(__dirname, 'preload.cjs'), contextIsolation: true, nodeIntegration: false, additionalArguments: [`--sync-json=${encodeURIComponent(SYNC)}`] },
  })
  Menu.setApplicationMenu(null)
  win.webContents.once('did-finish-load', () => setTimeout(async () => {
    const v = await win.webContents.executeJavaScript('localStorage.getItem("eln-sync-config")')
    console.log(`SYNC_TEST ${v === SYNC ? 'OK' : 'FAIL'} ${v}`)
    app.exit(v === SYNC ? 0 : 2)
  }, 1500))
  win.loadURL('app://local/index.html')
})
