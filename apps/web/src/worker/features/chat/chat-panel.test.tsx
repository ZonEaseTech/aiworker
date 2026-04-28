/* eslint-disable react-hooks-extra/no-unnecessary-use-prefix */
import type { WorkerSSEEvent } from '@/worker/api'
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { ChatPanel } from './chat-panel'

const mocks = vi.hoisted(() => ({
  conversations: [] as Array<{ id: string, channel: string, chatId: string, lastActiveAt: string }>,
  invalidateMessages: vi.fn(),
  invalidateTasks: vi.fn(),
  messageConversationIds: [] as Array<string | undefined>,
  submitTask: vi.fn(),
  subscribeEvents: vi.fn(),
  sseHandler: null as ((event: WorkerSSEEvent) => void) | null,
}))

vi.mock('@/worker/api', () => {
  class WorkerApiError extends Error {}
  return {
    WorkerApiError,
    subscribeEvents: mocks.subscribeEvents,
  }
})

vi.mock('@/worker/lib/hooks', () => ({
  useConversations: () => ({
    isLoading: false,
    data: { conversations: mocks.conversations },
  }),
  useInvalidateMessages: () => mocks.invalidateMessages,
  useInvalidateTasks: () => mocks.invalidateTasks,
  useMessages: (conversationId: string | undefined) => {
    mocks.messageConversationIds.push(conversationId)
    return {
      isLoading: false,
      isError: false,
      data: { messages: [] },
    }
  },
  useSubmitTask: () => ({
    isPending: false,
    mutateAsync: mocks.submitTask,
  }),
}))

describe('worker chat panel', () => {
  beforeEach(() => {
    mocks.conversations = []
    mocks.invalidateMessages.mockReset()
    mocks.invalidateTasks.mockReset()
    mocks.messageConversationIds = []
    mocks.submitTask.mockReset()
    mocks.submitTask.mockResolvedValue({ id: 'task-1' })
    mocks.sseHandler = null
    mocks.subscribeEvents.mockReset()
    mocks.subscribeEvents.mockImplementation((signal: AbortSignal, onEvent: (event: WorkerSSEEvent) => void) => {
      mocks.sseHandler = onEvent
      return new Promise<void>((resolve) => {
        if (signal.aborted) {
          resolve()
          return
        }
        signal.addEventListener('abort', () => resolve(), { once: true })
      })
    })
  })

  it('streams orchestrator SSE events for the submitted task id', async () => {
    render(<ChatPanel />)

    fireEvent.change(screen.getByLabelText('Prompt'), { target: { value: 'hello worker' } })
    fireEvent.click(screen.getByRole('button', { name: /发送/ }))

    await waitFor(() => expect(mocks.submitTask).toHaveBeenCalledWith('hello worker'))
    await waitFor(() => expect(mocks.subscribeEvents).toHaveBeenCalled())

    await act(async () => {
      mocks.sseHandler?.({
        type: 'conversation.created',
        data: { conversationId: 'conv-1', channel: 'web', chatId: 'task:task-1' },
      })
      mocks.sseHandler?.({
        type: 'orchestrator.text',
        data: { conversationId: 'conv-1', delta: 'streamed reply' },
      })
      mocks.sseHandler?.({
        type: 'orchestrator.finished',
        data: { conversationId: 'conv-1' },
      })
    })

    expect(await screen.findByText('streamed reply')).toBeTruthy()
    expect(mocks.invalidateTasks).toHaveBeenCalledTimes(1)
    expect(mocks.invalidateMessages).toHaveBeenCalledWith('conv-1')
    expect(mocks.messageConversationIds).toContain('conv-1')
  })
})
