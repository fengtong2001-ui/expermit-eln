// 发布 GitHub Release：创建 v<版本> 并上传 Setup exe（版本源，桌面版自动更新依赖它）
// 用法：node scripts/make_release.mjs（读 package.json version 与 CHANGELOG 对应段落）
import { readFileSync, existsSync } from 'node:fs'
import { basename, join } from 'node:path'

const root = join(import.meta.dirname, '..')
const pkg = JSON.parse(readFileSync(join(root, 'package.json'), 'utf8'))
const ver = pkg.version
const setup = join(root, 'release', `ExPermit-Setup-${ver}.exe`)
if (!existsSync(setup)) throw new Error(`找不到 ${setup}，先跑 npm run dist:win`)

// CHANGELOG 里取本版本段落作为 release body
const changelog = readFileSync(join(root, 'CHANGELOG.md'), 'utf8')
const start = changelog.indexOf(`## ${ver}`)
if (start < 0) throw new Error(`CHANGELOG.md 里没有 ## ${ver} 段落`)
const next = changelog.indexOf('\n## ', start + 1)
const body = changelog.slice(start, next > 0 ? next : undefined).trim()

const token = process.env.GITHUB_TOKEN
if (!token) throw new Error('缺 GITHUB_TOKEN 环境变量')
const repo = 'fengtong2001-ui/expermit-eln'
const H = { Authorization: `Bearer ${token}`, Accept: 'application/vnd.github+json', 'X-GitHub-Api-Version': '2022-11-28' }

// 已存在同 tag 的 release 则复用（重发场景）
const list = await fetch(`https://api.github.com/repos/${repo}/releases/tags/v${ver}`, { headers: H })
let rel
if (list.ok) {
  rel = await list.json()
  console.log(`复用已有 release v${ver}`)
} else {
  const create = await fetch(`https://api.github.com/repos/${repo}/releases`, {
    method: 'POST',
    headers: { ...H, 'Content-Type': 'application/json' },
    body: JSON.stringify({ tag_name: `v${ver}`, name: `v${ver}`, body, target_commitish: 'main' }),
  })
  if (!create.ok) throw new Error(`创建 release 失败: ${create.status} ${await create.text()}`)
  rel = await create.json()
  console.log(`已创建 release v${ver}: ${rel.html_url}`)
}

// 同名 asset 先删再传（幂等）
for (const a of rel.assets ?? []) {
  if (a.name === basename(setup)) {
    await fetch(`https://api.github.com/repos/${repo}/releases/assets/${a.id}`, { method: 'DELETE', headers: H })
    console.log(`已删除旧 asset ${a.name}`)
  }
}

const up = await fetch(`https://uploads.github.com/repos/${repo}/releases/${rel.id}/assets?name=${encodeURIComponent(basename(setup))}`, {
  method: 'POST',
  headers: { ...H, 'Content-Type': 'application/octet-stream' },
  body: readFileSync(setup),
})
if (!up.ok) throw new Error(`上传 asset 失败: ${up.status} ${await up.text()}`)
const asset = await up.json()
console.log(`已上传 ${asset.name} (${(asset.size / 1048576).toFixed(1)} MB)\n下载: ${asset.browser_download_url}`)
