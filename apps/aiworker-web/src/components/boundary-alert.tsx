import { WarningCircleIcon } from '@phosphor-icons/react'

import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'

export function BoundaryAlert() {
  return (
    <Alert>
      <WarningCircleIcon weight="duotone" />
      <AlertTitle>运行时边界</AlertTitle>
      <AlertDescription>
        AIWorker Web 是管理员 control-plane。它可以准备 assignment 与 handoff 元数据，但 workspace UI、session、日志、权限以及 provider 进程生命周期都归 Paseo 所有。
      </AlertDescription>
    </Alert>
  )
}
