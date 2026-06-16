import type { ControlPlaneSnapshot } from '@zonease/aiworker-control/control-plane'
import type { AdminConsoleData, ApprovalDecisionRecord, ApprovalStatus } from '@/lib/admin-data'
import { createContext, useContext, useEffect, useMemo, useState } from 'react'
import { adminMutationHeaders } from '@/lib/admin-api-client'
import {
  adminConsoleData,
  applyApprovalDecisionRecords,
  createAdminDataSourceFromControlPlaneSnapshot,
  loadAdminConsoleData,
} from '@/lib/admin-data'

interface AdminDataApiPayload {
  approvals: ApprovalDecisionRecord[]
  snapshot: ControlPlaneSnapshot | null
  source: 'control-plane' | 'fixture'
}

interface AdminDataContextValue {
  data: AdminConsoleData
  decideApproval: (assignmentId: string, status: ApprovalStatus) => Promise<void>
  isLive: boolean
  reload: () => Promise<void>
}

const AdminDataContext = createContext<AdminDataContextValue | null>(null)

export function AdminDataProvider({ children }: { children: React.ReactNode }) {
  const [data, setData] = useState(adminConsoleData)
  const [isLive, setIsLive] = useState(false)

  async function reload() {
    const next = await fetchAdminData()
    setData(next.data)
    setIsLive(next.isLive)
  }

  async function decideApproval(assignmentId: string, status: ApprovalStatus) {
    const response = await fetch(`/api/approvals/${encodeURIComponent(assignmentId)}`, {
      body: JSON.stringify({ status }),
      headers: {
        ...adminMutationHeaders(),
        'content-type': 'application/json',
      },
      method: 'POST',
    })
    if (!response.ok)
      throw new Error(`approval update failed: ${response.status}`)
    await reload()
  }

  useEffect(() => {
    void reload().catch(() => {
      setData(adminConsoleData)
      setIsLive(false)
    })
  }, [])

  const value = useMemo(() => ({ data, decideApproval, isLive, reload }), [data, isLive])

  return <AdminDataContext.Provider value={value}>{children}</AdminDataContext.Provider>
}

export function useAdminData(): AdminDataContextValue {
  return useContext(AdminDataContext) ?? {
    async decideApproval() {},
    data: adminConsoleData,
    isLive: false,
    async reload() {},
  }
}

async function fetchAdminData(): Promise<{ data: AdminConsoleData, isLive: boolean }> {
  const response = await fetch('/api/admin-data')
  if (!response.ok)
    throw new Error(`admin data load failed: ${response.status}`)
  const payload = await response.json() as AdminDataApiPayload
  if (!payload.snapshot)
    return { data: adminConsoleData, isLive: false }
  const source = createAdminDataSourceFromControlPlaneSnapshot(payload.snapshot)
  return {
    data: applyApprovalDecisionRecords(loadAdminConsoleData(source), payload.approvals),
    isLive: payload.source === 'control-plane',
  }
}
