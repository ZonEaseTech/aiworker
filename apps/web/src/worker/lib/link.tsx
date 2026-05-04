import type { LinkComponentProps } from '@tanstack/react-router'
import { Link as TSLink } from '@tanstack/react-router'

/**
 * worker 视角 Link 包装。
 *
 * 背景：apps/web 单 tsconfig 同时编 fleet + worker，fleet/main.tsx 用
 * `declare module '@tanstack/react-router' { interface Register { router: typeof router } }`
 * 声明了全局 router 类型——这让 worker 视角 import 的 `<Link>` 把 `to` 绑死成
 * 「fleet 的 routes」（`/`, `/workers`, `/workers/$workerId`）。重复 declare
 * 会触发 TS2717，所以 worker 不能再 declare 一次。
 *
 * 折中：worker 内部用本组件，把 to 限定在 worker 自己的路径字符串集合上，
 * 内部对 TanStack Link 的 to prop 单点 `as never`。等 REFACTOR-009 (Phase 4)
 * 决定是否拆 tsconfig.fleet.json / tsconfig.worker.json 时再统一收掉。
 */
export type WorkerPath
  = | '/'
    | '/config'
    | '/secrets'
    | '/test'
    | '/cron'
    | '/approvals'
    | '/chat'
    | '/brain'

export function WorkerLink(props: { to: WorkerPath } & Omit<LinkComponentProps, 'to'>) {
  const { to, ...rest } = props
  return <TSLink to={to as never} {...rest} />
}
