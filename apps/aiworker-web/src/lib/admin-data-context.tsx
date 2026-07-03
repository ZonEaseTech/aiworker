import type { ControlPlaneSnapshot } from '@zonease/aiworker-control/control-plane'
import type { SoulCatalogEntry } from '@/lib/admin-api-client'
import type { AdminConsoleData, ApprovalDecisionRecord, ApprovalStatus } from '@/lib/admin-data'
import type { AdminBootstrapStatus, AdminRemediation } from '@/lib/admin-remediation'
import { createContext, useContext, useEffect, useMemo, useState } from 'react'
import { AdminApiError, adminMutationHeaders, adminReadHeaders, fetchSoulCatalog, readAdminApiError, submitAdminMutation } from '@/lib/admin-api-client'
import {
  adminConsoleData,
  applyApprovalDecisionRecords,
  createAdminDataSourceFromControlPlaneSnapshot,
  loadAdminConsoleData,
} from '@/lib/admin-data'
import { adminRemediation } from '@/lib/admin-remediation'
import { redirectToLoginIfAuthRequired } from '@/lib/admin-session'

interface AdminDataApiPayload {
  approvals: ApprovalDecisionRecord[]
  bootstrap: AdminBootstrapStatus
  snapshot: ControlPlaneSnapshot | null
  source: 'control-plane' | 'fixture'
}

interface AdminDataContextValue {
  bootstrap: AdminBootstrapStatus
  createMetadata: <T>(path: string, body: unknown) => Promise<T>
  data: AdminConsoleData
  decideApproval: (assignmentId: string, status: ApprovalStatus) => Promise<void>
  isLive: boolean
  loadError: AdminRemediation | null
  loadSoulCatalog: () => Promise<SoulCatalogEntry[]>
  // cockpit 一键开通：审批折叠进 apply 的单个后端动作（reviewer 由服务端按登录操作员填）。
  provisionAssignment: (assignmentId: string, note?: string) => Promise<unknown>
  // 发送一次性入口（pair）；一次性入口只临时返回，不落库。
  pairAssignment: (assignmentId: string) => Promise<unknown>
  reload: () => Promise<void>
}

export const AdminDataContext = createContext<AdminDataContextValue | null>(null)

const defaultBootstrap: AdminBootstrapStatus = {
  adminTokenRequired: false,
  auth: {
    authenticated: false,
    loginRequired: false,
    loginUrl: '/login',
    logoutUrl: '/logout',
    mode: 'local',
  },
  controlPlaneDirConfigured: false,
  host: '127.0.0.1',
  remoteAccessEnabled: false,
  source: 'fixture',
}

export function AdminDataProvider({ children }: { children: React.ReactNode }) {
  const [bootstrap, setBootstrap] = useState(defaultBootstrap)
  const [data, setData] = useState(adminConsoleData)
  const [isLive, setIsLive] = useState(false)
  const [loadError, setLoadError] = useState<AdminRemediation | null>(null)

  async function reload() {
    let next: Awaited<ReturnType<typeof loadAdminDataFromApi>>
    try {
      next = await loadAdminDataFromApi()
    }
    catch (error) {
      // 会话使用中过期时整页跳转到登录，而不是停留在管理台上显示"已锁定"横幅。
      // 跳转已触发时页面正在卸载，直接 return 以免短暂闪过 "locked" 降级状态。
      if (redirectToLoginIfAuthRequired(error))
        return
      next = adminDataUnavailableStateFromError(error)
    }
    setBootstrap(next.bootstrap)
    setData(next.data)
    setIsLive(next.isLive)
    setLoadError(next.loadError)
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
      throw await readAdminApiError(response)
    await reload()
  }

  async function createMetadata<T>(path: string, body: unknown): Promise<T> {
    const result = await submitAdminMutation<T>(path, body)
    await reload()
    return result
  }

  async function provisionAssignment(assignmentId: string, note?: string): Promise<unknown> {
    const result = await submitAdminMutation<unknown>(
      `/api/assignments/${encodeURIComponent(assignmentId)}/provision`,
      note?.trim() ? { note: note.trim() } : {},
    )
    await reload()
    return result
  }

  async function pairAssignment(assignmentId: string): Promise<unknown> {
    // pair 的一次性入口只临时返回给调用方展示，不写入 data，故这里返回后不强制 reload 覆盖它。
    const result = await submitAdminMutation<unknown>(`/api/assignments/${encodeURIComponent(assignmentId)}/pair`, {})
    await reload()
    return result
  }

  useEffect(() => {
    void reload()
  }, [])

  const value = useMemo(
    () => ({ bootstrap, createMetadata, data, decideApproval, isLive, loadError, loadSoulCatalog: fetchSoulCatalog, pairAssignment, provisionAssignment, reload }),
    [bootstrap, data, isLive, loadError],
  )

  return <AdminDataContext.Provider value={value}>{children}</AdminDataContext.Provider>
}

export function useAdminData(): AdminDataContextValue {
  return useContext(AdminDataContext) ?? {
    bootstrap: defaultBootstrap,
    async createMetadata<T>() {
      return undefined as T
    },
    data: adminConsoleData,
    async decideApproval() {},
    isLive: false,
    loadError: null,
    async loadSoulCatalog() {
      return []
    },
    async pairAssignment() {
      return undefined
    },
    async provisionAssignment() {
      return undefined
    },
    async reload() {},
  }
}

export function adminDataUnavailableStateFromError(error: unknown): {
  bootstrap: AdminBootstrapStatus
  data: AdminConsoleData
  isLive: boolean
  loadError: AdminRemediation
} {
  const remediation = error instanceof AdminApiError
    ? error.remediation
    : adminRemediation('control_plane_unavailable', error instanceof Error ? error.message : String(error))

  return {
    bootstrap: {
      adminTokenRequired: false,
      auth: {
        authenticated: false,
        loginRequired: true,
        loginUrl: '/login',
        logoutUrl: '/logout',
        mode: 'locked',
        remediationCode: remediation.code,
      },
      controlPlaneDirConfigured: true,
      host: globalThis.location?.hostname || '127.0.0.1',
      remoteAccessEnabled: false,
      source: 'control-plane',
    },
    data: adminConsoleData,
    isLive: false,
    loadError: remediation,
  }
}

export async function loadAdminDataFromApi(): Promise<{ bootstrap: AdminBootstrapStatus, data: AdminConsoleData, isLive: boolean, loadError: AdminRemediation | null }> {
  const response = await fetch('/api/admin-data', {
    headers: adminReadHeaders(),
  })
  if (!response.ok)
    throw await readAdminApiError(response)
  const payload = await response.json() as AdminDataApiPayload
  if (!payload.snapshot)
    return { bootstrap: payload.bootstrap, data: adminConsoleData, isLive: false, loadError: null }
  const source = createAdminDataSourceFromControlPlaneSnapshot(payload.snapshot)
  return {
    bootstrap: payload.bootstrap,
    data: applyApprovalDecisionRecords(loadAdminConsoleData(source), payload.approvals),
    isLive: payload.source === 'control-plane',
    loadError: null,
  }
}
