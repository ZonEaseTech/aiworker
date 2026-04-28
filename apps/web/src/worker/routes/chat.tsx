import { createFileRoute } from '@tanstack/react-router'
import { ChatPanel } from '@/worker/features/chat/chat-panel'

export const Route = createFileRoute('/chat')({
  component: ChatPanel,
})
