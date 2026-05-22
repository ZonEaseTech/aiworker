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

export const panelId = 'hr-profile-panel'

export interface HrProfilePanelProofProps {
  badgeLabel?: string
  description?: string
  detail?: string
}

export function HrProfilePanelProof({
  badgeLabel = 'Soul-owned meaning',
  description = 'Shadcn proof for a Soul-owned panel.',
  detail = 'The HR Soul App owns the profile patch meaning. The shared UI package provides only primitive composition.',
}: HrProfilePanelProofProps = {}) {
  return (
    <Card size="sm">
      <CardHeader>
        <ItemContent className="min-w-0">
          <CardTitle>Profile Patch</CardTitle>
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
