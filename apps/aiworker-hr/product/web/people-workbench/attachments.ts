import type { SessionComposerMaterial } from '@zonease/aiworker-ui/components/session-composer'
import type { AttachedMaterialMetadata, ComposerMaterial, ComposerMaterialEncoding } from './types'

const UPLOAD_PREFIX = 'evidence/uploads'
const TEXT_FILE_EXTENSIONS = new Set(['csv', 'json', 'md', 'markdown', 'txt', 'tsv', 'yaml', 'yml'])

export async function materialFromFile(file: File): Promise<ComposerMaterial> {
  const encoding = materialEncodingForFile(file)
  const content = encoding === 'utf8'
    ? await file.text()
    : arrayBufferToBase64(await file.arrayBuffer())
  return {
    content,
    encoding,
    fileName: file.name,
    mimeType: normalizedMimeType(file.type),
    path: candidateMaterialPath(file.name),
    size: file.size,
  }
}

export function sanitizeCandidateMaterialPaths(materials: readonly ComposerMaterial[]): ComposerMaterial[] {
  const seen = new Set<string>()
  return materials.map((material) => {
    const path = dedupeCandidateMaterialPath(candidateMaterialPath(material.path || material.fileName), seen)
    return {
      ...material,
      path,
    }
  })
}

export function candidateMaterialsFromSessionComposerMaterials(materials: readonly SessionComposerMaterial[]): ComposerMaterial[] {
  return sanitizeCandidateMaterialPaths(materials.map(material => ({
    content: material.content,
    encoding: material.encoding,
    fileName: material.name,
    mimeType: material.mimeType,
    path: material.name,
    size: material.size,
  })))
}

export function buildAttachedMaterialsMetadata(materials: readonly ComposerMaterial[]): {
  attachedMaterials: AttachedMaterialMetadata[]
  materialCount: number
} {
  const attachedMaterials = materials.map(material => ({
    encoding: material.encoding,
    fileName: material.fileName,
    mimeType: material.mimeType,
    path: material.path,
    size: material.size,
  }))
  return {
    attachedMaterials,
    materialCount: attachedMaterials.length,
  }
}

export function buildReadableSessionContext(input: {
  attachedMaterials: readonly ComposerMaterial[]
  profileName: string
  userInput: string
}): string {
  const userInput = input.userInput.trim()
  const lines = [
    `Profile: ${input.profileName}`,
    '',
    'User input:',
    userInput || 'No additional user input was provided.',
    '',
    'Attached candidate materials:',
  ]
  if (input.attachedMaterials.length === 0) {
    lines.push('- None')
  }
  else {
    lines.push(...input.attachedMaterials.map(material =>
      `- ${material.path} (${material.fileName}, ${material.mimeType}, ${material.encoding}, ${material.size} bytes)`,
    ))
  }
  return lines.join('\n')
}

function materialEncodingForFile(file: File): ComposerMaterialEncoding {
  const mimeType = normalizedMimeType(file.type).toLowerCase()
  if (mimeType.startsWith('text/'))
    return 'utf8'
  if (/(?:^|[/+.-])(?:json|markdown|xml|yaml|csv)(?:;|$)/.test(mimeType))
    return 'utf8'
  const extension = extensionFor(file.name)
  return TEXT_FILE_EXTENSIONS.has(extension) ? 'utf8' : 'base64'
}

function normalizedMimeType(value: string): string {
  const [mimeType] = value.split(';')
  return mimeType?.trim() || 'application/octet-stream'
}

function candidateMaterialPath(fileName: string): string {
  const safeName = safeMaterialFileName(fileName)
  return `${UPLOAD_PREFIX}/${safeName}`
}

function dedupeCandidateMaterialPath(path: string, seen: Set<string>): string {
  const normalized = path.startsWith(`${UPLOAD_PREFIX}/`) ? path : candidateMaterialPath(path)
  const { extension, stem } = splitFileName(normalized.slice(UPLOAD_PREFIX.length + 1))
  let candidate = normalized
  let index = 2
  while (seen.has(candidate.toLowerCase())) {
    candidate = `${UPLOAD_PREFIX}/${stem}-${index}${extension}`
    index += 1
  }
  seen.add(candidate.toLowerCase())
  return candidate
}

function safeMaterialFileName(input: string): string {
  const baseName = input.split(/[\\/]+/).filter(Boolean).at(-1) ?? 'candidate-material'
  const { extension, stem } = splitFileName(baseName)
  const safeStem = normalizePathSegment(stem) || 'candidate-material'
  const safeExtension = normalizeExtension(extension)
  return `${safeStem}${safeExtension}`
}

function splitFileName(fileName: string): { extension: string, stem: string } {
  const trimmed = fileName.trim()
  const lastDot = trimmed.lastIndexOf('.')
  if (lastDot <= 0 || lastDot === trimmed.length - 1)
    return { extension: '', stem: trimmed }
  return {
    extension: trimmed.slice(lastDot).toLowerCase(),
    stem: trimmed.slice(0, lastDot),
  }
}

function normalizePathSegment(input: string): string {
  return input
    .normalize('NFKD')
    .replace(/[\u0300-\u036F]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 96)
}

function normalizeExtension(input: string): string {
  if (!input)
    return ''
  const normalized = input.toLowerCase().replace(/[^a-z0-9.]+/g, '')
  return normalized.startsWith('.') ? normalized : `.${normalized}`
}

function extensionFor(fileName: string): string {
  const extension = splitFileName(fileName).extension
  return extension.startsWith('.') ? extension.slice(1) : extension
}

function arrayBufferToBase64(buffer: ArrayBuffer): string {
  const bytes = new Uint8Array(buffer)
  if (typeof btoa === 'function') {
    let binary = ''
    const chunkSize = 0x8000
    for (let index = 0; index < bytes.length; index += chunkSize)
      binary += String.fromCharCode(...bytes.slice(index, index + chunkSize))
    return btoa(binary)
  }
  // eslint-disable-next-line node/prefer-global/buffer
  return Buffer.from(bytes).toString('base64')
}
