/**
 * `serveAdminStatic` 单测：覆盖 happy path、目录穿越防御、SPA fallback 三件事。
 * 用 `tmpdir` 起一份临时 fleet bundle，验证响应内容与状态码。
 */
import { mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'bun:test'
import { serveAdminStatic } from '../src/admin/serve-static'

let dir: string

beforeEach(async () => {
  dir = await mkdtemp(join(tmpdir(), 'admin-static-'))
  await writeFile(join(dir, 'index.html'), '<html>hello fleet</html>', 'utf8')
  await writeFile(join(dir, 'app.js'), 'console.log(1)', 'utf8')
})

afterEach(async () => {
  await rm(dir, { recursive: true, force: true })
})

describe('serveAdminStatic', () => {
  it('serves index.html for empty path', async () => {
    const res = await serveAdminStatic({ webStaticDir: dir, pathnameAfterPrefix: '' })
    expect(res.status).toBe(200)
    expect(await res.text()).toBe('<html>hello fleet</html>')
  })

  it('serves an asset by relative path', async () => {
    const res = await serveAdminStatic({ webStaticDir: dir, pathnameAfterPrefix: 'app.js' })
    expect(res.status).toBe(200)
    expect(await res.text()).toBe('console.log(1)')
  })

  it('falls back to index.html for SPA-style deep links (no extension)', async () => {
    const res = await serveAdminStatic({
      webStaticDir: dir,
      pathnameAfterPrefix: 'workers/abc',
    })
    expect(res.status).toBe(200)
    expect(await res.text()).toBe('<html>hello fleet</html>')
  })

  it('returns 404 for missing assets that look like real files', async () => {
    const res = await serveAdminStatic({
      webStaticDir: dir,
      pathnameAfterPrefix: 'missing.js',
    })
    expect(res.status).toBe(404)
  })

  it('refuses directory-traversal attempts with 403', async () => {
    const res = await serveAdminStatic({
      webStaticDir: dir,
      pathnameAfterPrefix: '../../../etc/passwd',
    })
    expect(res.status).toBe(403)
  })

  it('strips multiple leading slashes safely', async () => {
    const res = await serveAdminStatic({
      webStaticDir: dir,
      pathnameAfterPrefix: '///app.js',
    })
    expect(res.status).toBe(200)
    expect(await res.text()).toBe('console.log(1)')
  })

  it('decodes URL-encoded traversal and refuses with 403', async () => {
    // `..%2F..%2Fetc%2Fpasswd` decode 后 → `../../etc/passwd`，resolve 真到 root
    // 之外 → 403。这是 P1-1 加固后的关键回归测试。
    const res = await serveAdminStatic({
      webStaticDir: dir,
      pathnameAfterPrefix: '..%2F..%2Fetc%2Fpasswd',
    })
    expect(res.status).toBe(403)
  })

  it('refuses malformed `%` percent escapes with 403', async () => {
    const res = await serveAdminStatic({
      webStaticDir: dir,
      pathnameAfterPrefix: '%E0%A4%A',
    })
    expect(res.status).toBe(403)
  })
})
