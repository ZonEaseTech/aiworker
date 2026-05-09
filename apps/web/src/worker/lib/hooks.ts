import type {
  ChannelType,
  EngineAvailabilityResponse,
  WorkerConfig,
} from '@zonease/aiworker-shared'
import type {
  BrainAdmissionListOptions,
  BrainArtifactsListOptions,
  CronAddInput,
  CronJobRow,
  CronPatchInput,
  ListArtifactsOptions,
  PutConfigResult,
  WorkerConfigEnvelope,
} from '@/worker/api'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useCallback } from 'react'
import {
  addCron,
  applyAdmission,
  approveAdmission,
  continueConversation,
  deleteCron,
  deleteSecret,
  getAdmission,
  getBrainSummary,
  getCaseFile,
  getConfig,
  getEngines,
  getInfo,
  getReviewFile,
  getWorkerHealth,
  grantApproval,
  listAdmissions,
  listApprovals,
  listArtifacts,
  listCases,
  listConversations,
  listCron,
  listMessages,
  listReviews,
  listRuns,
  listSecrets,
  listTasks,
  listWorkerArtifacts,
  patchCron,
  promoteReviewLessons,
  proposeCaseLessons,
  putConfig,
  putSecret,
  rejectAdmission,
  rerunCase,
  rerunReview,
  submitTask,
  testBrain,
  testChannel,
  testExecutor,
} from '@/worker/api'

/**
 * worker 视角 TanStack Query hooks。所有 query key 都以 `['worker', ...]` 前缀
 * 隔开（即便理论上 worker bundle 只跑 worker 视角的 query，前缀化让 invalidate
 * / log 一目了然）。
 */

const HEALTH_KEY = ['worker', 'health'] as const
const INFO_KEY = ['worker', 'info'] as const
const CONFIG_KEY = ['worker', 'config'] as const
const ENGINES_KEY = ['worker', 'engines'] as const
const SECRETS_KEY = ['worker', 'secrets'] as const
const APPROVALS_KEY = ['worker', 'approvals'] as const
const CRON_KEY = ['worker', 'cron'] as const
const RUNS_KEY = ['worker', 'runs'] as const
const TASKS_KEY = ['worker', 'tasks'] as const
const CASES_KEY = ['worker', 'cases'] as const
const REVIEWS_KEY = ['worker', 'reviews'] as const
const CONVERSATIONS_KEY = ['worker', 'conversations'] as const
const BRAIN_SUMMARY_KEY = ['worker', 'brain', 'summary'] as const
function messagesKey(conversationId: string) {
  return ['worker', 'conversations', conversationId, 'messages'] as const
}
function caseKey(taskId: string) {
  return ['worker', 'cases', taskId] as const
}
function reviewKey(taskId: string) {
  return ['worker', 'reviews', taskId] as const
}
function admissionsKey(opts: BrainAdmissionListOptions) {
  return ['worker', 'brain', 'admissions', opts] as const
}
function admissionKey(id: string) {
  return ['worker', 'brain', 'admission', id] as const
}
function artifactsKey(opts: BrainArtifactsListOptions) {
  return ['worker', 'brain', 'artifacts', opts] as const
}
function workerArtifactsKey(opts: ListArtifactsOptions) {
  return ['worker', 'artifacts', opts] as const
}

// ---------------------------------------------------------------------------
// Health / Info
// ---------------------------------------------------------------------------

export function useWorkerHealth() {
  return useQuery({
    queryKey: HEALTH_KEY,
    queryFn: getWorkerHealth,
    // 顶部状态栏需要相对实时：30s 自动刷一次，operator 视觉上感知 brain/executor
    // 翻 down/healthy 不会等太久。
    refetchInterval: 30_000,
    staleTime: 10_000,
  })
}

export function useWorkerInfo() {
  return useQuery({
    queryKey: INFO_KEY,
    queryFn: getInfo,
    staleTime: 15_000,
    refetchInterval: 60_000,
  })
}

// ---------------------------------------------------------------------------
// Config
// ---------------------------------------------------------------------------

export function useWorkerConfig() {
  return useQuery<WorkerConfigEnvelope>({
    queryKey: CONFIG_KEY,
    queryFn: getConfig,
    staleTime: 0,
  })
}

export interface PutWorkerConfigVariables {
  config: WorkerConfig
  ifMatchVersion: number
}

export function usePutWorkerConfig() {
  const qc = useQueryClient()
  return useMutation<PutConfigResult, Error, PutWorkerConfigVariables>({
    mutationFn: ({ config, ifMatchVersion }) => putConfig(config, ifMatchVersion),
    onSuccess: (res) => {
      qc.setQueryData<WorkerConfigEnvelope>(CONFIG_KEY, { config: res.config, version: res.version })
      qc.invalidateQueries({ queryKey: INFO_KEY })
    },
  })
}

// ---------------------------------------------------------------------------
// Engines（FEAT-018 与 fleet 同 cache TTL）
// ---------------------------------------------------------------------------

export function useWorkerEngines() {
  return useQuery<EngineAvailabilityResponse>({
    queryKey: ENGINES_KEY,
    queryFn: () => getEngines(),
    // worker 端缓存 10 分钟；UI 与之对齐避免重复探测。Refresh 按钮强制 `?refresh=1`
    // 走 useRefreshWorkerEngines。
    staleTime: 10 * 60_000,
  })
}

export function useRefreshWorkerEngines() {
  const qc = useQueryClient()
  return useCallback(async () => {
    const fresh = await getEngines({ refresh: true })
    qc.setQueryData<EngineAvailabilityResponse>(ENGINES_KEY, fresh)
    return fresh
  }, [qc])
}

// ---------------------------------------------------------------------------
// Secrets
// ---------------------------------------------------------------------------

export function useWorkerSecrets() {
  return useQuery({
    queryKey: SECRETS_KEY,
    queryFn: listSecrets,
    staleTime: 10_000,
  })
}

export function usePutWorkerSecret() {
  const qc = useQueryClient()
  return useMutation<void, Error, { key: string, value: string }>({
    mutationFn: ({ key, value }) => putSecret(key, value),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: SECRETS_KEY })
    },
  })
}

export function useDeleteWorkerSecret() {
  const qc = useQueryClient()
  return useMutation<void, Error, string>({
    mutationFn: key => deleteSecret(key),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: SECRETS_KEY })
    },
  })
}

// ---------------------------------------------------------------------------
// Test (brain / executor / channel)
// ---------------------------------------------------------------------------

export function useTestWorkerBrain() {
  return useMutation({ mutationFn: () => testBrain() })
}

export function useTestWorkerExecutor() {
  return useMutation<
    Awaited<ReturnType<typeof testExecutor>>,
    Error,
    { probe?: boolean } | undefined
  >({ mutationFn: body => testExecutor(body ?? {}) })
}

export function useTestWorkerChannel() {
  return useMutation({
    mutationFn: ({ channel, chatId, text }: { channel: ChannelType, chatId?: string, text?: string }) =>
      testChannel(channel, {
        ...(chatId === undefined ? {} : { chatId }),
        ...(text === undefined ? {} : { text }),
      }),
  })
}

// ---------------------------------------------------------------------------
// Cron
// ---------------------------------------------------------------------------

export function useCronJobs() {
  return useQuery({
    queryKey: CRON_KEY,
    queryFn: listCron,
    staleTime: 15_000,
    refetchInterval: 60_000,
  })
}

export function useAddCron() {
  const qc = useQueryClient()
  return useMutation<CronJobRow, Error, CronAddInput>({
    mutationFn: addCron,
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: CRON_KEY })
    },
  })
}

export function usePatchCron() {
  const qc = useQueryClient()
  return useMutation<CronJobRow, Error, { id: string, patch: CronPatchInput }>({
    mutationFn: ({ id, patch }) => patchCron(id, patch),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: CRON_KEY })
    },
  })
}

export function useDeleteCron() {
  const qc = useQueryClient()
  return useMutation<void, Error, string>({
    mutationFn: deleteCron,
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: CRON_KEY })
    },
  })
}

// ---------------------------------------------------------------------------
// Approvals
// ---------------------------------------------------------------------------

export function useApprovals() {
  return useQuery({
    queryKey: APPROVALS_KEY,
    queryFn: listApprovals,
    // approvals 是实时性强的项，5s polling 让 prominent 的提示能在 operator 端
    // 及时翻新。后续可改为依赖 SSE，但 MVP 用轻 polling 足够。
    refetchInterval: 5_000,
    staleTime: 1_000,
  })
}

export function useGrantApproval() {
  const qc = useQueryClient()
  return useMutation<
    { granted: boolean },
    Error,
    { taskId: string, toolCallId: string, decision: 'allow' | 'deny' }
  >({
    mutationFn: ({ taskId, toolCallId, decision }) => grantApproval(taskId, toolCallId, decision),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: APPROVALS_KEY })
    },
  })
}

// ---------------------------------------------------------------------------
// Chat / Orchestrator
// ---------------------------------------------------------------------------

export function useTasks() {
  return useQuery({
    queryKey: TASKS_KEY,
    queryFn: listTasks,
    staleTime: 5_000,
    refetchInterval: 15_000,
  })
}

export function useRuns() {
  return useQuery({
    queryKey: RUNS_KEY,
    queryFn: listRuns,
    staleTime: 5_000,
    refetchInterval: 15_000,
  })
}

export function useWorkerArtifacts(opts: ListArtifactsOptions = {}) {
  return useQuery({
    queryKey: workerArtifactsKey(opts),
    queryFn: () => listWorkerArtifacts(opts),
    staleTime: 5_000,
    refetchInterval: 15_000,
  })
}

export function useCases(limit = 50) {
  return useQuery({
    queryKey: [...CASES_KEY, limit] as const,
    queryFn: () => listCases(limit),
    staleTime: 5_000,
    refetchInterval: 15_000,
  })
}

export function useCase(taskId: string | undefined) {
  return useQuery({
    queryKey: taskId === undefined ? ['worker', 'cases', '__missing__'] : caseKey(taskId),
    queryFn: () => getCaseFile(taskId as string),
    enabled: Boolean(taskId),
    staleTime: 5_000,
  })
}

export function useReviews(limit = 50) {
  return useQuery({
    queryKey: [...REVIEWS_KEY, limit] as const,
    queryFn: () => listReviews(limit),
    staleTime: 5_000,
    refetchInterval: 15_000,
  })
}

export function useReview(taskId: string | undefined) {
  return useQuery({
    queryKey: taskId === undefined ? ['worker', 'reviews', '__missing__'] : reviewKey(taskId),
    queryFn: () => getReviewFile(taskId as string),
    enabled: Boolean(taskId),
    staleTime: 5_000,
  })
}

export function useRerunCase() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ taskId, prompt }: { taskId: string, prompt?: string }) => rerunCase(taskId, prompt),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: CASES_KEY })
      qc.invalidateQueries({ queryKey: TASKS_KEY })
      qc.invalidateQueries({ queryKey: CONVERSATIONS_KEY })
    },
  })
}

export function useRerunReview() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ taskId, prompt }: { taskId: string, prompt?: string }) => rerunReview(taskId, prompt),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: REVIEWS_KEY })
      qc.invalidateQueries({ queryKey: RUNS_KEY })
      qc.invalidateQueries({ queryKey: TASKS_KEY })
      qc.invalidateQueries({ queryKey: CONVERSATIONS_KEY })
    },
  })
}

export function useProposeCaseLessons() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (taskId: string) => proposeCaseLessons(taskId),
    onSuccess: (_res, taskId) => {
      qc.invalidateQueries({ queryKey: CASES_KEY })
      qc.invalidateQueries({ queryKey: caseKey(taskId) })
      qc.invalidateQueries({ queryKey: ['worker', 'brain'] })
    },
  })
}

export function usePromoteReviewLessons() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (taskId: string) => promoteReviewLessons(taskId),
    onSuccess: (_res, taskId) => {
      qc.invalidateQueries({ queryKey: REVIEWS_KEY })
      qc.invalidateQueries({ queryKey: reviewKey(taskId) })
      qc.invalidateQueries({ queryKey: ['worker', 'brain'] })
    },
  })
}

export function useSubmitTask() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (prompt: string) => submitTask(prompt),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: RUNS_KEY })
      qc.invalidateQueries({ queryKey: TASKS_KEY })
      qc.invalidateQueries({ queryKey: CONVERSATIONS_KEY })
    },
  })
}

export function useContinueConversation() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ conversationId, prompt }: { conversationId: string, prompt: string }) =>
      continueConversation(conversationId, prompt),
    onSuccess: (_task, variables) => {
      qc.invalidateQueries({ queryKey: TASKS_KEY })
      qc.invalidateQueries({ queryKey: CONVERSATIONS_KEY })
      qc.invalidateQueries({ queryKey: messagesKey(variables.conversationId) })
    },
  })
}

export function useConversations() {
  return useQuery({
    queryKey: CONVERSATIONS_KEY,
    queryFn: listConversations,
    staleTime: 15_000,
  })
}

export function useMessages(conversationId: string | undefined) {
  return useQuery({
    queryKey: conversationId ? messagesKey(conversationId) : ['worker', 'conversations', '__missing__', 'messages'],
    queryFn: () => listMessages(conversationId as string),
    enabled: Boolean(conversationId),
    staleTime: 5_000,
  })
}

export function useInvalidateMessages() {
  const qc = useQueryClient()
  return useCallback((conversationId: string) => {
    qc.invalidateQueries({ queryKey: messagesKey(conversationId) })
  }, [qc])
}

export function useInvalidateTasks() {
  const qc = useQueryClient()
  return useCallback(() => {
    qc.invalidateQueries({ queryKey: TASKS_KEY })
    qc.invalidateQueries({ queryKey: CONVERSATIONS_KEY })
  }, [qc])
}

// ---------------------------------------------------------------------------
// Brain (FEAT-054 / PLAN-103)
// ---------------------------------------------------------------------------

export function useBrainSummary() {
  return useQuery({
    queryKey: BRAIN_SUMMARY_KEY,
    queryFn: getBrainSummary,
    staleTime: 15_000,
    refetchInterval: 60_000,
  })
}

export function useAdmissions(opts: BrainAdmissionListOptions = {}) {
  return useQuery({
    queryKey: admissionsKey(opts),
    queryFn: () => listAdmissions(opts),
    staleTime: 10_000,
  })
}

export function useAdmission(id: string | undefined, showSensitive = false) {
  return useQuery({
    queryKey: id === undefined ? ['worker', 'brain', 'admission', '__missing__'] : admissionKey(id),
    queryFn: () => getAdmission(id as string, showSensitive),
    enabled: Boolean(id),
    staleTime: 5_000,
  })
}

export function useApproveAdmission() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ id, decidedBy, reason }: { id: string, decidedBy: string, reason?: string }) =>
      approveAdmission(id, { decidedBy, ...(reason === undefined ? {} : { reason }) }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['worker', 'brain'] })
    },
  })
}

export function useRejectAdmission() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ id, decidedBy, reason }: { id: string, decidedBy: string, reason?: string }) =>
      rejectAdmission(id, { decidedBy, ...(reason === undefined ? {} : { reason }) }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['worker', 'brain'] })
    },
  })
}

export function useApplyAdmission() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ id, decidedBy, commit }: { id: string, decidedBy: string, commit?: boolean }) =>
      applyAdmission(id, { decidedBy, ...(commit === undefined ? {} : { commit }) }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['worker', 'brain'] })
    },
  })
}

export function useArtifacts(opts: BrainArtifactsListOptions = {}) {
  return useQuery({
    queryKey: artifactsKey(opts),
    queryFn: () => listArtifacts(opts),
    staleTime: 15_000,
  })
}
