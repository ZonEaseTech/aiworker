import path from 'node:path'
import process from 'node:process'
import { ESLint } from 'eslint'
import { describe, expect, it } from 'vitest'

const repoRoot = path.resolve(process.cwd(), '../..')
const eslint = new ESLint({ cwd: repoRoot })
const lintGuardTimeoutMs = 30_000

async function lintText(code: string, filePath: string) {
  const [result] = await eslint.lintText(code, { filePath })
  return result?.messages.map(m => m.message) ?? []
}

describe('apps/web view boundary lint rules', () => {
  it('rejects fleet imports from the worker view', async () => {
    const messages = await lintText(
      'import { getGatewayClient } from "@/fleet/lib/gateway-client"\n',
      `${repoRoot}/apps/web/src/worker/__lint_guard__.ts`,
    )

    expect(messages.some(m => m.includes('worker 视角不得引用 fleet 视角'))).toBe(true)
  }, lintGuardTimeoutMs)

  it('rejects worker imports from the fleet view', async () => {
    const messages = await lintText(
      'import { getInfo } from "@/worker/api"\n',
      `${repoRoot}/apps/web/src/fleet/__lint_guard__.ts`,
    )

    expect(messages.some(m => m.includes('fleet 视角不得引用 worker 视角'))).toBe(true)
  }, lintGuardTimeoutMs)

  it('rejects gateway proto imports from the worker view', async () => {
    const messages = await lintText(
      'import { METHODS } from "@zonease/aiworker-gateway-proto"\n',
      `${repoRoot}/apps/web/src/worker/__lint_guard__.ts`,
    )

    expect(messages.some(m => m.includes('worker UI 不得接 gateway WS/proto'))).toBe(true)
  }, lintGuardTimeoutMs)

  it('rejects direct worker REST fetches from the fleet view', async () => {
    const messages = await lintText(
      'async function bad() { return await fetch("/api/worker/config") }\n',
      `${repoRoot}/apps/web/src/fleet/features/__lint_guard__.ts`,
    )

    expect(messages.some(m => m.includes('fleet 视角禁止直接 fetch worker REST'))).toBe(true)
  }, lintGuardTimeoutMs)
})
