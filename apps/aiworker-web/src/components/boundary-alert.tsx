import { WarningCircleIcon } from '@phosphor-icons/react'

import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'

export function BoundaryAlert() {
  return (
    <Alert>
      <WarningCircleIcon weight="duotone" />
      <AlertTitle>Runtime boundary</AlertTitle>
      <AlertDescription>
        AIWorker Web is an admin control plane. It can prepare assignments and handoff metadata, but Paseo owns workspace UI, sessions, logs, permissions, and provider process lifecycle.
      </AlertDescription>
    </Alert>
  )
}
