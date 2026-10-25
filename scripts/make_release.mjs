// 发版一条龙：
// 1) 把构建好的 dist 打包为 release-assets/www-<版本>.zip 提交进仓库并推送（客户端热更新从 codeload zipball 拉取）
// 2) 创建 GitHub Release v<版本> 并上传 Setup exe（完整安装包，壳变更时才需要）
// 用法：node scripts/make_release.mjs（需 GITHUB_TOKEN；先跑 npm run build && npm run dist:win）
import { execFileSync } from 'node:child_process'
import { existsSync, mkdirSync, readFileSync, readdirSync, rmSync, statSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { zipSync, strToU8 } from 'fflate'

const GIT = 'C:\\Users\\FT\\tools\\mingit\\cmd\\git.exe'
const root = join(import.meta.dirname, '..')
const pkg = JSON.parse(readFileSync(join(root, 'package.json'), 'utf8'))
const ver = pkg.version
const setup = join(root, 'release', `ExPermit-Setup-${ver}.exe`)
if (!existsSync(join(root, 'dist', 'index.html'))) throw new Error('dist/ 不存在，先跑 npm run build')
if (!existsSync(setup)) throw new Error(`找不到 ${setup}，先跑 npm run dist:win`)

const token = process.env.GITHUB_TOKEN
if (!token) throw new Error('缺 GITHUB_TOKEN 环境变量')
const repo = 'fengtong2001-ui/expermit-eln'
const H = { Authorization: `Bearer ${token}`, Accept: 'application/vnd.github+json', 'X-GitHub-Api-Version': '2022-11-28' }
const api = async (path, opt = {}) => {
  const r = await fetch(`https://api.github.com/repos/${repo}/${path}`, { ...opt, headers: { ...H, ...(opt.body && !(opt.body instanceof Buffer) ? { 'Content-Type': 'application/json' } : {}), ...(opt.headers ?? {}) } })
  const text = await r.text()
  if (!r.ok) throw new Error(`${opt.method ?? 'GET'} ${path} -> ${r.status}: ${text.slice(0, 300)}`)
  return text ? JSON.parse(text) : null
}
const git = (...a) => execFileSync(GIT, a, { cwd: root, encoding: 'utf8' }).trim()

// —— 1. 热更新资源包：dist → release-assets/www-<ver>.zip，提交并推送 ——
function walk(dir, base = '') {
  const out = {}
  for (const name of readdirSync(dir)) {
    const p = join(dir, name)
    const rel = base ? `${base}/${name}` : name
    if (statSync(p).isDirectory()) Object.assign(out, walk(p, rel))
    else out[rel] = readFileSync(p)
  }
  return out
}
const assetsDir = join(root, 'release-assets')
mkdirSync(assetsDir, { recursive: true })
for (const f of readdirSync(assetsDir)) if (f.startsWith(`www-`) && f !== `www-${ver}.zip`) rmSync(join(assetsDir, f)) // 只保留当前版本，防止仓库膨胀
const wwwZip = zipSync(walk(join(root, 'dist')))
writeFileSync(join(assetsDir, `www-${ver}.zip`), wwwZip)
writeFileSync(join(assetsDir, 'shell-min.json'), strToU8(JSON.stringify({ shellFrom: '0' }, null, 2)))
git('add', 'release-assets')
try {
  git('commit', '-m', `release-assets: v${ver} 热更新资源包`)
} catch {
  console.log('资源包无变化（同版本重发）')
}
console.log(`资源包 www-${ver}.zip ${(wwwZip.length / 1024).toFixed(0)} KB 已提交，推送到远端…`)
execFileSync(process.execPath, [join(root, 'scripts', 'api_push.mjs')], { cwd: root, stdio: 'inherit', env: process.env })

// —— 2. GitHub Release + 完整安装包 ——
const changelog = readFileSync(join(root, 'CHANGELOG.md'), 'utf8')
const start = changelog.indexOf(`## ${ver}`)
if (start < 0) throw new Error(`CHANGELOG.md 里没有 ## ${ver} 段落`)
const next = changelog.indexOf('\n## ', start + 1)
const body = changelog.slice(start, next > 0 ? next : undefined).trim()

const list = await api('releases/tags/v' + ver)
let rel
if (list) {
  rel = list
  console.log(`复用已有 release v${ver}`)
} else {
  rel = await api('releases', { method: 'POST', body: JSON.stringify({ tag_name: `v${ver}`, name: `v${ver}`, body, target_commitish: 'main' }) })
  console.log(`已创建 release v${ver}: ${rel.html_url}`)
}
for (const a of rel.assets ?? []) {
  if (a.name === `ExPermit-Setup-${ver}.exe`) {
    await api(`releases/assets/${a.id}`, { method: 'DELETE' })
    console.log('已删除旧 asset')
  }
}
console.log('上传完整安装包（约 121MB，几分钟；失败可改用 PowerShell Invoke-RestMethod -InFile）…')
const up = await fetch(`https://uploads.github.com/repos/${repo}/releases/${rel.id}/assets?name=${encodeURIComponent(`ExPermit-Setup-${ver}.exe`)}`, {
  method: 'POST',
  headers: { ...H, 'Content-Type': 'application/octet-stream' },
  body: readFileSync(setup),
})
if (!up.ok) throw new Error(`上传 asset 失败: ${up.status} ${(await up.text()).slice(0, 200)}`)
const asset = await up.json()
console.log(`已上传 ${asset.name} (${(asset.size / 1048576).toFixed(1)} MB)\n下载: ${asset.browser_download_url}`)
