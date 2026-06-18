import { chmodSync, cpSync, existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import path from 'node:path'

interface SourcePackageJson {
  bin?: Record<string, string>
  description?: string
  engines?: Record<string, string>
  homepage?: string
  license?: string
  name: string
  optionalDependencies?: Record<string, string>
  publishConfig?: Record<string, unknown>
  repository?: unknown
  version: string
}

const packageRoot = path.resolve(import.meta.dirname, '..')
const distDir = path.join(packageRoot, 'dist')
const bundledPath = path.join(distDir, 'aiworker-bun.js')
const bundled = readFileSync(bundledPath)
const sourcePackage = JSON.parse(readFileSync(path.join(packageRoot, 'package.json'), 'utf8')) as SourcePackageJson
const webRoot = path.resolve(packageRoot, '..', 'aiworker-web')
const webServerSource = path.join(webRoot, 'dist-server', 'server.js')
const webStaticSource = path.join(webRoot, 'dist')

if (!existsSync(webServerSource))
  throw new Error(`AIWorker Web server bundle missing: ${webServerSource}. Run bun run build:web-release first.`)
if (!existsSync(path.join(webStaticSource, 'index.html')))
  throw new Error(`AIWorker Web static assets missing: ${webStaticSource}. Run bun run build:web-release first.`)

rmSync(distDir, { force: true, recursive: true })
mkdirSync(distDir, { recursive: true })
writeFileSync(path.join(distDir, 'aiworker-bun.js'), bundled)
writeFileSync(path.join(distDir, 'aiworker.js'), bundled)
chmodSync(path.join(distDir, 'aiworker.js'), 0o755)
mkdirSync(path.join(distDir, 'web'), { recursive: true })
cpSync(webServerSource, path.join(distDir, 'web', 'server.js'))
cpSync(webStaticSource, path.join(distDir, 'web', 'static'), { recursive: true })

writeFileSync(path.join(distDir, 'package.json'), `${JSON.stringify({
  bin: { aiworker: './aiworker.js' },
  description: sourcePackage.description,
  engines: sourcePackage.engines,
  files: ['aiworker.js', 'README.md', 'web/**'],
  homepage: sourcePackage.homepage,
  license: sourcePackage.license ?? 'MIT',
  name: sourcePackage.name,
  optionalDependencies: sourcePackage.optionalDependencies,
  publishConfig: sourcePackage.publishConfig,
  repository: sourcePackage.repository,
  type: 'module',
  version: sourcePackage.version,
}, null, 2)}\n`)
writeFileSync(path.join(distDir, 'README.md'), `# AIWorker CLI

${sourcePackage.description ?? 'Thin Paseo workspace distribution layer.'}

## Commands

\`\`\`bash
aiworker plan --help
aiworker apply --help
aiworker web --help
aiworker doctor --help
\`\`\`

- \`plan\` previews a Paseo workspace provisioning plan without changing the target.
- \`apply\` executes the plan through aissh after interactive confirmation; automation uses \`--yes\` / \`--auto-approve\`.
- \`web\` starts the bundled private AIWorker Web admin console on loopback by default.
- \`doctor\` runs local diagnostics without contacting a target.

Use \`--json\` on commands that expose machine-readable output. Use \`plan --show-script\` when you need to inspect the generated remote script.
`)
