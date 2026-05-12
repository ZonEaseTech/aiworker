export type WorkbenchStatusTone = 'good' | 'muted' | 'risk' | 'warn'

export function WorkbenchStatusCell({ label, tone }: { label: string, tone: WorkbenchStatusTone }) {
  return (
    <span className={`workbench-status-cell ${tone}`}>{label}</span>
  )
}
