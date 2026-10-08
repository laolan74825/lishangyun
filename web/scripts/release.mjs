#!/usr/bin/env node
/**
 * 发版脚本：递增版本号 + 在 CHANGELOG 生成新条目骨架。
 *
 * 用法（在 web/ 目录下执行）：
 *   npm run release        # 递增 minor（0.2.0 → 0.3.0），功能发布
 *   npm run release:patch  # 递增 patch（0.2.0 → 0.2.1），线上热修复
 *
 * 执行后会：
 *   1. 更新 package.json 的 version 字段（唯一出处）
 *   2. 在仓库根 CHANGELOG.md 的引言之后插入 `## [新版本] - 今天` 条目骨架
 * 接着只需填写条目内容、git commit 即可（脚本不做提交）。
 */
import { readFileSync, writeFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

const webRoot = join(dirname(fileURLToPath(import.meta.url)), '..')
const pkgPath = join(webRoot, 'package.json')
const changelogPath = join(webRoot, '..', 'CHANGELOG.md')

const kind = process.argv[2] === 'patch' ? 'patch' : 'minor'

const pkg = JSON.parse(readFileSync(pkgPath, 'utf8'))
const [major, minor, patch] = pkg.version.split('.').map(Number)
const next =
  kind === 'patch'
    ? `${major}.${minor}.${patch + 1}`
    : `${major}.${minor + 1}.0`

pkg.version = next
writeFileSync(pkgPath, JSON.stringify(pkg, null, 2) + '\n', 'utf8')

const today = new Date().toLocaleDateString('sv-SE') // YYYY-MM-DD（本地时区）
const skeleton = `## [${next}] - ${today}

### 修复（Bug 修复）

- 待填写

### 优化（功能与体验）

- 待填写

### 样式（界面调整）

- 待填写（无界面改动可删除本节）

### 文档

- 待填写（无文档更新可删除本节）

### 测试

- 后端 N 条全部通过，前端 N 条全部通过，TypeScript 类型检查通过

`

const changelog = readFileSync(changelogPath, 'utf8')
// 插到引言之后、第一条已有条目之前（第一个 "## [" 之前）
const anchor = changelog.search(/^## \[/m)
if (anchor === -1) {
  console.error('CHANGELOG.md 中未找到条目锚点（## [x.y.z]），请人工检查')
  process.exit(1)
}
writeFileSync(changelogPath, changelog.slice(0, anchor) + skeleton + changelog.slice(anchor), 'utf8')

console.log(`已发布准备：${pkg.name} ${pkg.version}（${kind === 'patch' ? '热修复 patch' : '功能发布 minor'}）`)
console.log('CHANGELOG.md 已插入新条目骨架，请填写内容后提交：')
console.log(`  git add ../CHANGELOG.md package.json && git commit -m "release: v${next}"`)
