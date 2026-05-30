import type { Context } from 'hono'
import { readFile, stat } from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

export async function serveWorkerWeb(c: Context, webStaticDir?: string): Promise<Response> {
  const indexPath = safeStaticPath(resolveWorkerWebStaticDir(webStaticDir), 'index.html')
  try {
    return new Response(await readFile(indexPath), {
      headers: { 'content-type': 'text/html; charset=utf-8' },
    })
  }
  catch {
    return c.text('Worker Web build not found. Run `bun run --filter \'@zonease/aiworker-web\' build` first.', 404)
  }
}

export async function serveWorkerWebAsset(c: Context, webStaticDir: string | undefined, relativePath: string): Promise<Response> {
  const root = resolveWorkerWebStaticDir(webStaticDir)
  const filePath = safeStaticPath(root, relativePath)
  try {
    const info = await stat(filePath)
    if (!info.isFile())
      return c.text('Not found', 404)
    return new Response(await readFile(filePath), {
      headers: { 'content-type': contentTypeFor(filePath) },
    })
  }
  catch {
    return c.text('Not found', 404)
  }
}

function resolveWorkerWebStaticDir(explicitDir?: string): string {
  if (explicitDir)
    return path.resolve(explicitDir)

  const moduleDir = path.dirname(fileURLToPath(import.meta.url))
  return path.resolve(moduleDir, '../../../../web/dist/worker')
}

function safeStaticPath(root: string, relativePath: string): string {
  const resolvedRoot = path.resolve(root)
  const target = path.resolve(resolvedRoot, relativePath)
  if (target !== resolvedRoot && !target.startsWith(`${resolvedRoot}${path.sep}`))
    throw new Error(`Static path escapes Worker Web root: ${relativePath}`)
  return target
}

function contentTypeFor(filePath: string): string {
  const ext = path.extname(filePath)
  if (ext === '.css')
    return 'text/css; charset=utf-8'
  if (ext === '.js')
    return 'text/javascript; charset=utf-8'
  if (ext === '.json' || ext === '.map')
    return 'application/json; charset=utf-8'
  if (ext === '.svg')
    return 'image/svg+xml'
  if (ext === '.png')
    return 'image/png'
  if (ext === '.jpg' || ext === '.jpeg')
    return 'image/jpeg'
  if (ext === '.webp')
    return 'image/webp'
  if (ext === '.woff2')
    return 'font/woff2'
  return 'application/octet-stream'
}
