import type { SubmitTaskBody, SubmitTaskResponse } from './types'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { Loader2, Send } from 'lucide-react'
import { useState } from 'react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { apiPost } from '@/lib/api'

interface SubmitTaskFormProps {
  onSubmitted: (taskId: string) => void
}

export function SubmitTaskForm({ onSubmitted }: SubmitTaskFormProps) {
  const queryClient = useQueryClient()
  const [prompt, setPrompt] = useState('')
  const [autoWriteback, setAutoWriteback] = useState(true)

  const mutation = useMutation({
    mutationFn: (body: SubmitTaskBody) =>
      apiPost<SubmitTaskResponse>('/api/orchestrator/tasks', body),
    onSuccess: (data) => {
      setPrompt('')
      queryClient.invalidateQueries({ queryKey: ['orchestrator', 'tasks'] })
      toast.success('Task submitted', { description: data.id })
      onSubmitted(data.id)
    },
    onError: (err: unknown) => {
      toast.error('Submit failed', {
        description: err instanceof Error ? err.message : 'Unknown error',
      })
    },
  })

  const canSubmit = prompt.trim().length > 0 && !mutation.isPending

  return (
    <form
      className="flex flex-col gap-2"
      onSubmit={(e) => {
        e.preventDefault()
        if (!canSubmit)
          return
        mutation.mutate({ prompt: prompt.trim(), autoWriteback })
      }}
    >
      <textarea
        className="min-h-24 w-full resize-y rounded-md border border-input bg-transparent px-3 py-2 text-sm shadow-sm placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50"
        placeholder="Describe the task for the orchestrator..."
        value={prompt}
        onChange={e => setPrompt(e.target.value)}
        disabled={mutation.isPending}
      />
      <div className="flex items-center justify-between gap-2">
        <label className="flex items-center gap-2 text-xs text-muted-foreground">
          <input
            type="checkbox"
            className="size-3.5 accent-primary"
            checked={autoWriteback}
            onChange={e => setAutoWriteback(e.target.checked)}
          />
          Auto write-back to memory
        </label>
        <Button type="submit" size="sm" disabled={!canSubmit}>
          {mutation.isPending
            ? <Loader2 className="size-4 animate-spin" />
            : <Send className="size-4" />}
          Submit
        </Button>
      </div>
    </form>
  )
}
