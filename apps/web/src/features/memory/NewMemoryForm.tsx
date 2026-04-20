import type { MemoryType, WriteMemoryInput } from './types'
import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { MEMORY_TYPES } from './types'

interface NewMemoryFormProps {
  onSubmit: (input: WriteMemoryInput) => void
  onCancel: () => void
  isSubmitting: boolean
}

export function NewMemoryForm({ onSubmit, onCancel, isSubmitting }: NewMemoryFormProps) {
  const [name, setName] = useState('')
  const [description, setDescription] = useState('')
  const [type, setType] = useState<MemoryType>('user')
  const [content, setContent] = useState('')

  const canSubmit = name.trim().length > 0 && content.trim().length > 0

  return (
    <form
      className="flex flex-col gap-3 rounded-md border bg-muted/20 p-4"
      onSubmit={(e) => {
        e.preventDefault()
        if (!canSubmit)
          return
        onSubmit({ name: name.trim(), description: description.trim(), type, content })
      }}
    >
      <div className="flex flex-col gap-1">
        <label className="text-xs font-medium text-muted-foreground">Name</label>
        <Input value={name} onChange={e => setName(e.target.value)} placeholder="my-note" />
      </div>
      <div className="flex flex-col gap-1">
        <label className="text-xs font-medium text-muted-foreground">Description</label>
        <Input value={description} onChange={e => setDescription(e.target.value)} placeholder="Short summary" />
      </div>
      <div className="flex flex-col gap-1">
        <label className="text-xs font-medium text-muted-foreground">Type</label>
        <select
          className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-sm"
          value={type}
          onChange={e => setType(e.target.value as MemoryType)}
        >
          {MEMORY_TYPES.map(t => (
            <option key={t} value={t} className="capitalize">{t}</option>
          ))}
        </select>
      </div>
      <div className="flex flex-col gap-1">
        <label className="text-xs font-medium text-muted-foreground">Content (Markdown)</label>
        <textarea
          className="min-h-32 w-full rounded-md border border-input bg-transparent px-3 py-2 text-sm shadow-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
          value={content}
          onChange={e => setContent(e.target.value)}
          placeholder="# Heading..."
        />
      </div>
      <div className="flex gap-2">
        <Button type="submit" size="sm" disabled={!canSubmit || isSubmitting}>
          {isSubmitting ? 'Saving...' : 'Create memory'}
        </Button>
        <Button type="button" size="sm" variant="outline" onClick={onCancel}>
          Cancel
        </Button>
      </div>
    </form>
  )
}
