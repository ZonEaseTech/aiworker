import type { AuthGateState } from '@/lib/admin-session'
import { ShieldCheckIcon, SignInIcon, WarningCircleIcon } from '@phosphor-icons/react'
import { useEffect, useState } from 'react'
import { Button } from '@/components/ui/button'
import { appendReturnTo, fetchAdminSessionStatus, resolveAuthGateState } from '@/lib/admin-session'

type GateStatus
  = | { phase: 'loading' }
    | { phase: 'resolved', state: AuthGateState }

/**
 * 客户端登录墙：在渲染管理台之前，先用 `/api/auth/session` 判断当前会话是否被授权。
 *
 * - local 模式（无 Logto / loginRequired=false）永远放行，保留本地 fixture 预览。
 * - 真正需要登录的模式（locked / logto）未登录时整页拦截，要求先登录。
 * - session 接口请求失败时 fail-open 放行，避免把人锁在自己的服务外（控制面错误交由内部横幅处理）。
 *
 * 真正的访问控制边界在服务端：`adminHtmlNavigationGuard` 已经在整页导航时重定向到
 * `/login`，且每个 `/api/*` 路由都过 `authorizeAdminRead`。本组件只是 SPA 侧的纵深防御与
 * UX 层（覆盖 SPA 内部导航与会话过期场景），对齐 Next.js「middleware 门禁 + 登录页」的惯例；
 * 因此 session 探测失败时放行是安全的——服务端仍会拦截任何未授权数据访问。
 */
export function AuthGate({ children }: { children: React.ReactNode }) {
  const [status, setStatus] = useState<GateStatus>({ phase: 'loading' })

  useEffect(() => {
    const controller = new AbortController()
    fetchAdminSessionStatus(controller.signal)
      .then((session) => {
        setStatus({ phase: 'resolved', state: resolveAuthGateState(session) })
      })
      .catch(() => {
        // 探测被取消（卸载）时不更新状态；其余失败 fail-open 放行，服务端仍是真正的边界。
        if (!controller.signal.aborted)
          setStatus({ phase: 'resolved', state: { kind: 'authorized' } })
      })
    return () => {
      controller.abort()
    }
  }, [])

  if (status.phase === 'loading')
    return <AuthGateShell><p className="text-sm text-muted-foreground">正在验证登录状态…</p></AuthGateShell>

  if (status.state.kind === 'authorized')
    return <>{children}</>

  if (status.state.kind === 'misconfigured') {
    return (
      <AuthGateShell>
        <WallCard
          icon={<WarningCircleIcon weight="duotone" className="size-8 text-destructive" />}
          title="登录服务未正确配置"
          detail="Logto 运行时变量配置不完整，无法发起登录。请运行 Logto 配置脚本并重启服务后重试。"
        />
      </AuthGateShell>
    )
  }

  const loginUrl = appendReturnTo(status.state.loginUrl)
  const signedInEmail = status.state.userEmail
  return (
    <AuthGateShell>
      <WallCard
        icon={<ShieldCheckIcon weight="duotone" className="size-8 text-primary" />}
        title="需要登录后才能使用"
        detail={
          signedInEmail
            ? `当前账号 ${signedInEmail} 没有访问 AIWorker 管理台的权限。请改用获授权的管理员账号登录。`
            : 'AIWorker 管理台仅向已登录的管理员开放。请先登录以继续。'
        }
      >
        <Button asChild size="lg" className="mt-1 w-full">
          <a href={loginUrl}>
            <SignInIcon data-icon="inline-start" weight="bold" />
            登录
          </a>
        </Button>
      </WallCard>
    </AuthGateShell>
  )
}

function AuthGateShell({ children }: { children: React.ReactNode }) {
  return (
    <div className="grid min-h-svh w-full place-items-center bg-background p-6">
      {children}
    </div>
  )
}

function WallCard({
  icon,
  title,
  detail,
  children,
}: {
  icon: React.ReactNode
  title: string
  detail: string
  children?: React.ReactNode
}) {
  return (
    <div className="flex w-full max-w-sm flex-col items-center gap-4 rounded-xl border bg-card p-8 text-center shadow-sm">
      <div className="flex size-14 items-center justify-center rounded-full bg-muted">{icon}</div>
      <div className="space-y-1.5">
        <h1 className="text-base font-semibold text-foreground">{title}</h1>
        <p className="text-sm leading-relaxed text-muted-foreground">{detail}</p>
      </div>
      {children}
    </div>
  )
}
