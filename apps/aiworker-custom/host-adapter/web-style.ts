const soulAppStyleHref = '/styles.css'
const soulAppStylePath = new URL('../dist/web/styles.css', import.meta.url)

export function renderSoulAppStyleLink(href = soulAppStyleHref): string {
  return `<link rel="stylesheet" href="${escapeHtmlAttribute(href)}">`
}

export async function serveSoulAppStyle(url: URL): Promise<Response | null> {
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

function escapeHtmlAttribute(value: string): string {
  return value.replaceAll('&', '&amp;').replaceAll('"', '&quot;').replaceAll('<', '&lt;').replaceAll('>', '&gt;')
}
