import { access, chmod, copyFile, mkdir, readdir, readFile, rm, writeFile } from 'node:fs/promises'
import { resolve } from 'node:path'

import { OFFICIAL_SOUL_APPS } from '@zonease/aiworker-core'

const cliDir = resolve(import.meta.dirname, '..')
const repoRoot = resolve(cliDir, '..', '..')
const distDir = resolve(cliDir, 'dist')
const binShimSrc = resolve(cliDir, 'scripts/aiworker-bin-shim.sh')
const binShimDst = resolve(distDir, 'aiworker.js')

const officialApps = OFFICIAL_SOUL_APPS.map(app => app.id)
const officialAppsDst = resolve(distDir, 'official-apps')
const publishedMountedEntrypoint = 'dist/mounted/host-mounted.js'
const publishedStandaloneEntrypoint = 'dist/standalone/standalone.js'

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
    bin: { aiworker: 'aiworker.js' },
    // dist 必须含 worker drizzle migrations，storage 的 bundle fallback 会找 sibling drizzle/。
    // dist 还含 Worker Web 静态资源和官方 Soul App 发布资源，local daemon 会在运行期托管或安装它们。
    files: ['aiworker.js', 'aiworker-bun.js', 'README.md', 'drizzle/', 'web/', 'official-apps/'],
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

  // 把官方维护的 Soul App 发布资源拷到 dist/official-apps/，让 npm-installed
  // CLI 能通过正常 manifest registry 安装/启用它们，无需访问源码仓库路径。
  await rm(officialAppsDst, { recursive: true, force: true })
  for (const appId of officialApps)
    await copyOfficialApp(appId)
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

export async function copyOfficialApp(appId: string, options: { appsRoot?: string, officialAppsRoot?: string } = {}): Promise<void> {
  const appSrc = resolve(options.appsRoot ?? resolve(repoRoot, 'apps'), appId)
  const appDst = resolve(options.officialAppsRoot ?? officialAppsDst, appId)
  await copyDir(appSrc, appDst, { skip: shouldSkipOfficialAppResource })
  await patchOfficialAppManifest(resolve(appDst, 'soul-app.manifest.json'))
  await access(resolve(appDst, publishedMountedEntrypoint))
  await access(resolve(appDst, publishedStandaloneEntrypoint))
}

export function shouldSkipOfficialAppResource(entryName: string, srcPath = ''): boolean {
  const normalizedSrcPath = srcPath.replaceAll('\\', '/')
  return entryName === 'node_modules'
    || entryName.endsWith('.spec.ts')
    || entryName.endsWith('.spec.tsx')
    || entryName.endsWith('.test.ts')
    || entryName.endsWith('.test.tsx')
    || normalizedSrcPath.endsWith('/dist/host-mounted.js')
    || normalizedSrcPath.endsWith('/dist/standalone.js')
}

export async function patchOfficialAppManifest(manifestPath: string): Promise<void> {
  const manifest = JSON.parse(await readFile(manifestPath, 'utf8')) as {
    api?: { localService?: { command?: string[] } }
    modes?: {
      hostMounted?: { entry?: string }
      standalone?: { entry?: string }
    }
  }
  if (manifest.api?.localService)
    manifest.api.localService.command = ['bun', publishedMountedEntrypoint]
  if (manifest.modes?.hostMounted)
    manifest.modes.hostMounted.entry = `./${publishedMountedEntrypoint}`
  if (manifest.modes?.standalone)
    manifest.modes.standalone.entry = `./${publishedStandaloneEntrypoint}`
  await writeFile(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`, 'utf8')
}

if (import.meta.main)
  await buildPublishManifest()
