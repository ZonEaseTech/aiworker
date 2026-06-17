import type { AdminRemediation } from '@/lib/admin-remediation'
import { InfoIcon, WarningCircleIcon } from '@phosphor-icons/react'
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'
import { remediationTone } from '@/lib/admin-remediation'

export function RemediationAlert({ remediation }: { remediation: AdminRemediation }) {
  const tone = remediationTone(remediation)
  const Icon = tone === 'info' ? InfoIcon : WarningCircleIcon

  return (
    <Alert variant={tone === 'destructive' ? 'destructive' : 'default'}>
      <Icon weight="duotone" />
      <AlertTitle>{remediation.title}</AlertTitle>
      <AlertDescription>
        <div className="flex flex-col gap-2">
          <p>{remediation.detail}</p>
          <ul className="ml-4 flex list-disc flex-col gap-1">
            {remediation.nextSteps.map(step => <li key={step}>{step}</li>)}
          </ul>
        </div>
      </AlertDescription>
    </Alert>
  )
}
