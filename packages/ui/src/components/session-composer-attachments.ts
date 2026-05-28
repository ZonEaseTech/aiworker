export type SessionComposerMaterialEncoding = 'base64' | 'utf8'

export interface SessionComposerMaterial {
  content: string
  encoding: SessionComposerMaterialEncoding
  mimeType: string
  name: string
  size: number
}

export async function createComposerAttachment(file: File): Promise<SessionComposerMaterial> {
  const encoding: SessionComposerMaterialEncoding = isTextLikeFile(file) ? 'utf8' : 'base64'
  const content = encoding === 'utf8'
    ? await file.text()
    : arrayBufferToBase64(await file.arrayBuffer())

  return {
    content,
    encoding,
    mimeType: file.type || 'application/octet-stream',
    name: file.name,
    size: file.size,
  }
}

export function formatSessionAttachmentKind(file: Pick<File, 'name' | 'type'>): string {
  const extension = file.name.includes('.') ? file.name.split('.').pop() : ''
  return (extension || file.type.split('/').pop() || 'file').slice(0, 5).toUpperCase()
}

export function formatSessionAttachmentSize(size: number): string {
  if (size < 1024)
    return `${size} B`
  if (size < 1024 * 1024)
    return `${Math.round(size / 102.4) / 10} KB`
  return `${Math.round(size / 1024 / 102.4) / 10} MB`
}

export function isSessionAttachmentImage(file: Pick<File, 'name' | 'type'>): boolean {
  return file.type.startsWith('image/') || /\.(?:avif|gif|jpe?g|png|webp)$/i.test(file.name)
}

function isTextLikeFile(file: Pick<File, 'name' | 'type'>): boolean {
  if (file.type.startsWith('text/'))
    return true
  if (/(?:json|javascript|typescript|xml|csv|yaml|yml|markdown|x-www-form-urlencoded)$/i.test(file.type))
    return true
  return /\.(?:cjs|css|csv|html|js|json|jsx|log|md|mdx|mjs|sql|svg|toml|ts|tsx|txt|xml|yaml|yml)$/i.test(file.name)
}

function arrayBufferToBase64(buffer: ArrayBuffer): string {
  let binary = ''
  const bytes = new Uint8Array(buffer)
  for (const byte of bytes)
    binary += String.fromCharCode(byte)
  return btoa(binary)
}
