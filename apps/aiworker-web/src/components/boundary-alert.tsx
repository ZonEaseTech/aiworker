import { WarningCircleIcon } from '@phosphor-icons/react'

import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'

export function BoundaryAlert() {
  return (
    <Alert>
      <WarningCircleIcon weight="duotone" />
      <AlertTitle>员工使用入口在 Paseo</AlertTitle>
      <AlertDescription>
        这个页面只帮管理员开通和跟踪员工的 AIWorker。员工真正使用 AIWorker、查看对话和处理权限，都在 Paseo 客户端里完成。
      </AlertDescription>
    </Alert>
  )
}
