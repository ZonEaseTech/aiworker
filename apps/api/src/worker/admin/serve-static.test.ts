/**
 * `adminStaticMiddleware` 单测：与 `packages/gateway/src/admin/serve-static`
 * 同套语义（目录穿越防御 / SPA fallback / index.html 默认），但走 Hono context。
 */
import { mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'bun:test'
import { Hono } from 'hono'
import { adminStaticMiddleware } from './serve-static'

let dir: string

function buildApp(staticDir: string): Hono {
  const app = new Hono()
  app.get('/admin', c => c.redirect('/admin/', 308))
  app.use('/admin/*', adminStaticMiddleware(staticDir))
  return app
}

beforeEach(async () => {
  dir = await mkdtemp(join(tmpdir(), 'worker-admin-static-'))
  await writeFile(join(dir, 'index.html'), '<html>hello worker</html>', 'utf8')
  await writeFile(join(dir, 'app.js'), 'console.log(1)', 'utf8')
})

afterEach(async () => {
  await rm(dir, { recursive: true, force: true })
})

describe('adminStaticMiddleware', () => {
  it('serves index.html when path is /admin/', async () => {
    const res = await buildApp(dir).request('/admin/')
    expect(res.status).toBe(200)
    expect(await res.text()).toBe('<html>hello worker</html>')
  })

  it('serves an asset', async () => {
    const res = await buildApp(dir).request('/admin/app.js')
    expect(res.status).toBe(200)
    expect(await res.text()).toBe('console.log(1)')
  })

  it('redirects /admin → /admin/ (308)', async () => {
    const res = await buildApp(dir).request('/admin')
    expect(res.status).toBe(308)
    expect(res.headers.get('location')).toBe('/admin/')
  })

  it('falls back to index.html for SPA-style deep links', async () => {
    const res = await buildApp(dir).request('/admin/workers/abc')
    expect(res.status).toBe(200)
    expect(await res.text()).toBe('<html>hello worker</html>')
  })

  it('returns 404 for missing assets', async () => {
    const res = await buildApp(dir).request('/admin/missing.js')
    expect(res.status).toBe(404)
  })

  it('decodes URL-encoded traversal at the middleware layer (P1-1 加固)', async () => {
    // 中间件先 decodeURIComponent，所以 `..%2F..%2Fetc%2Fpasswd` decode 后真去
    // 上溯 root 之外 → 403（不是 404）。
    const res = await buildApp(dir).request('/admin/..%2F..%2Fetc%2Fpasswd')
    expect(res.status).toBe(403)
  })

  it('does not leak files outside root via `..` traversal attempts', async () => {
    // 双层防御：
    // 1. 浏览器 / `new URL()` 在到达 middleware 前已 normalize 掉 raw `..`
    //    （`/admin/../../etc/passwd` → `/etc/passwd`，路由不匹配 → 404）。
    // 2. URL-encoded `..%2F` 不被 normalize，但 `resolve()` 把它当成字面文件名
    //    （不会逃出 root），文件不存在 → 404。
    // middleware 内的 `target.startsWith(root + sep)` 防御层是兜底——HTTP 入
    // 口侧不必要触发，但保留以防有调用方绕过 URL 解析。
    const res1 = await buildApp(dir).request('/admin/../../../etc/passwd')
    expect(res1.status).toBe(404)
    // URL-encoded 形态被 P1-1 加固后由 middleware 主动 decode → 403（见上一条）。
  })
})
