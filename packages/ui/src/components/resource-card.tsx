import type { ReactNode } from 'react'
import type { TranscriptResourceKind, TranscriptResourceModel } from './transcript-types'

import { Badge, BadgeLabel } from '#components/badge'
import { Button } from '#components/button'
import { Item, ItemActions, ItemContent, ItemDescription, ItemMedia, ItemTitle } from '#components/item'
import { cn } from '#lib/utils'
import {
  File02Icon,
  Folder01Icon,
  Globe02Icon,
  Image02Icon,
  Link04Icon,
} from '@hugeicons/core-free-icons'
import { HugeiconsIcon } from '@hugeicons/react'

export interface ResourceCardProps {
  className?: string
  resource: TranscriptResourceModel
}

export function ResourceCard({ className, resource }: ResourceCardProps) {
  const href = normalizeResourceHref(resource.href)
  const titleLabel = stringifyResourceLabel(resource.title)

  return (
    <Item
      data-transcript-slot="resource-card"
      data-resource-kind={resource.kind}
      variant="muted"
      size="sm"
      className={cn('min-w-0 border border-border/60 bg-muted/25 shadow-none', className)}
    >
      <ItemMedia variant="icon" aria-hidden="true">
        <HugeiconsIcon icon={iconForResourceKind(resource.kind)} strokeWidth={2} />
      </ItemMedia>
      <ItemContent className="min-w-0 gap-0.5">
        <ItemTitle className="max-w-full truncate">{resource.title}</ItemTitle>
        <ItemDescription className="flex max-w-full flex-wrap gap-x-1 line-clamp-none text-muted-foreground">
          <span>{labelForResourceKind(resource.kind)}</span>
          {resource.location ? <span aria-hidden="true">·</span> : null}
          {resource.location ? <span>{resource.location}</span> : null}
          {resource.description ? <span aria-hidden="true">·</span> : null}
          {resource.description ? <span>{resource.description}</span> : null}
        </ItemDescription>
      </ItemContent>
      {resource.status
        ? (
            <Badge variant="outline">
              <BadgeLabel>{resource.status}</BadgeLabel>
            </Badge>
          )
        : null}
      {href
        ? (
            <ItemActions>
              <Button asChild variant="ghost" size="sm">
                <a href={href} target="_blank" rel="noreferrer" aria-label={`打开 ${titleLabel}`}>
                  <HugeiconsIcon icon={Link04Icon} strokeWidth={2} aria-hidden="true" />
                  {resource.actionLabel ?? '打开'}
                </a>
              </Button>
            </ItemActions>
          )
        : null}
    </Item>
  )
}

function normalizeResourceHref(href: string | undefined): string | undefined {
  if (!href)
    return undefined

  const value = href.trim()
  if (!value || hasControlCharacter(value))
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

function hasControlCharacter(value: string): boolean {
  for (let index = 0; index < value.length; index += 1) {
    const code = value.charCodeAt(index)
    if (code <= 31 || code === 127)
      return true
  }
  return false
}

function stringifyResourceLabel(value: ReactNode): string {
  return typeof value === 'string' || typeof value === 'number' ? String(value) : 'resource'
}

function labelForResourceKind(kind: TranscriptResourceKind): string {
  if (kind === 'web')
    return '网站'
  if (kind === 'browser')
    return '浏览器'
  if (kind === 'directory')
    return '目录'
  if (kind === 'document')
    return '文档'
  if (kind === 'image')
    return '图片'
  if (kind === 'file')
    return '文件'
  return '资源'
}

function iconForResourceKind(kind: TranscriptResourceKind) {
  if (kind === 'web' || kind === 'browser')
    return Globe02Icon
  if (kind === 'directory')
    return Folder01Icon
  if (kind === 'image')
    return Image02Icon
  return File02Icon
}
