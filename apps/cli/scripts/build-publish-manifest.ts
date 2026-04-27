import { readFile, writeFile, copyFile, access } from 'node:fs/promises'
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
  files: ['aiworker.js', 'README.md'],
  engines: pkg.engines,
}

await writeFile(resolve(distDir, 'package.json'), JSON.stringify(stripped, null, 2) + '\n', 'utf8')

const readmeRoot = resolve(repoRoot, 'README.md')
try {
  await access(readmeRoot)
  await copyFile(readmeRoot, resolve(distDir, 'README.md'))
} catch {
  await writeFile(resolve(distDir, 'README.md'), `# ${pkg.name}\n\n${pkg.description}\n`, 'utf8')
}
