import type { EnrollmentPendingPayload } from '@zonease/aiworker-gateway-proto'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useEffect } from 'react'
import { approveEnrollment, listPendingEnrollments, rejectEnrollment } from '@/fleet/api'
import { getGatewayClient } from '@/fleet/lib/gateway-client'

const ENROLL_LIST_KEY = ['fleet', 'enroll', 'pending'] as const

/**
 * 待批 OTP 列表。30s 兜底 polling，叠加 `enrollment.pending` 事件实时刷新。
 *
 * 事件订阅：getGatewayClient().onEvent 是 multi-subscriber 安全的（FEAT-034
 * Phase 2 已加 unit test）；当本 hook 被多个组件同时挂载（不会，但理论上
 * 如此），每条 event 只会触发一次 query invalidate。
 */
export function usePendingEnrollments() {
  const qc = useQueryClient()
  const query = useQuery({
    queryKey: ENROLL_LIST_KEY,
    queryFn: listPendingEnrollments,
    refetchInterval: 30_000,
    staleTime: 5_000,
  })

  useEffect(() => {
    const unsubscribe = getGatewayClient().onEvent('enrollment.pending', (_payload: unknown) => {
      // 任意 reason（submitted/approved/rejected/expired/abandoned）都用整表
      // invalidate 处理：保留实现简单 + 服务端是 source of truth；前端不必维护
      // 增量合并的边界条件。
      void qc.invalidateQueries({ queryKey: ENROLL_LIST_KEY })
    })
    return unsubscribe
  }, [qc])

  return query
}

export function useApproveEnrollment() {
  const qc = useQueryClient()
  return useMutation<
    Awaited<ReturnType<typeof approveEnrollment>>,
    Error,
    string
  >({
    mutationFn: approveEnrollment,
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ENROLL_LIST_KEY })
      qc.invalidateQueries({ queryKey: ['fleet', 'workers'] })
    },
  })
}

export function useRejectEnrollment() {
  const qc = useQueryClient()
  return useMutation<
    Awaited<ReturnType<typeof rejectEnrollment>>,
    Error,
    string
  >({
    mutationFn: rejectEnrollment,
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ENROLL_LIST_KEY })
    },
  })
}

export type { EnrollmentPendingPayload }
