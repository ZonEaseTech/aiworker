import type { TranscriptArtifactModel } from './transcript-types'

import { Badge, BadgeLabel } from '#components/badge'
import { Item, ItemActions, ItemContent, ItemDescription, ItemGroup, ItemTitle } from '#components/item'
import { cn } from '#lib/utils'

export interface ArtifactStripProps {
  artifacts: TranscriptArtifactModel[]
  className?: string
}

function normalizeArtifactHref(href: string | undefined) {
  if (!href)
    return undefined

  const value = href.trim()

  if (!value)
    return undefined

  try {
    const url = new URL(value, 'https://aiworker.local')

    if (url.protocol === 'http:' || url.protocol === 'https:')
      return value
  }
  catch {
    return undefined
  }

  return undefined
}

export function ArtifactStrip({ artifacts, className }: ArtifactStripProps) {
  if (artifacts.length === 0)
    return null

  return (
    <ItemGroup data-transcript-slot="artifact-strip" className={cn('grid gap-2 sm:grid-cols-2', className)}>
      {artifacts.map((artifact) => {
        const href = normalizeArtifactHref(artifact.href)

        return (
          <Item
            key={artifact.id}
            data-transcript-slot="artifact-reference"
            role="listitem"
            variant="muted"
            size="sm"
            className="min-w-0"
          >
            <ItemContent className="min-w-0">
              <ItemTitle className="max-w-full">
                {href ? <a href={href}>{artifact.title}</a> : artifact.title}
              </ItemTitle>
              {artifact.description
                ? <ItemDescription className="max-w-full line-clamp-none">{artifact.description}</ItemDescription>
                : null}
            </ItemContent>
            {artifact.status
              ? (
                  <Badge variant="outline">
                    <BadgeLabel>{artifact.status}</BadgeLabel>
                  </Badge>
                )
              : null}
            {artifact.action ? <ItemActions>{artifact.action}</ItemActions> : null}
          </Item>
        )
      })}
    </ItemGroup>
  )
}
