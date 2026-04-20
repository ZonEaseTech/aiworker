import type { AgentTask } from './types'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { Ban, Loader2 } from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { apiPost } from '@/lib/api'

interface CancelButtonProps {
  taskId: string
}

export function CancelButton({ taskId }: CancelButtonProps) {
  const queryClient = useQueryClient()
  const mutation = useMutation({
    mutationFn: () => apiPost<AgentTask>(`/api/orchestrator/tasks/${taskId}/cancel`),
    onSuccess: () => {
      toast.success('Task cancelled')
      queryClient.invalidateQueries({ queryKey: ['orchestrator', 'tasks'] })
      queryClient.invalidateQueries({ queryKey: ['orchestrator', 'tasks', taskId] })
    },
    onError: (err: unknown) => {
      toast.error('Cancel failed', {
        description: err instanceof Error ? err.message : 'Unknown error',
      })
    },
  })

  return (
    <Button
      size="sm"
      variant="destructive"
      disabled={mutation.isPending}
      onClick={() => {
        // eslint-disable-next-line no-alert -- intentional user confirmation
        if (window.confirm('Cancel this running task?'))
          mutation.mutate()
      }}
    >
      {mutation.isPending
        ? <Loader2 className="size-4 animate-spin" />
        : <Ban className="size-4" />}
      Cancel
    </Button>
  )
}
