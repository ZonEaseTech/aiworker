import { chmodSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
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
aiworker doctor --help
\`\`\`

- \`plan\` previews a Paseo workspace provisioning plan without changing the target.
- \`apply\` executes the plan through aissh after interactive confirmation; automation uses \`--yes\` / \`--auto-approve\`.
- \`doctor\` runs local diagnostics without contacting a target.

Use \`--json\` on commands that expose machine-readable output. Use \`plan --show-script\` when you need to inspect the generated remote script.
`)
