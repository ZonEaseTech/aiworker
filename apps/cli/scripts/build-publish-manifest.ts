import { access, chmod, copyFile, mkdir, readdir, readFile, rm, writeFile } from 'node:fs/promises'
import { resolve } from 'node:path'

const cliDir = resolve(import.meta.dirname, '..')
const repoRoot = resolve(cliDir, '..', '..')
const distDir = resolve(cliDir, 'dist')
const binShimSrc = resolve(cliDir, 'scripts/aiworker-bin-shim.sh')
const binShimDst = resolve(distDir, 'aiworker.js')

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
  // dist 必须含 worker drizzle migrations，storage 的 bundle fallback 会找 sibling drizzle/。
  // dist 还含 Worker Web 静态资源，local daemon 会在运行期托管它。
  files: ['aiworker.js', 'aiworker-bun.js', 'README.md', 'drizzle/', 'web/'],
  engines: pkg.engines,
}

await copyFile(binShimSrc, binShimDst)
await chmod(binShimDst, 0o755)

await writeFile(resolve(distDir, 'package.json'), `${JSON.stringify(stripped, null, 2)}\n`, 'utf8')

const readmeRoot = resolve(repoRoot, 'README.md')
try {
  await access(readmeRoot)
  await copyFile(readmeRoot, resolve(distDir, 'README.md'))
}
catch {
  await writeFile(resolve(distDir, 'README.md'), `# ${pkg.name}\n\n${pkg.description}\n`, 'utf8')
}

// 把 packages/storage-sqlite/drizzle/worker 拷到 dist/drizzle/，让
// npm-installed bundle 在运行时能找到 migrations，无需访问仓库源码。
const drizzleSrc = resolve(repoRoot, 'packages/storage-sqlite/drizzle')
const drizzleDst = resolve(distDir, 'drizzle')
await copyDir(drizzleSrc, drizzleDst)

// 把 apps/web/dist/worker 拷到 dist/web/，让 npm-installed CLI 能通过
// local daemon 托管 Worker Web。只复制生产 bundle，避免旧 hash chunks
// 从 apps/web/dist 根目录漏进发布包。
const webDistSrc = resolve(repoRoot, 'apps/web/dist')
const webDistDst = resolve(distDir, 'web')
await rm(webDistDst, { recursive: true, force: true })
const workerWebSrc = resolve(webDistSrc, 'worker')
await access(resolve(workerWebSrc, 'index.html'))
await copyDir(workerWebSrc, resolve(webDistDst, 'worker'))

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
