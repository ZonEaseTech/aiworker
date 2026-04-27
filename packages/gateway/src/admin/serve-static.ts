import { resolve, sep } from 'node:path'

/**
 * `/admin/*` 静态资源响应器（PLAN-022 / FEAT-033）。
 *
 * Bun-native：直接 `Bun.file(path)`。三件事：
 * 1. 目录穿越防御：`resolve()` 后断言落在 `webStaticDir` 内部；越界 403。
 * 2. SPA fallback：deep link（不带扩展名的路径）找不到对应文件时回退到
 *    `index.html`，让 client-side router 接管。带扩展名的资源缺失才返 404。
 * 3. `/admin`（无尾斜杠）由调用方处理（永久重定向到 `/admin/`），
 *    确保 HTML 里的相对资源能正确 resolve。
 */
export interface ServeAdminStaticInput {
  /** 已解析的 fleet bundle 根目录绝对路径，例如 `<cli-bin>/web/fleet`。 */
  webStaticDir: string
  /** URL pathname 去掉 `/admin/` 前缀后剩余部分（可空字符串或带子路径）。 */
  pathnameAfterPrefix: string
}

export async function serveAdminStatic(input: ServeAdminStaticInput): Promise<Response> {
  const { webStaticDir } = input
  const root = resolve(webStaticDir)
  // 先 decode 一次：在反代可能 decode 之前预先归一，让 `..%2F..%2Fetc` 这类
  // encoded traversal 也走到 resolve()/startsWith 的统一防御层。decode 失败
  // （malformed `%`）直接 403，行为与目录穿越同等保守。
  let cleaned: string
  try {
    cleaned = stripLeadingSlashes(decodeURIComponent(input.pathnameAfterPrefix))
  }
  catch {
    return new Response('forbidden', { status: 403 })
  }
  const relPath = cleaned === '' ? 'index.html' : cleaned
  const target = resolve(root, relPath)

  // 严防 `../../foo` 把请求引出 root 之外。`target === root` 等价于"请求 root
  // 本身"——只有 cleaned === '' 才会走到这里（前面已经被改写为 index.html）。
  if (target !== root && !target.startsWith(root + sep))
    return new Response('forbidden', { status: 403 })

  const file = Bun.file(target)
  if (await file.exists())
    return new Response(file)

  // SPA fallback：无扩展名的 URL 视作客户端路由 → index.html。
  if (!hasFileExtension(relPath)) {
    const fallback = Bun.file(resolve(root, 'index.html'))
    if (await fallback.exists())
      return new Response(fallback)
  }

  return new Response('not found', { status: 404 })
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
