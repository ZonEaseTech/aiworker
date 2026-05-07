/* eslint-disable react-hooks-extra/no-unnecessary-use-prefix */
import type { WorkerSSEEvent } from '@/worker/api'
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { ChatPanel } from './chat-panel'

const mocks = vi.hoisted(() => ({
  conversations: [] as Array<{ id: string, channel: string, chatId: string, lastActiveAt: string }>,
  continueConversation: vi.fn(),
  invalidateMessages: vi.fn(),
  invalidateTasks: vi.fn(),
  messageConversationIds: [] as Array<string | undefined>,
  messagesByConversation: {} as Record<string, Array<{
    id: string
    conversationId: string
    role: string
    content: string
    createdAt: string
  }>>,
  submitTask: vi.fn(),
  subscribeEvents: vi.fn(),
  sseHandler: null as ((event: WorkerSSEEvent) => void) | null,
}))

const asyncRenderWait = { timeout: 10_000 }

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
  useContinueConversation: () => ({
    isPending: false,
    mutateAsync: mocks.continueConversation,
  }),
  useInvalidateMessages: () => mocks.invalidateMessages,
  useInvalidateTasks: () => mocks.invalidateTasks,
  useMessages: (conversationId: string | undefined) => {
    mocks.messageConversationIds.push(conversationId)
    return {
      isLoading: false,
      isError: false,
      data: { messages: conversationId ? (mocks.messagesByConversation[conversationId] ?? []) : [] },
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
    mocks.continueConversation.mockReset()
    mocks.continueConversation.mockResolvedValue({ id: 'task-continue' })
    mocks.invalidateMessages.mockReset()
    mocks.invalidateTasks.mockReset()
    mocks.messageConversationIds = []
    mocks.messagesByConversation = {}
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
        data: { conversationId: 'conv-1', channel: 'web', chatId: 'task:task-1', taskId: 'task-1' },
      })
      mocks.sseHandler?.({
        type: 'orchestrator.text',
        data: { conversationId: 'conv-1', taskId: 'task-1', delta: 'streamed reply' },
      })
      mocks.sseHandler?.({
        type: 'orchestrator.finished',
        data: { conversationId: 'conv-1', taskId: 'task-1' },
      })
    })

    expect(await screen.findByText('streamed reply', {}, asyncRenderWait)).toBeTruthy()
    expect(mocks.invalidateTasks).toHaveBeenCalledTimes(1)
    expect(mocks.invalidateMessages).toHaveBeenCalledWith('conv-1')
    expect(mocks.messageConversationIds).toContain('conv-1')
  })

  it('ignores foreign orchestrator events before the submitted task binds a conversation', async () => {
    render(<ChatPanel />)

    fireEvent.change(screen.getByLabelText('Prompt'), { target: { value: 'hello worker' } })
    fireEvent.click(screen.getByRole('button', { name: /发送/ }))

    await waitFor(() => expect(mocks.submitTask).toHaveBeenCalledWith('hello worker'))
    await waitFor(() => expect(mocks.subscribeEvents).toHaveBeenCalled())

    await act(async () => {
      mocks.sseHandler?.({
        type: 'orchestrator.text',
        data: { conversationId: 'foreign-conv', taskId: 'task-other', delta: 'wrong stream' },
      })
      mocks.sseHandler?.({
        type: 'orchestrator.text',
        data: { conversationId: 'legacy-conv', delta: 'legacy stream' },
      })
      mocks.sseHandler?.({
        type: 'orchestrator.text',
        data: { conversationId: 'conv-1', taskId: 'task-1', delta: 'right stream' },
      })
      mocks.sseHandler?.({
        type: 'orchestrator.finished',
        data: { conversationId: 'conv-1', taskId: 'task-1' },
      })
    })

    expect(screen.queryByText('wrong stream')).toBeNull()
    expect(screen.queryByText('legacy stream')).toBeNull()
    expect(await screen.findByText('right stream', {}, asyncRenderWait)).toBeTruthy()
    expect(mocks.messageConversationIds).toContain('conv-1')
  })

  it('continues the selected conversation instead of creating a new task conversation', async () => {
    mocks.conversations = [{
      id: 'conv-existing',
      channel: 'web',
      chatId: 'chat-existing',
      lastActiveAt: '2026-05-02T21:00:00.000Z',
    }]
    mocks.continueConversation.mockResolvedValue({ id: 'task-continue' })

    render(<ChatPanel />)

    const conversationButton = screen.getByText('web:chat-existing').closest('button')
    expect(conversationButton).toBeTruthy()
    fireEvent.click(conversationButton!)
    fireEvent.change(screen.getByLabelText('Prompt'), { target: { value: 'second turn' } })
    fireEvent.click(screen.getByRole('button', { name: /发送/ }))

    await waitFor(() => expect(mocks.continueConversation).toHaveBeenCalledWith({
      conversationId: 'conv-existing',
      prompt: 'second turn',
    }))
    expect(mocks.submitTask).not.toHaveBeenCalled()
    await waitFor(() => expect(mocks.subscribeEvents).toHaveBeenCalled())

    await act(async () => {
      mocks.sseHandler?.({
        type: 'orchestrator.text',
        data: { conversationId: 'conv-existing', taskId: 'task-continue', delta: 'continued reply' },
      })
      mocks.sseHandler?.({
        type: 'orchestrator.finished',
        data: { conversationId: 'conv-existing', taskId: 'task-continue' },
      })
    })

    expect(await screen.findByText('continued reply', {}, asyncRenderWait)).toBeTruthy()
    expect(mocks.invalidateMessages).toHaveBeenCalledWith('conv-existing')
    expect(mocks.messageConversationIds).toContain('conv-existing')
  })

  it('uses the explicit new conversation mode after a conversation was selected', async () => {
    mocks.conversations = [{
      id: 'conv-existing',
      channel: 'web',
      chatId: 'chat-existing',
      lastActiveAt: '2026-05-02T21:00:00.000Z',
    }]

    render(<ChatPanel />)

    const conversationButton = screen.getByText('web:chat-existing').closest('button')
    expect(conversationButton).toBeTruthy()
    fireEvent.click(conversationButton!)
    fireEvent.click(screen.getByRole('button', { name: /新会话/ }))
    fireEvent.change(screen.getByLabelText('Prompt'), { target: { value: 'fresh turn' } })
    fireEvent.click(screen.getByRole('button', { name: /发送/ }))

    await waitFor(() => expect(mocks.submitTask).toHaveBeenCalledWith('fresh turn'))
    expect(mocks.continueConversation).not.toHaveBeenCalled()
  })

  it('hides the finished stream preview after the persisted assistant message refreshes', async () => {
    const view = render(<ChatPanel />)

    fireEvent.change(screen.getByLabelText('Prompt'), { target: { value: 'hello worker' } })
    fireEvent.click(screen.getByRole('button', { name: /发送/ }))

    await waitFor(() => expect(mocks.submitTask).toHaveBeenCalledWith('hello worker'))
    await waitFor(() => expect(mocks.subscribeEvents).toHaveBeenCalled())

    await act(async () => {
      mocks.sseHandler?.({
        type: 'conversation.created',
        data: { conversationId: 'conv-1', channel: 'web', chatId: 'task:task-1', taskId: 'task-1' },
      })
      mocks.sseHandler?.({
        type: 'orchestrator.text',
        data: { conversationId: 'conv-1', taskId: 'task-1', delta: 'final reply' },
      })
      mocks.sseHandler?.({
        type: 'orchestrator.finished',
        data: { conversationId: 'conv-1', taskId: 'task-1' },
      })
    })

    expect(await screen.findByText('final reply', {}, asyncRenderWait)).toBeTruthy()
    expect(screen.getAllByText('final reply')).toHaveLength(1)

    mocks.messagesByConversation['conv-1'] = [
      {
        id: 'msg-user-1',
        conversationId: 'conv-1',
        role: 'user',
        content: 'hello worker',
        createdAt: '2026-05-07T09:33:01.000Z',
      },
      {
        id: 'msg-assistant-1',
        conversationId: 'conv-1',
        role: 'assistant',
        content: 'final reply',
        createdAt: '2026-05-07T09:33:02.000Z',
      },
    ]
    view.rerender(<ChatPanel />)

    expect(screen.getAllByText('final reply')).toHaveLength(1)
    expect(screen.getByText(/assistant ·/)).toBeTruthy()
  })
})
