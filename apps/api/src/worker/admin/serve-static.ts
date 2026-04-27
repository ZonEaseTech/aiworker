import type { Context, MiddlewareHandler } from 'hono'
import { resolve, sep } from 'node:path'

/**
 * worker `/admin/*` 静态资源中间件（PLAN-022 / FEAT-033）。
 *
 * 与 `packages/gateway/src/admin/serve-static.ts` 同形：Bun-native（`Bun.file`），
 * 目录穿越防御 + SPA fallback。两边代码不直接共享是因为 packages/gateway 必须
 * 保持 transport-agnostic（不引 hono），这里则是 hono middleware 形态。
 *
 * 用法（worker 模式）：
 *   const dir = resolveWebStaticDir()
 *   if (dir) {
 *     app.get('/admin', c => c.redirect('/admin/', 308))
 *     app.use('/admin/*', adminStaticMiddleware(dir))
 *   }
 */
export function adminStaticMiddleware(webStaticDir: string): MiddlewareHandler {
  const root = resolve(webStaticDir)
  return async (c: Context) => {
    const url = new URL(c.req.url)
    // 先 decode 一次：在反代可能 decode 之前预先归一，让 `..%2F..%2Fetc` 这类
    // encoded traversal 也走到 resolve()/startsWith 的统一防御层。decode 失败
    // （malformed `%`）直接 403，行为与目录穿越同等保守。
    let cleaned: string
    try {
      cleaned = stripLeadingSlashes(decodeURIComponent(url.pathname.slice('/admin/'.length)))
    }
    catch {
      return c.text('forbidden', 403)
    }
    const relPath = cleaned === '' ? 'index.html' : cleaned
    const target = resolve(root, relPath)

    // 严防 `../../foo` 把请求引出 root 之外。
    if (target !== root && !target.startsWith(root + sep))
      return c.text('forbidden', 403)

    const file = Bun.file(target)
    if (await file.exists())
      return new Response(file)

    // SPA fallback：无扩展名的 URL 视作客户端路由 → index.html。
    if (!hasFileExtension(relPath)) {
      const fallback = Bun.file(resolve(root, 'index.html'))
      if (await fallback.exists())
        return new Response(fallback)
    }
    return c.text('not found', 404)
  }
}

function stripLeadingSlashes(input: string): string {
  let i = 0
  while (i < input.length && input[i] === '/')
    i += 1
  return input.slice(i)
}

function hasFileExtension(relPath: string): boolean {
  const lastSlash = relPath.lastIndexOf('/')
  const tail = lastSlash === -1 ? relPath : relPath.slice(lastSlash + 1)
  return tail.includes('.')
}
