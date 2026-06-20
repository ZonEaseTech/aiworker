import { RemediationAlert } from '@/components/remediation-alert'
import { adminRemediation } from '@/lib/admin-remediation'
import { useAdminData } from '@/lib/admin-data-context'

export function DemoDataNotice() {
  const { bootstrap } = useAdminData()
  if (bootstrap.source !== 'fixture')
    return null
  return <RemediationAlert remediation={adminRemediation('control_plane_dir_required')} />
}
