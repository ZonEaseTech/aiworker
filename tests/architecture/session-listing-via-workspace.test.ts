/**
 * #5 不変量守卫：worker 次元の session 列挙は workspace 推導を経由する
 *
 * worker-scoped session 列挙は「listWorkspaces(workerId) → listSessions(workspaceId)」
 * の 2 段推導を経由しなければならない。
 * listSessions が workerId パラメーターを直接受け取るショートカットを追加した場合、
 * このテストが失敗する。
 *
 * 守卫范围：
 * - listSessions のシグネチャは workspaceId のみ受け取る（workerId パラメーターなし）
 * - listSessions の本体は sessions.workspaceId でフィルタリングする（sessions.workerId でない）
 * - worker-scoped な session 列挙関数（sessionsForWorker / listSessionsByWorker 等）が
 *   storage-sqlite worker index から直接 export されていない
 */

import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, test } from 'bun:test'

const repoRoot = join(import.meta.dir, '..', '..')

function readRepoFile(path: string): string {
  return readFileSync(join(repoRoot, path), 'utf8')
}

const storageIndexSrc = readRepoFile('packages/storage-sqlite/src/worker/index.ts')

describe('session listing invariant: worker-dimension sessions are derived via workspace (#5)', () => {
  test('listSessions signature accepts workspaceId only — no workerId parameter', () => {
    // listSessions のシグネチャ行を抽出
    const sigMatch = storageIndexSrc.match(/export function listSessions\([^)]+\)/)
    expect(sigMatch, 'listSessions must be exported from storage-sqlite worker index').not.toBeNull()
    const sig = sigMatch![0]

    // workspaceId パラメーターが存在する
    expect(sig, 'listSessions must accept a workspaceId parameter').toContain('workspaceId')

    // workerId パラメーターが存在しない
    expect(sig, 'listSessions must NOT accept a workerId parameter — worker-dimension listing must go through workspace derivation').not.toContain('workerId')
  })

  test('listSessions body filters by sessions.workspaceId — not by sessions.workerId', () => {
    // listSessions 関数本体を抽出（関数シグネチャから次の export function まで）
    const funcStart = storageIndexSrc.indexOf('export function listSessions(')
    expect(funcStart, 'listSessions function must exist').toBeGreaterThanOrEqual(0)
    const funcEnd = storageIndexSrc.indexOf('\nexport function ', funcStart + 1)
    const funcBody = funcEnd > funcStart
      ? storageIndexSrc.slice(funcStart, funcEnd)
      : storageIndexSrc.slice(funcStart)

    // sessions.workspaceId でフィルタリングしている
    expect(funcBody, 'listSessions must filter by sessions.workspaceId').toContain('sessions.workspaceId')

    // sessions.workerId でフィルタリングしていない
    expect(funcBody, 'listSessions must NOT filter by sessions.workerId — use listWorkspaces(workerId) then listSessions(workspaceId)').not.toContain('sessions.workerId')
  })

  test('no direct worker-scoped session listing bypass is exported from storage-sqlite', () => {
    // worker ID を直接受け取って session を返す専用関数が export されていない
    const workerDirectSessionExports = [
      'export function sessionsForWorker',
      'export function listSessionsByWorker',
      'export function getSessionsByWorker',
      'export function listWorkerSessions',
    ]
    for (const pattern of workerDirectSessionExports) {
      expect(
        storageIndexSrc,
        `storage-sqlite must not export a direct worker-scoped session listing function (found: "${pattern}") — derive via listWorkspaces(workerId) first`,
      ).not.toContain(pattern)
    }
  })
})
