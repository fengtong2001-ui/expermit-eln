// 打包核心制品，供三个平台仓下载打包：
//   artifacts/www-<ver>.zip    网页产物（dist/ 原样）
//   artifacts/shell-<ver>.zip  Electron 壳（main.cjs + preload.cjs）+ 元信息
// 用法：node scripts/pack-artifacts.mjs [--ver 0.1.4]
import { mkdirSync, readFileSync, readdirSync, rmSync, statSync, writeFileSync } from 'node:fs'
import { join, relative } from 'node:path'
import { zipSync, strToU8 } from 'fflate'

const root = join(import.meta.dirname, '..')
const pkg = JSON.parse(readFileSync(join(root, 'package.json'), 'utf8'))
const verIdx = process.argv.indexOf('--ver')
const ver = verIdx > -1 ? process.argv[verIdx + 1] : pkg.version
const out = join(root, 'artifacts')

function walk(dir) {
  const files = {}
  for (const name of readdirSync(dir)) {
    const p = join(dir, name)
    if (statSync(p).isDirectory()) {
      for (const [k, v] of Object.entries(walk(p))) files[`${name}/${k}`] = v
    } else files[name] = new Uint8Array(readFileSync(p))
  }
  return files
}

if (!statSync(join(root, 'dist', 'index.html'), { throwIfNoEntry: false })) {
  throw new Error('dist/ 不存在，先跑 npm run build')
}
rmSync(out, { recursive: true, force: true })
mkdirSync(out, { recursive: true })

const www = zipSync(walk(join(root, 'dist')), { level: 9 })
writeFileSync(join(out, `www-${ver}.zip`), www)

const shellFiles = {
  'main.cjs': new Uint8Array(readFileSync(join(root, 'electron', 'main.cjs'))),
  'preload.cjs': new Uint8Array(readFileSync(join(root, 'electron', 'preload.cjs'))),
  'shell.json': strToU8(
    JSON.stringify(
      {
        version: ver,
        // 客户端热更新要求：平台包里的 SHELL_CAP 低于核心发布的值时，必须走完整安装包
        shellCap: pkg.shellCap ?? null,
        appId: pkg.build?.appId ?? 'com.fengtong.expermit',
        productName: pkg.build?.productName ?? 'ExPermit 实验记录本',
        electron: pkg.devDependencies?.electron ?? pkg.dependencies?.electron ?? null,
        runtimeDeps: ['fflate'],
      },
      null,
      2,
    ),
  ),
}
writeFileSync(join(out, `shell-${ver}.zip`), zipSync(shellFiles, { level: 9 }))

const kb = (n) => `${(n / 1024).toFixed(0)} KB`
console.log(`✓ artifacts/www-${ver}.zip   ${kb(www.length)}`)
console.log(`✓ artifacts/shell-${ver}.zip ${kb(statSync(join(out, `shell-${ver}.zip`)).size)}`)
console.log(relative(root, out))
