import { chmodSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import path from 'node:path'

interface SourcePackageJson {
  bin?: Record<string, string>
  description?: string
  engines?: Record<string, string>
  homepage?: string
  license?: string
  name: string
  publishConfig?: Record<string, unknown>
  repository?: unknown
  version: string
}

const distDir = path.resolve('dist')
const bundledPath = path.join(distDir, 'aiworker-bun.js')
const bundled = readFileSync(bundledPath)
const sourcePackage = JSON.parse(readFileSync('package.json', 'utf8')) as SourcePackageJson

rmSync(distDir, { force: true, recursive: true })
mkdirSync(distDir, { recursive: true })
writeFileSync(path.join(distDir, 'aiworker-bun.js'), bundled)
writeFileSync(path.join(distDir, 'aiworker.js'), bundled)
chmodSync(path.join(distDir, 'aiworker.js'), 0o755)

writeFileSync(path.join(distDir, 'package.json'), `${JSON.stringify({
  bin: { aiworker: './aiworker.js' },
  description: sourcePackage.description,
  engines: sourcePackage.engines,
  files: ['aiworker.js', 'README.md'],
  homepage: sourcePackage.homepage,
  license: sourcePackage.license ?? 'MIT',
  name: sourcePackage.name,
  publishConfig: sourcePackage.publishConfig,
  repository: sourcePackage.repository,
  type: 'module',
  version: sourcePackage.version,
}, null, 2)}\n`)
writeFileSync(path.join(distDir, 'README.md'), `# AIWorker CLI\n\n${sourcePackage.description ?? 'Thin Paseo workspace distribution layer.'}\n`)
