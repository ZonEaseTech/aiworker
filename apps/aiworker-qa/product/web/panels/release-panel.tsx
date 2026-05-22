import { Badge } from '@zonease/aiworker-ui/components/badge'
import {
  Card,
  CardAction,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@zonease/aiworker-ui/components/card'
import { ItemContent } from '@zonease/aiworker-ui/components/item'

export const panelId = 'qa-release-panel'

export interface QaReleasePanelProofProps {
  badgeLabel?: string
  description?: string
  detail?: string
}

export function QaReleasePanelProof({
  badgeLabel = 'Soul-owned verdict',
  description = 'Shadcn proof for a QA-owned release panel.',
  detail = 'The QA Soul App decides pass, risk, and blocker semantics. The shared UI package supplies the surface primitives.',
}: QaReleasePanelProofProps = {}) {
  return (
    <Card size="sm">
      <CardHeader>
        <ItemContent className="min-w-0">
          <CardTitle>Release Gate Review</CardTitle>
          <CardDescription>{description}</CardDescription>
        </ItemContent>
        <CardAction>
          <Badge variant="secondary">{badgeLabel}</Badge>
        </CardAction>
      </CardHeader>
      <CardContent>
        <CardDescription className="line-clamp-none">{detail}</CardDescription>
      </CardContent>
    </Card>
  )
}
