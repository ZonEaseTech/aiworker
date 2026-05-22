import type { ReactNode } from 'react'

import { Badge, BadgeLabel } from '#components/badge'
import { Item, ItemContent, ItemDescription, ItemGroup, ItemTitle } from '#components/item'
import { cn } from '#lib/utils'

export interface SessionThreadArtifact {
  description?: ReactNode
  id: string
  status?: 'available' | 'missing' | 'archived' | string
  title: ReactNode
}

export interface SessionThreadMessage {
  artifacts?: SessionThreadArtifact[]
  body?: ReactNode
  id: string
  kind: 'assistant' | 'status' | 'user'
  title?: ReactNode
}

export interface SessionThreadProps {
  ariaLabel: string
  className?: string
  messages: SessionThreadMessage[]
}

export function SessionThread({ ariaLabel, className, messages }: SessionThreadProps) {
  return (
    <ItemGroup
      data-session-slot="session-thread"
      role="log"
      aria-label={ariaLabel}
      className={cn('min-w-0 gap-3', className)}
    >
      {messages.map(message => (
        <Item key={message.id} data-session-message-kind={message.kind} variant={message.kind === 'status' ? 'muted' : 'default'}>
          <ItemContent className="min-w-0 gap-2">
            {message.title ? <ItemTitle className="max-w-full">{message.title}</ItemTitle> : null}
            {message.body ? <ItemDescription className="max-w-full line-clamp-none">{message.body}</ItemDescription> : null}
            {message.artifacts?.length
              ? (
                  <div className="grid min-w-0 gap-2">
                    {message.artifacts.map(artifact => <ArtifactCard key={artifact.id} artifact={artifact} />)}
                  </div>
                )
              : null}
          </ItemContent>
        </Item>
      ))}
    </ItemGroup>
  )
}

export function ArtifactCard({ artifact }: { artifact: SessionThreadArtifact }) {
  return (
    <Item data-session-slot="artifact-card" variant="muted" size="sm" className="min-w-0">
      <ItemContent className="min-w-0">
        <ItemTitle className="max-w-full">{artifact.title}</ItemTitle>
        {artifact.description ? <ItemDescription className="max-w-full line-clamp-none">{artifact.description}</ItemDescription> : null}
      </ItemContent>
      {artifact.status
        ? (
            <Badge variant="outline">
              <BadgeLabel>{artifact.status}</BadgeLabel>
            </Badge>
          )
        : null}
    </Item>
  )
}
