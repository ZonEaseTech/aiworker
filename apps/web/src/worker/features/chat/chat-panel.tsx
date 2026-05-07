import { Loader2, Plus, Send } from 'lucide-react'
import { useEffect, useId, useRef, useState } from 'react'
import { Button } from '@/shared/components/ui/button'
import { Skeleton } from '@/shared/components/ui/skeleton'
import { subscribeEvents, WorkerApiError } from '@/worker/api'
import {
  useContinueConversation,
  useConversations,
  useInvalidateMessages,
  useInvalidateTasks,
  useMessages,
  useSubmitTask,
} from '@/worker/lib/hooks'

interface StreamChunk {
  taskId: string
  conversationId: string | null
  text: string
  done: boolean
  initialMessageIds: string[]
}

/**
 * Worker 自管 chat 面板（FEAT-035 §验收 7）。
 *
 * 流程：
 *   1. 用户提交 prompt → `POST /api/worker/orchestrator/tasks`，返回 task.id
 *   2. 客户端订阅 SSE `/api/worker/events/stream`
 *      - `orchestrator.text` 累积成文本
 *      - `orchestrator.finished` / `orchestrator.error` 收尾，并 invalidate 列表 query
 *   3. 左侧侧栏列历史 conversation，点击拉对应 message timeline
 *
 * 不变量：SSE 走 fetch + AbortController，便于 unmount / 切换 conversation 时
 * 解绑；orchestrator 的 `submitTask` 不直接返回会话流，必须由 SSE 派发对回。
 */
export function ChatPanel() {
  const conversationsQ = useConversations()
  // null 表示显式新会话模式；点选左侧历史后，composer 才继续该会话。
  const [pickedId, setPickedId] = useState<string | null>(null)
  const activeId = pickedId
  const messagesQ = useMessages(activeId ?? undefined)
  const submit = useSubmitTask()
  const continueSelected = useContinueConversation()
  const invalidateMessages = useInvalidateMessages()
  const invalidateTasks = useInvalidateTasks()

  const [prompt, setPrompt] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [streaming, setStreaming] = useState<StreamChunk | null>(null)
  const messages = messagesQ.data?.messages ?? []
  const shouldShowStreaming = streaming !== null
    && streaming.text.length > 0
    && !hasPersistedStreamingMessage(streaming, messages)
  const visibleStreaming = shouldShowStreaming ? streaming : null

  const promptId = useId()
  const subRef = useRef<AbortController | null>(null)

  useEffect(() => {
    return () => {
      subRef.current?.abort()
    }
  }, [])

  async function send() {
    const text = prompt.trim()
    const selectedConversationId = pickedId
    const initialMessageIds = messages.map(message => message.id)
    const isPending = submit.isPending || continueSelected.isPending
    if (text.length === 0 || isPending)
      return
    setError(null)
    try {
      const task = selectedConversationId
        ? await continueSelected.mutateAsync({ conversationId: selectedConversationId, prompt: text })
        : await submit.mutateAsync(text)
      setPrompt('')
      // 启动当前 task 的 SSE 订阅；上一次的订阅取消。
      subRef.current?.abort()
      const ctrl = new AbortController()
      subRef.current = ctrl
      setStreaming({ taskId: task.id, conversationId: selectedConversationId, text: '', done: false, initialMessageIds })
      void runSSE(ctrl, task.id, {
        onConversation: (conversationId) => {
          setPickedId(conversationId)
          setStreaming((prev) => {
            if (!prev || prev.taskId !== task.id)
              return prev
            return { ...prev, conversationId }
          })
        },
        onDelta: (chunk) => {
          setStreaming((prev) => {
            if (!prev || prev.taskId !== task.id)
              return prev
            return { ...prev, text: prev.text + chunk }
          })
        },
        onDone: (conversationId) => {
          setStreaming(prev => prev && prev.taskId === task.id ? { ...prev, done: true } : prev)
          invalidateTasks()
          if (conversationId)
            invalidateMessages(conversationId)
        },
        onError: (msg) => {
          setError(msg)
          setStreaming(null)
        },
      })
    }
    catch (err) {
      setError(err instanceof WorkerApiError ? err.message : '提交失败。')
    }
  }

  return (
    <div
      data-testid="worker-chat-panel"
      className="grid min-w-0 grid-cols-1 gap-4 lg:h-[calc(100vh-200px)] lg:min-h-[420px] lg:grid-cols-[280px_1fr]"
    >
      <aside className="flex max-h-56 min-h-0 min-w-0 flex-col gap-3 overflow-y-auto rounded-sm border border-hairline bg-card p-3 lg:max-h-none">
        <div className="flex items-center justify-between gap-2">
          <h2 className="px-1 text-feature font-normal">Conversations</h2>
          <Button
            type="button"
            variant={pickedId === null ? 'secondary' : 'outline'}
            size="sm"
            className="min-h-8 px-2 py-1 text-xs"
            onClick={() => setPickedId(null)}
          >
            <Plus className="size-3.5" />
            新会话
          </Button>
        </div>
        {conversationsQ.isLoading
          ? <Skeleton className="h-20" />
          : (conversationsQ.data?.conversations ?? []).length === 0
              ? (
                  <p className="px-1 text-xs text-muted-foreground">尚无会话。</p>
                )
              : (
                  <ul className="flex flex-col gap-1">
                    {conversationsQ.data?.conversations.map(c => (
                      <li key={c.id}>
                        <button
                          type="button"
                          onClick={() => setPickedId(c.id)}
                          className={`flex w-full flex-col rounded-sm px-2 py-2 text-left text-xs transition-colors ${
                            activeId === c.id
                              ? 'bg-primary text-primary-foreground'
                              : 'hover:bg-soft-stone'
                          }`}
                        >
                          <span className="min-w-0 truncate font-mono text-micro">
                            {c.channel}
                            :
                            {c.chatId}
                          </span>
                          <span className={`truncate text-micro-label ${activeId === c.id ? 'text-primary-foreground/70' : 'text-muted-foreground'}`}>
                            {new Date(c.lastActiveAt).toLocaleString()}
                          </span>
                        </button>
                      </li>
                    ))}
                  </ul>
                )}
      </aside>

      <section className="flex min-h-[420px] min-w-0 flex-col gap-3 rounded-lg border border-hairline bg-soft-stone p-3 text-foreground sm:p-4 lg:min-h-0">
        <div className="flex min-w-0 flex-1 flex-col gap-2 overflow-y-auto">
          {!activeId
            ? (
                <p className="rounded-sm border border-dashed border-hairline bg-background p-4 text-center text-sm text-muted-foreground sm:p-6">
                  新会话
                </p>
              )
            : messagesQ.isLoading
              ? <Skeleton className="h-40" />
              : messagesQ.isError
                ? (
                    <p role="alert" className="rounded-sm border border-coral-soft bg-coral/10 p-3 text-sm text-coral-soft">
                      加载消息失败：
                      {messagesQ.error instanceof Error ? messagesQ.error.message : '未知错误'}
                    </p>
                  )
                : (messagesQ.data?.messages ?? []).map(m => (
                    <div
                      key={m.id}
                      className={`max-w-[90%] rounded-sm p-3 text-sm sm:max-w-[80%] ${
                        m.role === 'user'
                          ? 'self-end border border-hairline bg-background text-foreground'
                          : 'self-start bg-deep-green text-on-dark'
                      }`}
                    >
                      <p className="whitespace-pre-wrap break-words">{m.content}</p>
                      <p className="mt-1 text-micro-label opacity-70">
                        {m.role}
                        {' · '}
                        {new Date(m.createdAt).toLocaleString()}
                      </p>
                    </div>
                  ))}

          {visibleStreaming && (
            <div className="max-w-[90%] self-start rounded-sm bg-deep-green p-3 text-sm text-on-dark sm:max-w-[80%]">
              <p className="whitespace-pre-wrap break-words">{visibleStreaming.text}</p>
              {!visibleStreaming.done && (
                <p className="mt-1 text-micro-label text-on-dark/70">
                  <Loader2 className="inline size-3 animate-spin" />
                  {' streaming…'}
                </p>
              )}
            </div>
          )}
        </div>

        {error && (
          <p role="alert" className="rounded-sm border border-coral-soft bg-coral/10 p-2 text-xs text-coral-soft">
            {error}
          </p>
        )}

        <form
          className="flex flex-col gap-2 sm:flex-row"
          onSubmit={(e) => {
            e.preventDefault()
            void send()
          }}
        >
          <label htmlFor={promptId} className="sr-only">Prompt</label>
          <textarea
            id={promptId}
            className="min-h-[60px] min-w-0 flex-1 resize-none rounded-sm border border-input bg-background px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            placeholder="给 worker 发一条消息（Cmd/Ctrl + Enter 发送）"
            value={prompt}
            onChange={e => setPrompt(e.target.value)}
            onKeyDown={(e) => {
              if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') {
                e.preventDefault()
                void send()
              }
            }}
          />
          <Button
            type="submit"
            className="w-full sm:w-auto"
            disabled={submit.isPending || continueSelected.isPending || prompt.trim().length === 0}
          >
            {submit.isPending || continueSelected.isPending ? <Loader2 className="size-4 animate-spin" /> : <Send className="size-4" />}
            发送
          </Button>
        </form>
      </section>
    </div>
  )
}

interface SSEHandlers {
  onConversation: (conversationId: string) => void
  onDelta: (chunk: string) => void
  onDone: (conversationId: string | null) => void
  onError: (message: string) => void
}

/**
 * 订阅一次 SSE，尽量锁定当前 operator send 对应的 conversation。
 *
 * 新会话路径会先发 `conversation.created`；继续会话路径则由带匹配 taskId 的
 * `orchestrator.*` 事件补齐 conversationId。不带 taskId 的其他通道任务不能
 * 抢占绑定。
 */
async function runSSE(ctrl: AbortController, taskId: string, handlers: SSEHandlers): Promise<void> {
  let conversationId: string | null = null
  const taskChatId = `task:${taskId}`

  function bindConversation(next: string) {
    if (conversationId === next)
      return
    conversationId = next
    handlers.onConversation(next)
  }

  try {
    await subscribeEvents(ctrl.signal, (evt) => {
      const data = evt.data as Record<string, unknown>
      const eventTaskId = typeof data.taskId === 'string' ? data.taskId : null
      if (
        evt.type === 'conversation.created'
        && (!eventTaskId || eventTaskId === taskId)
        && (data.chatId === taskChatId || eventTaskId === taskId)
        && typeof data.conversationId === 'string'
      ) {
        bindConversation(data.conversationId)
        return
      }

      const eventConversationId = typeof data.conversationId === 'string' ? data.conversationId : null
      if (eventTaskId && eventTaskId !== taskId)
        return
      if (!conversationId && eventTaskId !== taskId)
        return
      if (conversationId && eventConversationId && eventConversationId !== conversationId)
        return

      if (!conversationId && eventConversationId && evt.type.startsWith('orchestrator.'))
        bindConversation(eventConversationId)

      if (evt.type === 'orchestrator.text') {
        const text = typeof data.delta === 'string' ? data.delta : ''
        if (text.length > 0)
          handlers.onDelta(text)
      }
      else if (evt.type === 'orchestrator.finished') {
        handlers.onDone(conversationId)
        ctrl.abort()
      }
      else if (evt.type === 'orchestrator.error') {
        const msg = typeof data.error === 'string' ? data.error : '事件流返回执行错误。'
        handlers.onError(msg)
        ctrl.abort()
      }
    })
  }
  catch (err) {
    if (ctrl.signal.aborted)
      return
    handlers.onError(err instanceof Error ? err.message : '事件流中断。')
  }
}

function hasPersistedStreamingMessage(
  streaming: StreamChunk,
  messages: Array<{ id: string, conversationId: string, role: string, content: string }>,
): boolean {
  if (!streaming.done || streaming.text.length === 0)
    return false

  const initialIds = new Set(streaming.initialMessageIds)
  return messages.some(message =>
    message.role === 'assistant'
    && message.content === streaming.text
    && !initialIds.has(message.id)
    && (!streaming.conversationId || message.conversationId === streaming.conversationId),
  )
}
