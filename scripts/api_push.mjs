// GitHub Git Data API 快照推送：github.com 的 git/HTTPS 通道被 TLS reset 时的兜底
// 把本地 HEAD 的变更（相对远端 main）经 api.github.com 逐文件提交，内容为准（commit sha 不一致是预期的）
// 用法：node scripts/api_push.mjs
import { execFileSync } from 'node:child_process'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

const GIT = 'C:\\Users\\FT\\tools\\mingit\\cmd\\git.exe'
const root = join(import.meta.dirname, '..')
const repo = 'fengtong2001-ui/expermit-eln'
const token = process.env.GITHUB_TOKEN
if (!token) throw new Error('缺 GITHUB_TOKEN 环境变量')
const H = { Authorization: `Bearer ${token}`, Accept: 'application/vnd.github+json', 'X-GitHub-Api-Version': '2022-11-28' }
const api = async (path, opt = {}) => {
  const r = await fetch(`https://api.github.com/repos/${repo}/${path}`, { ...opt, headers: { ...H, ...(opt.body && !(opt.body instanceof Buffer) ? { 'Content-Type': 'application/json' } : {}), ...(opt.headers ?? {}) } })
  const text = await r.text()
  if (!r.ok) throw new Error(`${opt.method ?? 'GET'} ${path} -> ${r.status}: ${text.slice(0, 300)}`)
  return text ? JSON.parse(text) : null
}

const git = (...a) => execFileSync(GIT, a, { cwd: root, encoding: 'utf8' }).trim()

// 远端 main 当前 commit
const remote = await api('commits/main')
console.log(`远端 main: ${remote.sha.slice(0, 7)}`)
const local = git('rev-parse', 'HEAD')
if (remote.sha === local) {
  console.log('远端已是本地 HEAD，无需推送')
  process.exit(0)
}

// 基准 commit：优先远端 sha 本地是否存在；不存在（上次是 API 快照推送）则按 tree 哈希找内容等价的本地 commit
let base = null
try {
  git('cat-file', '-e', remote.sha)
  base = remote.sha
} catch {
  const remoteTree = remote.commit.tree.sha
  const hit = git('log', '--format=%T %H', '-50').split('\n').map((l) => l.split(' ')).find(([t]) => t === remoteTree)
  if (hit) base = hit[1]
}
// 相对基准的变更列表（含删除）；找不到基准则全量上传
const diff = base ? git('diff', '--name-status', `${base}..${local}`) : git('ls-files').split('\n').map((p) => `A\t${p.replace(/\//g, '/')}`).join('\n')
if (!diff) throw new Error('没有变更？')
console.log(`基准 ${base ? base.slice(0, 7) : '(全量)'}，变更 ${diff.split('\n').length} 个文件`)

const baseTree = remote.commit.tree.sha
const tree = []
for (const line of diff.split('\n')) {
  const [st, ...rest] = line.split('\t')
  const p = (st.startsWith('R') ? rest[1] : rest[0]).replaceAll('\\', '/')
  if (st === 'D') {
    tree.push({ path: p, mode: '100644', type: 'blob', sha: null })
    console.log(`D ${p}`)
    continue
  }
  const buf = readFileSync(join(root, p))
  const blob = await api('git/blobs', { method: 'POST', body: JSON.stringify({ content: buf.toString('base64'), encoding: 'base64' }) })
  tree.push({ path: p, mode: '100644', type: 'blob', sha: blob.sha })
  console.log(`${st.startsWith('R') ? 'R' : st} ${p} (${(buf.length / 1024).toFixed(1)} KB)`)
}

const newTree = await api('git/trees', { method: 'POST', body: JSON.stringify({ base_tree: baseTree, tree }) })
const msg = git('log', '-1', '--format=%B')
const commit = await api('git/commits', { method: 'POST', body: JSON.stringify({ message: msg, tree: newTree.sha, parents: [remote.sha] }) })
console.log(`API commit: ${commit.sha}`)
await api('git/refs/heads/main', { method: 'PATCH', body: JSON.stringify({ sha: commit.sha, force: false }) })
console.log('✓ 远端 main 已更新（快照式，sha 与本地不同，内容一致）')
