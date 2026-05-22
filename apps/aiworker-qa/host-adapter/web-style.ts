const soulAppStyleHref = '/styles.css'
const soulAppStylePath = new URL('../dist/web/styles.css', import.meta.url)
const soulAppFontPathPrefix = '/files/'
const soulAppFontFileNames = new Set([
  'oxanium-latin-ext-wght-normal.woff2',
  'oxanium-latin-wght-normal.woff2',
])

export function renderSoulAppStyleLink(href = soulAppStyleHref): string {
  return `<link rel="stylesheet" href="${escapeHtmlAttribute(href)}">`
}

export async function serveSoulAppStyle(url: URL): Promise<Response | null> {
  if (url.pathname.startsWith(soulAppFontPathPrefix))
    return serveSoulAppFont(url)

  if (url.pathname !== soulAppStyleHref)
    return null

  const file = Bun.file(soulAppStylePath)
  if (!(await file.exists())) {
    return new Response('Soul App stylesheet has not been built. Run bun run build:styles.', {
      headers: { 'content-type': 'text/plain; charset=utf-8' },
      status: 503,
    })
  }

  return new Response(file, {
    headers: {
      'cache-control': 'no-store',
      'content-type': 'text/css; charset=utf-8',
    },
  })
}

async function serveSoulAppFont(url: URL): Promise<Response | null> {
  const fontFileName = url.pathname.slice(soulAppFontPathPrefix.length)
  if (!soulAppFontFileNames.has(fontFileName))
    return null

  const file = Bun.file(new URL(`../node_modules/@zonease/aiworker-ui/node_modules/@fontsource-variable/oxanium/files/${fontFileName}`, import.meta.url))
  if (!(await file.exists()))
    return new Response('Soul App font asset is missing.', { status: 404 })

  return new Response(file, {
    headers: {
      'cache-control': 'public, max-age=31536000, immutable',
      'content-type': 'font/woff2',
    },
  })
}

function escapeHtmlAttribute(value: string): string {
  return value.replaceAll('&', '&amp;').replaceAll('"', '&quot;').replaceAll('<', '&lt;').replaceAll('>', '&gt;')
}
