export function parseMemoryIndex(raw: string): Array<{ title: string, filename: string, description: string }> {
  const entries: Array<{ title: string, filename: string, description: string }> = []
  const lines = raw.split('\n')

  for (const line of lines) {
    const match = line.match(/^- \[([^\]]+)\]\(([^)]+)\) (?:—|--) (.+)$/)
    if (match) {
      entries.push({
        title: match[1]!,
        filename: match[2]!,
        description: match[3]?.trim() ?? '',
      })
    }
  }

  return entries
}
