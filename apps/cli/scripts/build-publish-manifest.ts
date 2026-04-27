import { access, copyFile, mkdir, readFile, readdir, writeFile } from 'node:fs/promises'
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
  files: ['aiworker.js', 'README.md', 'drizzle/'],
  engines: pkg.engines,
}

await writeFile(resolve(distDir, 'package.json'), JSON.stringify(stripped, null, 2) + '\n', 'utf8')

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
