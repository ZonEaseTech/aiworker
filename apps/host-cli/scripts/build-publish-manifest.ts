import { access, chmod, copyFile, mkdir, readdir, readFile, rm, writeFile } from 'node:fs/promises'
import { resolve } from 'node:path'

const cliDir = resolve(import.meta.dirname, '..')
const repoRoot = resolve(cliDir, '..', '..')
const distDir = resolve(cliDir, 'dist')
const binShimSrc = resolve(cliDir, 'scripts/aiworker-host-bin-shim.sh')
const binShimDst = resolve(distDir, 'aiworker-host.js')

export async function buildPublishManifest(): Promise<void> {
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
    bin: { 'aiworker-host': 'aiworker-host.js' },
    // dist 含 Host Web 生产静态资源，`daemon foreground` 会在运行期托管它们。
    // Host 的 DB 迁移是 runHostMigrations() 内联 DDL（CREATE TABLE IF NOT EXISTS），
    // 随 bundle 一起进单文件，无需独立 drizzle/ 目录（与 worker-cli 不同）。
    // Host 也不携带 official-apps（那是 Soul/Worker 侧资源）。
    files: ['aiworker-host.js', 'aiworker-host-bun.js', 'README.md', 'web/'],
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

  // 把 apps/host-web/dist 拷到 dist/web/host/，让 npm-installed Host daemon 能托管 Host Web。
  // resolveHostWebStaticDir（host-lifecycle.ts）在 bundle 内按 dirname(import.meta.url)=dist
  // 解析 web/host/index.html，因此 dist/web/host/ 是钦定落点。先清目标避免旧 hash chunks 漏入。
  const hostWebSrc = resolve(repoRoot, 'apps/host-web/dist')
  const hostWebDst = resolve(distDir, 'web', 'host')
  await rm(resolve(distDir, 'web'), { recursive: true, force: true })
  await access(resolve(hostWebSrc, 'index.html'))
  await copyDir(hostWebSrc, hostWebDst)
}

export async function copyDir(src: string, dst: string, options: { skip?: (entryName: string, srcPath: string) => boolean } = {}): Promise<void> {
  await mkdir(dst, { recursive: true })
  const entries = await readdir(src, { withFileTypes: true })
  for (const entry of entries) {
    const srcPath = resolve(src, entry.name)
    if (options.skip?.(entry.name, srcPath))
      continue
    const dstPath = resolve(dst, entry.name)
    if (entry.isDirectory())
      await copyDir(srcPath, dstPath, options)
    else if (entry.isFile())
      await copyFile(srcPath, dstPath)
  }
}

if (import.meta.main)
  await buildPublishManifest()
