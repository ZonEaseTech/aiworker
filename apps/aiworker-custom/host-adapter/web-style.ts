const soulAppStyleHref = '/styles.css'
const soulAppStylePaths = [
  new URL('../web/styles.css', import.meta.url),
  new URL('../dist/web/styles.css', import.meta.url),
]
const soulAppAssetPathPrefix = '/assets/'
const soulAppClientAssets = new Map([
  ['universal-workbench-client.js', {
    contentType: 'text/javascript; charset=utf-8',
    paths: [
      new URL('../web/universal-workbench-client.js', import.meta.url),
      new URL('../dist/web/universal-workbench-client.js', import.meta.url),
    ],
  }],
])

export function renderSoulAppStyleLink(href = soulAppStyleHref): string {
  return `<link rel="stylesheet" href="${escapeHtmlAttribute(href)}">`
}

export async function serveSoulAppWebAsset(url: URL): Promise<Response | null> {
  const styleResponse = await serveSoulAppStyle(url)
  if (styleResponse)
    return styleResponse

  if (!url.pathname.startsWith(soulAppAssetPathPrefix))
    return null

  const assetName = url.pathname.slice(soulAppAssetPathPrefix.length)
  const asset = soulAppClientAssets.get(assetName)
  if (!asset)
    return null

  const file = await firstExistingFile(asset.paths)
  if (!file) {
    return new Response('Soul App client asset has not been built. Run bun run build:client.', {
      headers: { 'content-type': 'text/plain; charset=utf-8' },
      status: 503,
    })
  }

  return new Response(file, {
    headers: {
      'cache-control': 'no-store',
      'content-type': asset.contentType,
    },
  })
}

export async function serveSoulAppStyle(url: URL): Promise<Response | null> {
  if (url.pathname !== soulAppStyleHref)
    return null

  const file = await firstExistingFile(soulAppStylePaths)
  if (!file) {
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

async function firstExistingFile(paths: URL[]) {
  for (const path of paths) {
    const file = Bun.file(path)
    if (await file.exists())
      return file
  }
  return null
}

function escapeHtmlAttribute(value: string): string {
  return value.replaceAll('&', '&amp;').replaceAll('"', '&quot;').replaceAll('<', '&lt;').replaceAll('>', '&gt;')
}
