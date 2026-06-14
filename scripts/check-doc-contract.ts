import { readFileSync } from 'node:fs'

const canonical = [
  'docs/architecture.md',
  'docs/protocol.md',
  'docs/runtime.md',
  'docs/soul-authoring.md',
  'docs/testing.md',
]

const joined = canonical.map(path => readFileSync(path, 'utf8')).join('\n')
const required = [
  /AIWorker CLI is now the product core: a thin enterprise distribution layer for Paseo workspaces/i,
  /Paseo owns.*workspace\/runtime\/UI\/session\/provider/i,
  /Soul is now a versioned Paseo workspace template/i,
  /AIWorker no longer has an employee-side runtime/i,
  /daemonEndpoint/i,
  /must not.*provider API keys/i,
]
const forbidden = [
  /AIWorker-owned Worker daemon/i,
  /B\+ structured native bridge/i,
  /POST \/api\/sessions\/:sessionId\/invocations/i,
  /apps\/worker-web/i,
  /packages\/worker-daemon/i,
  /AIWorker Host/i,
  /Host CLI/i,
  /@zonease\/aiworker-host-cli/i,
  /apps\/host-cli/i,
  /packages\/host-control/i,
]

for (const pattern of required) {
  if (!pattern.test(joined))
    throw new Error(`missing required thin-layer doc contract: ${pattern}`)
}
for (const pattern of forbidden) {
  if (pattern.test(joined))
    throw new Error(`forbidden legacy Worker contract remains in canonical docs: ${pattern}`)
}
console.log('docs contract ok: AIWorker is a thin Paseo distribution layer')
