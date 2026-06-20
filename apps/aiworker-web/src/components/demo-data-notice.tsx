import { RemediationAlert } from '@/components/remediation-alert'
import { useAdminData } from '@/lib/admin-data-context'
import { adminRemediation } from '@/lib/admin-remediation'

export function DemoDataNotice() {
  const { bootstrap } = useAdminData()
  if (bootstrap.source !== 'fixture')
    return null
  return <RemediationAlert remediation={adminRemediation('control_plane_dir_required')} />
}
