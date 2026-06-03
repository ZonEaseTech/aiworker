import type { ManagedSessionComposerDraft } from '@zonease/aiworker-ui/components/managed-session-composer'

type SessionDraftInput = Pick<ManagedSessionComposerDraft, 'materials' | 'text'>

export function sessionDraftToInvocationInput(draft: SessionDraftInput): string {
  const text = draft.text.trim()
  if (draft.materials.length === 0)
    return text

  const materialSections = draft.materials.map(formatSessionMaterial)
  return [
    text,
    '<attached_source_materials>',
    materialSections.join('\n\n'),
    '</attached_source_materials>',
  ].filter(part => part.length > 0).join('\n\n')
}

export function sessionDraftToDisplayText(draft: SessionDraftInput): string {
  const text = draft.text.trim()
  if (text.length > 0)
    return text
  if (draft.materials.length === 0)
    return ''
  return `Attached source materials: ${draft.materials.map(material => material.name).join(', ')}`
}

function formatSessionMaterial(material: ManagedSessionComposerDraft['materials'][number]): string {
  const fence = markdownFenceFor(material.content)
  const language = material.encoding === 'base64' ? 'base64' : languageHintFor(material.name)
  const header = `<source_material name="${escapeAttribute(material.name)}" mime_type="${escapeAttribute(material.mimeType)}" size_bytes="${material.size}" encoding="${material.encoding}">`
  return [
    header,
    `${fence}${language}`,
    material.content,
    fence,
    '</source_material>',
  ].join('\n')
}

function markdownFenceFor(content: string): string {
  const longestRun = Math.max(0, ...Array.from(content.matchAll(/`+/g), match => match[0].length))
  return '`'.repeat(Math.max(3, longestRun + 1))
}

function languageHintFor(name: string): string {
  const extension = name.match(/\.([a-z0-9][a-z0-9+-]{0,15})$/i)?.[1]
  return extension ? extension.toLowerCase() : ''
}

function escapeAttribute(value: string): string {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('"', '&quot;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
}
