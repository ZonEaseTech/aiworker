import type { TaskDetailResponse, TaskLifecyclePayload, TaskMessagePayload, TaskToolCallPayload } from '@/features/orchestrator/types'
import type { BusEvent } from '@/lib/hooks/useEventStream'
import { useQueryClient } from '@tanstack/react-query'
import { createFileRoute, getRouteApi, useNavigate } from '@tanstack/react-router'
import { Bot } from 'lucide-react'
import { useCallback } from 'react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { SubmitTaskForm } from '@/features/orchestrator/SubmitTaskForm'
import { TaskDetail } from '@/features/orchestrator/TaskDetail'
import { TaskList } from '@/features/orchestrator/TaskList'
import { ORCHESTRATOR_EVENTS } from '@/features/orchestrator/types'
import { useEventStream } from '@/lib/hooks/useEventStream'

export interface OrchestratorSearch {
  taskId?: string
}

const routeApi = getRouteApi('/orchestrator')

function applyMessage(
  prev: TaskDetailResponse | undefined,
  payload: TaskMessagePayload,
): TaskDetailResponse | undefined {
  if (!prev)
    return prev
  if (prev.messages.some(m => m.id === payload.message.id))
    return prev
  return { ...prev, messages: [...prev.messages, payload.message] }
}

function applyToolCall(
  prev: TaskDetailResponse | undefined,
  payload: TaskToolCallPayload,
): TaskDetailResponse | undefined {
  if (!prev)
    return prev
  if (prev.toolCalls.some(tc => tc.id === payload.call.id))
    return prev
  return { ...prev, toolCalls: [...prev.toolCalls, payload.call] }
}

function OrchestratorPage() {
  const queryClient = useQueryClient()
  const navigate = useNavigate({ from: '/orchestrator' })
  const { taskId } = routeApi.useSearch()

  const select = useCallback((id: string | undefined) => {
    navigate({ search: id ? { taskId: id } : {} })
  }, [navigate])

  const handleEvent = useCallback((event: BusEvent) => {
    if (!event.type.startsWith('orchestrator.'))
      return

    const payload = (event.payload ?? {}) as { taskId?: string }

    if (event.type === ORCHESTRATOR_EVENTS.TaskStarted) {
      queryClient.invalidateQueries({ queryKey: ['orchestrator', 'tasks'] })
      return
    }

    if (event.type === ORCHESTRATOR_EVENTS.TaskMessage) {
      const msgPayload = payload as TaskMessagePayload
      if (msgPayload.taskId) {
        queryClient.setQueryData<TaskDetailResponse>(
          ['orchestrator', 'tasks', msgPayload.taskId],
          prev => applyMessage(prev, msgPayload),
        )
      }
      return
    }

    if (event.type === ORCHESTRATOR_EVENTS.TaskToolCall) {
      const tcPayload = payload as TaskToolCallPayload
      if (tcPayload.taskId) {
        queryClient.setQueryData<TaskDetailResponse>(
          ['orchestrator', 'tasks', tcPayload.taskId],
          prev => applyToolCall(prev, tcPayload),
        )
      }
      return
    }

    if (
      event.type === ORCHESTRATOR_EVENTS.TaskFinished
      || event.type === ORCHESTRATOR_EVENTS.TaskFailed
      || event.type === ORCHESTRATOR_EVENTS.TaskCancelled
    ) {
      const lifecyclePayload = payload as TaskLifecyclePayload
      queryClient.invalidateQueries({ queryKey: ['orchestrator', 'tasks'] })
      if (lifecyclePayload.taskId) {
        queryClient.invalidateQueries({
          queryKey: ['orchestrator', 'tasks', lifecyclePayload.taskId],
        })
      }
    }
  }, [queryClient])

  useEventStream(handleEvent)

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center gap-2">
        <Bot className="size-5 text-muted-foreground" />
        <h1 className="text-2xl font-semibold tracking-tight">Orchestrator</h1>
      </div>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-[22rem_1fr]">
        <div className="flex flex-col gap-4">
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-base">New task</CardTitle>
            </CardHeader>
            <CardContent>
              <SubmitTaskForm onSubmitted={id => select(id)} />
            </CardContent>
          </Card>
          <Card className="overflow-hidden p-0">
            <CardHeader className="px-3 py-2">
              <CardTitle className="text-sm text-muted-foreground">Tasks</CardTitle>
            </CardHeader>
            <div className="max-h-[60vh] overflow-auto border-t">
              <TaskList selectedId={taskId} onSelect={select} />
            </div>
          </Card>
        </div>

        <Card className="min-h-[24rem] overflow-hidden p-0">
          {taskId
            ? <TaskDetail taskId={taskId} />
            : (
                <div className="flex h-full items-center justify-center p-6 text-center text-sm text-muted-foreground">
                  Select a task to see its transcript.
                </div>
              )}
        </Card>
      </div>
    </div>
  )
}

export const Route = createFileRoute('/orchestrator')({
  component: OrchestratorPage,
  validateSearch: (search: Record<string, unknown>): OrchestratorSearch => {
    const taskId = typeof search.taskId === 'string' && search.taskId.length > 0
      ? search.taskId
      : undefined
    return taskId ? { taskId } : {}
  },
})
