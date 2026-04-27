import { access, copyFile, mkdir, readdir, readFile, writeFile } from 'node:fs/promises'
import { resolve } from 'node:path'

const cliDir = resolve(import.meta.dirname, '..')
const repoRoot = resolve(cliDir, '..', '..')
const distDir = resolve(cliDir, 'dist')

const pkg = JSON.parse(await readFile(resolve(cliDir, 'package.json'), 'utf8'))

const stripped: Record<string, unknown> = {
  name: pkg.name,
  version: pkg.version,
  description: pkg.description,
  license: pkg.license,
  type: pkg.type,
  repository: pkg.repository,
  homepage: pkg.homepage,
  publishConfig: pkg.publishConfig,
  bin: { aiworker: './aiworker.js' },
  // BUG-011/BUG-012: dist 必须含 drizzle/ 子目录（fleet + worker migrations），
  // packages/storage-sqlite 的 resolveMigrationsFolder fallback 会找 sibling drizzle/。
  // PLAN-022 / FEAT-033：dist 还含 web/ 子目录（fleet + worker bundles），
  // gateway / worker `/admin/*` 静态托管在运行期 resolve 同级 web/<bundle>/。
  files: ['aiworker.js', 'README.md', 'drizzle/', 'web/'],
  engines: pkg.engines,
}

await writeFile(resolve(distDir, 'package.json'), `${JSON.stringify(stripped, null, 2)}\n`, 'utf8')

const readmeRoot = resolve(repoRoot, 'README.md')
try {
  await access(readmeRoot)
  await copyFile(readmeRoot, resolve(distDir, 'README.md'))
}
catch {
  await writeFile(resolve(distDir, 'README.md'), `# ${pkg.name}\n\n${pkg.description}\n`, 'utf8')
}

// BUG-011/BUG-012: 把 packages/storage-sqlite/drizzle/{fleet,worker} 拷到 dist/drizzle/
// 让 npm-installed bundle 在运行时能找到 migrations，无需访问仓库源码。
const drizzleSrc = resolve(repoRoot, 'packages/storage-sqlite/drizzle')
const drizzleDst = resolve(distDir, 'drizzle')
await copyDir(drizzleSrc, drizzleDst)

// PLAN-022 / FEAT-033：把 apps/web/dist/{fleet,worker} 拷到 dist/web/，让
// npm-installed cli 在运行时能 serve fleet bundle（gateway 端）和 worker
// bundle（worker 端）。`apps/cli/scripts/build`  在 cli 自身 build 之前会先
// 触发 `bun run --filter '@zonease/aiworker-web' build`（见 cli/package.json
// scripts.build），所以这里 `apps/web/dist/` 一定存在。
const webDistSrc = resolve(repoRoot, 'apps/web/dist')
const webDistDst = resolve(distDir, 'web')
try {
  await access(webDistSrc)
  await copyDir(webDistSrc, webDistDst)
}
catch {
  // 跳过：单测 / `prepublishOnly` 之外的 build 调用可能没先跑 web build。
  // tarball 缺 web/ 时运行期 fallback 到 404，不影响 cli 自身可用。
}

async function copyDir(src: string, dst: string): Promise<void> {
  await mkdir(dst, { recursive: true })
  const entries = await readdir(src, { withFileTypes: true })
  for (const entry of entries) {
    const srcPath = resolve(src, entry.name)
    const dstPath = resolve(dst, entry.name)
    if (entry.isDirectory())
      await copyDir(srcPath, dstPath)
    else if (entry.isFile())
      await copyFile(srcPath, dstPath)
  }
}
