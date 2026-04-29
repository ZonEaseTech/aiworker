import { Loader2, Send } from 'lucide-react'
import { useEffect, useId, useRef, useState } from 'react'
import { Button } from '@/shared/components/ui/button'
import { Skeleton } from '@/shared/components/ui/skeleton'
import { subscribeEvents, WorkerApiError } from '@/worker/api'
import {
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
  // 用户显式选中的会话；为空时回退到列表第一条（最近活跃）。这样用 useMemo
  // 派生而非 useState + useEffect，避免 react-hooks-extra 报「在 effect 里
  // 直接 setState」。
  const [pickedId, setPickedId] = useState<string | null>(null)
  const activeId = pickedId ?? conversationsQ.data?.conversations[0]?.id ?? null
  const messagesQ = useMessages(activeId ?? undefined)
  const submit = useSubmitTask()
  const invalidateMessages = useInvalidateMessages()
  const invalidateTasks = useInvalidateTasks()

  const [prompt, setPrompt] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [streaming, setStreaming] = useState<StreamChunk | null>(null)

  const promptId = useId()
  const subRef = useRef<AbortController | null>(null)

  useEffect(() => {
    return () => {
      subRef.current?.abort()
    }
  }, [])

  async function send() {
    const text = prompt.trim()
    if (text.length === 0 || submit.isPending)
      return
    setError(null)
    try {
      const task = await submit.mutateAsync(text)
      setPrompt('')
      // 启动当前 task 的 SSE 订阅；上一次的订阅取消。
      subRef.current?.abort()
      const ctrl = new AbortController()
      subRef.current = ctrl
      setStreaming({ taskId: task.id, conversationId: null, text: '', done: false })
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
      <aside className="flex max-h-56 min-h-0 min-w-0 flex-col gap-2 overflow-y-auto rounded-md border bg-card p-3 lg:max-h-none">
        <h2 className="px-1 text-sm font-bold">Conversations</h2>
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
                          className={`flex w-full flex-col rounded-md px-2 py-1.5 text-left text-xs transition-colors ${
                            activeId === c.id
                              ? 'bg-accent text-accent-foreground'
                              : 'hover:bg-accent/50'
                          }`}
                        >
                          <span className="min-w-0 truncate font-mono text-micro">
                            {c.channel}
                            :
                            {c.chatId}
                          </span>
                          <span className="truncate text-micro-label text-muted-foreground">
                            {new Date(c.lastActiveAt).toLocaleString()}
                          </span>
                        </button>
                      </li>
                    ))}
                  </ul>
                )}
      </aside>

      <section className="flex min-h-[420px] min-w-0 flex-col gap-3 rounded-md border bg-card p-3 sm:p-4 lg:min-h-0">
        <div className="flex min-w-0 flex-1 flex-col gap-2 overflow-y-auto">
          {!activeId
            ? (
                <p className="rounded-md border border-dashed p-4 text-center text-sm text-muted-foreground sm:p-6">
                  发一条消息会创建新会话。
                </p>
              )
            : messagesQ.isLoading
              ? <Skeleton className="h-40" />
              : messagesQ.isError
                ? (
                    <p role="alert" className="rounded-md border border-destructive/40 bg-destructive/10 p-3 text-sm text-destructive">
                      加载消息失败：
                      {messagesQ.error instanceof Error ? messagesQ.error.message : '未知错误'}
                    </p>
                  )
                : (messagesQ.data?.messages ?? []).map(m => (
                    <div
                      key={m.id}
                      className={`max-w-[90%] rounded-md p-3 text-sm sm:max-w-[80%] ${
                        m.role === 'user'
                          ? 'self-end border-2 border-primary bg-background text-foreground'
                          : 'self-start bg-muted'
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

          {streaming && streaming.text.length > 0 && (
            <div className="max-w-[90%] self-start rounded-md bg-muted p-3 text-sm sm:max-w-[80%]">
              <p className="whitespace-pre-wrap break-words">{streaming.text}</p>
              {!streaming.done && (
                <p className="mt-1 text-micro-label text-muted-foreground">
                  <Loader2 className="inline size-3 animate-spin" />
                  {' streaming…'}
                </p>
              )}
            </div>
          )}
        </div>

        {error && (
          <p role="alert" className="rounded-md border border-destructive/40 bg-destructive/10 p-2 text-xs text-destructive">
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
            className="min-h-[60px] min-w-0 flex-1 resize-none rounded-md border bg-background px-3 py-2 text-sm"
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
            disabled={submit.isPending || prompt.trim().length === 0}
          >
            {submit.isPending ? <Loader2 className="size-4 animate-spin" /> : <Send className="size-4" />}
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
 * 订阅一次 SSE，尽量锁定当前 `submitTask()` 创建的 conversation。
 *
 * 后端 submitTask 使用 `chatId = task:<taskId>` 创建 web conversation，并在
 * 这条 web task 的 `orchestrator.*` SSE payload 里带 `taskId`。如果
 * `conversation.created` 因 race 没赶上，带匹配 taskId 的首个 orchestrator
 * 事件也能补齐 conversationId；不带 taskId 的其他通道任务不能抢占绑定。
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
