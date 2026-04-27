import type { ServerWebSocket } from 'bun'
import type { GatewayConfig } from './config'
import type { ConnectionData, ConnectionPath } from './registry/types'
import type { GatewayContext } from './router/context'
import { Buffer } from 'node:buffer'
import { createHash } from 'node:crypto'
import { encodeFrame, EVENTS, parseFrame } from '@aiworker/gateway-proto'
import { isLoopbackAddress } from './auth/loopback'
import { authorizeConnection } from './auth/token'
import { broadcastEventToOperators } from './events/broadcast'
import { dispatchNodeEvent, dispatchNodeResponse, dispatchOperatorRequest } from './router/dispatch'

/** Bun.Server 泛型绑定 ConnectionData，便于后续 ws.data 强类型。 */
type GatewayServerHandle = ReturnType<typeof Bun.serve<ConnectionData>>

/** 启动结果，交给 index.ts / 测试 / smoke 管理生命周期。 */
export interface StartedGateway {
  server: GatewayServerHandle
  /** 实际监听的端口；启动时传 0 会由 OS 随机分配，这里读回真实端口。 */
  port: number
  context: GatewayContext
  stop: () => Promise<void>
}

export interface StartGatewayOptions {
  config: GatewayConfig
  context: GatewayContext
}

/**
 * 启动一个 gateway WS 服务。`fetch` handler 负责升级；`websocket` handler
 * 承载完整生命周期。
 *
 * 路径约定：
 * - `GET /health` — 纯 JSON 心跳；loopback 运维可用。
 * - `GET /ws`（with Upgrade）— operator + 已配对 worker 的 WS 升级入口。
 * - `GET /enroll-ws`（with Upgrade，PLAN-019）— OTP 自助入网专用通道；
 *   gateway 仅接受 `enroll.mode='otp'` 的 connect，其它一律 close。Caddy 在
 *   该 path 上不挂 basic-auth，把"陌生 worker"的入网面与 operator 通道隔开。
 * - 其它路径：404。
 */
export function startGatewayServer(options: StartGatewayOptions): StartedGateway {
  const { config, context } = options

  const server = Bun.serve<ConnectionData>({
    port: config.port,
    hostname: config.host,
    fetch(req, serverRef) {
      const url = new URL(req.url)
      if (url.pathname === '/health') {
        return new Response(
          JSON.stringify({ ok: true, service: 'aiworker-gateway', ts: Date.now() }),
          { status: 200, headers: { 'Content-Type': 'application/json' } },
        )
      }
      if (url.pathname === '/ws' || url.pathname === '/enroll-ws') {
        const ip = serverRef.requestIP(req)
        const remoteAddress = ip?.address
        const loopback = isLoopbackAddress(remoteAddress)
        const path: ConnectionPath = url.pathname === '/enroll-ws' ? '/enroll-ws' : '/ws'
        const upgraded = serverRef.upgrade(req, {
          data: {
            role: undefined,
            agentId: undefined,
            deviceId: undefined,
            loopback,
            remoteAddress,
            connectedAt: Date.now(),
            subscribedAll: true,
            path,
          } satisfies ConnectionData,
        })
        if (upgraded)
          return undefined
        return new Response('upgrade failed', { status: 400 })
      }
      return new Response('not found', { status: 404 })
    },
    websocket: {
      open(ws) {
        context.logger.debug(
          `[gateway] ws opened (remote=${ws.data.remoteAddress ?? '?'} loopback=${ws.data.loopback})`,
        )
      },
      message(ws, raw) {
        handleMessage(ws, raw, context, config)
      },
      close(ws, code, reason) {
        handleClose(ws, code, reason, context)
      },
    },
  })

  const listeningPort = server.port
  if (typeof listeningPort !== 'number') {
    // 仅当绑定到 unix socket 时才会返回 undefined；gateway 不支持这种模式。
    throw new TypeError('Bun.serve did not return a TCP port — unix socket is not supported')
  }
  return {
    server,
    port: listeningPort,
    context,
    stop: async () => {
      context.forwards.dispose()
      context.pending?.dispose()
      await server.stop(true)
    },
  }
}

function handleMessage(
  ws: ServerWebSocket<ConnectionData>,
  raw: string | Buffer,
  ctx: GatewayContext,
  config: GatewayConfig,
): void {
  const text = typeof raw === 'string' ? raw : Buffer.from(raw).toString('utf8')
  const parsed = parseFrame(text)
  if (!parsed.ok) {
    ctx.logger.warn(`[gateway] 无法解析帧: ${parsed.error}`)
    ws.close(4400, 'bad_frame')
    return
  }
  const frame = parsed.frame

  // === 握手前：必须先收到 connect 帧 ===
  if (ws.data.role === undefined) {
    if (frame.type !== 'connect') {
      ctx.logger.warn(`[gateway] 握手前收到非 connect 帧: ${frame.type}`)
      ws.close(4400, 'connect_required')
      return
    }
    // PLAN-019：mode='otp' 的 enroll 不走 join-token 验签——只在 /enroll-ws 路径
    // 上有效，且 operator 端 approve 之前不应被认作 self-enroll。
    const enrollMode = frame.role === 'node' && frame.enroll
      ? (frame.enroll.mode ?? 'join-token')
      : undefined
    const isOtpEnrollSubmit = enrollMode === 'otp'
    const isSelfEnroll = frame.role === 'node'
      && frame.enroll !== undefined
      && enrollMode === 'join-token'
    const authResult = authorizeConnection({
      loopback: ws.data.loopback,
      sharedSecret: config.internalSharedSecret,
      presentedToken: frame.auth.token,
      enrollToken: isSelfEnroll ? frame.enroll!.joinToken : undefined,
      gatewayJoinToken: config.joinToken,
      path: ws.data.path,
      isOtpEnrollSubmit,
    })
    if (!authResult.ok) {
      // wrong_path:* 是协议层失败（4400），不是 token 失败（4401）。
      const isWrongPath = authResult.reason.startsWith('wrong_path:')
      ctx.persistence.recordAudit({
        actor: 'gateway',
        action: 'gateway.connect.rejected',
        workerId: frame.role === 'node' ? frame.agentId : null,
        detail: {
          reason: authResult.reason,
          role: frame.role,
          agentId: frame.agentId,
          remoteAddress: ws.data.remoteAddress,
          path: ws.data.path,
        },
      })
      const code = isWrongPath ? 4400 : 4401
      const reason = isWrongPath ? authResult.reason : `auth:${authResult.reason}`
      ws.close(code, reason)
      return
    }

    // PLAN-019：OTP submit 分支 —— 不进 NodeRegistry，挂 pending 队列等 approve。
    if (authResult.via === 'enroll-otp') {
      if (!ctx.pending) {
        ctx.logger.error('[gateway] /enroll-ws 收到 OTP submit 但 ctx.pending 未注入')
        ws.close(4500, 'enroll_unavailable')
        return
      }
      const enroll = frame.enroll!
      const submission = ctx.pending.submit({
        workerId: frame.agentId,
        apiToken: enroll.apiToken,
        displayName: enroll.displayName,
        ws,
      })
      try {
        ws.send(encodeFrame({
          type: 'event',
          name: EVENTS.ENROLLMENT_OTP,
          payload: {
            workerId: frame.agentId,
            otp: submission.otp,
            expiresAt: submission.expiresAt,
          },
          ts: Date.now(),
        }))
      }
      catch (err) {
        // 推送 OTP 失败 → worker 永远拿不到 OTP，留 pending 是悬挂行。
        // 立即清表 + close ws，让 worker 端走重连重试，避免 silent hang。
        ctx.pending.removeByWs(ws)
        ctx.logger.warn(`[gateway] 推送 enrollment.otp 失败: ${(err as Error).message}`)
        ws.close(4500, 'enroll_otp_send_failed')
        return
      }
      ws.data.role = 'node-pending'
      ws.data.agentId = frame.agentId
      ws.data.deviceId = frame.deviceId
      ctx.persistence.recordAudit({
        actor: 'gateway',
        action: 'gateway.enrollment.requested',
        workerId: frame.agentId,
        detail: {
          workerId: frame.agentId,
          displayName: enroll.displayName,
          deviceId: frame.deviceId,
          // 仅落 OTP 哈希前缀，避免明文 OTP 进 audit 表（PLAN-019 §Risks
          // "OTP shoulder-surfing"）。
          otpHash: hashOtpForAudit(submission.otp),
          expiresAt: submission.expiresAt,
          path: ws.data.path,
        },
      })
      return
    }

    // self-enroll 通过 join token 验签后,先查配额再 upsert fleet 行;失败一律
    // 走 connect.rejected 链路,与 token 错误的口径保持一致。
    if (isSelfEnroll) {
      if (ctx.maxWorkers !== undefined) {
        const current = ctx.persistence.countRegisteredWorkers()
        // 已注册过的 workerId 重连不占配额(它已在 fleet 里)。
        const alreadyRegistered = ctx.persistence.getRegisteredWorker(frame.agentId) !== undefined
        if (!alreadyRegistered && current >= ctx.maxWorkers) {
          ctx.persistence.recordAudit({
            actor: 'gateway',
            action: 'gateway.connect.rejected',
            workerId: frame.agentId,
            detail: {
              reason: 'quota_exceeded',
              role: frame.role,
              agentId: frame.agentId,
              limit: ctx.maxWorkers,
              current,
            },
          })
          ws.close(4401, 'auth:quota_exceeded')
          return
        }
      }
      if (!ctx.masterKeyHex) {
        // self-enroll 需要 masterKey 才能加密落 apiToken;否则只能拒。
        ctx.persistence.recordAudit({
          actor: 'gateway',
          action: 'gateway.connect.rejected',
          workerId: frame.agentId,
          detail: {
            reason: 'master_key_missing',
            role: frame.role,
            agentId: frame.agentId,
          },
        })
        ws.close(4401, 'auth:master_key_missing')
        return
      }
      const enroll = frame.enroll!
      const upsert = ctx.persistence.upsertEnrolledWorker(
        {
          workerId: frame.agentId,
          baseUrl: '',
          apiToken: enroll.apiToken,
          displayName: enroll.displayName ?? frame.agentId,
          addedBy: 'self-enroll',
        },
        ctx.masterKeyHex,
      )
      if (upsert.kind !== 'unchanged') {
        ctx.persistence.recordAudit({
          actor: 'gateway',
          action: 'gateway.worker.enrolled',
          workerId: frame.agentId,
          detail: {
            workerId: frame.agentId,
            displayName: upsert.row.displayName,
            deviceId: frame.deviceId,
            change: upsert.kind,
          },
        })
      }
    }

    ws.data.role = frame.role
    ws.data.agentId = frame.agentId
    ws.data.deviceId = frame.deviceId

    if (frame.role === 'operator') {
      ctx.operators.register({
        agentId: frame.agentId,
        deviceId: frame.deviceId,
        ws,
        connectedAt: Date.now(),
      })
    }
    else {
      // role === 'node'
      const { replaced } = ctx.nodes.register({
        workerId: frame.agentId,
        deviceId: frame.deviceId,
        ws,
        pairedAt: Date.now(),
        meta: frame.meta ?? {},
      })
      if (replaced) {
        ctx.forwards.cancelByWorker(frame.agentId)
        try {
          replaced.ws.close(1012, 'replaced_by_new_node_connection')
        }
        catch { /* 关老连接失败不影响新连接 */ }
      }
      // 对 operator 广播 worker.online。
      const displayName = ctx.persistence.getRegisteredWorker(frame.agentId)?.displayName
      broadcastEventToOperators(ctx.operators, {
        type: 'event',
        name: EVENTS.WORKER_ONLINE,
        payload: {
          workerId: frame.agentId,
          displayName,
          deviceId: frame.deviceId,
          connectedAt: Date.now(),
        },
        ts: Date.now(),
      })
    }

    ctx.persistence.recordAudit({
      actor: 'gateway',
      action: 'gateway.connect.accepted',
      workerId: frame.role === 'node' ? frame.agentId : null,
      detail: {
        role: frame.role,
        agentId: frame.agentId,
        deviceId: frame.deviceId,
        loopback: ws.data.loopback,
        via: authResult.via,
      },
    })
    return
  }

  // === 握手后：按 role + frame.type 分流 ===
  // PLAN-019：node-pending 是 OTP 中间态——尚未升级为 node，不允许发送任何
  // request / response / event 帧。仅监听 close + 等 enroll.approve 触发的 push。
  if (ws.data.role === 'node-pending') {
    ctx.logger.warn(`[gateway] node-pending 端在 approve 前发送了 ${frame.type} 帧，忽略`)
    return
  }

  if (ws.data.role === 'operator') {
    if (frame.type === 'request') {
      const agentId = ws.data.agentId ?? 'unknown'
      void dispatchOperatorRequest(ctx, ws, frame, agentId)
      return
    }
    ctx.logger.warn(`[gateway] operator 端发送了非 request 帧: ${frame.type}`)
    ws.close(4400, 'operator_expects_request_only')
    return
  }

  if (ws.data.role === 'node') {
    if (frame.type === 'response') {
      dispatchNodeResponse(ctx, ws, frame)
      return
    }
    if (frame.type === 'event') {
      // 入站 event：广播给所有 operator。
      dispatchNodeEvent(ctx, ws, frame)
      return
    }
    ctx.logger.warn(`[gateway] node 端发送了非 response/event 帧: ${frame.type}`)
    ws.close(4400, 'node_expects_response_or_event_only')
  }
}

function handleClose(
  ws: ServerWebSocket<ConnectionData>,
  code: number,
  reason: string,
  ctx: GatewayContext,
): void {
  if (ws.data.role === 'node-pending') {
    // PLAN-019：worker 在 approve 前掉线——把 pending 队列里的占位清掉。
    // approve / reject 路径在 S2 handler 内已经先 deleteEntry 了，所以这里
    // removeByWs 通常 returns undefined（幂等）。
    const entry = ctx.pending?.removeByWs(ws)
    if (entry) {
      ctx.persistence.recordAudit({
        actor: 'gateway',
        action: 'gateway.enrollment.abandoned',
        workerId: entry.workerId,
        detail: {
          workerId: entry.workerId,
          displayName: entry.displayName,
          code,
          reason,
        },
      })
    }
    ctx.logger.debug(`[gateway] node-pending ws closed (code=${code} reason=${reason})`)
    return
  }
  if (ws.data.role === 'operator') {
    ctx.operators.unregister(ws)
    ctx.forwards.cancelByOperator(ws)
  }
  else if (ws.data.role === 'node') {
    const entry = ctx.nodes.unregisterByWs(ws)
    if (entry) {
      ctx.forwards.cancelByWorker(entry.workerId)
      broadcastEventToOperators(ctx.operators, {
        type: 'event',
        name: EVENTS.WORKER_OFFLINE,
        payload: {
          workerId: entry.workerId,
          deviceId: entry.deviceId,
          reason: inferOfflineReason(code),
          disconnectedAt: Date.now(),
        },
        ts: Date.now(),
      })
      ctx.persistence.recordAudit({
        actor: 'gateway',
        action: 'gateway.node.disconnected',
        workerId: entry.workerId,
        detail: { code, reason },
      })
    }
  }
  ctx.logger.debug(`[gateway] ws closed (code=${code} reason=${reason})`)
}

/**
 * 把 WebSocket close code 映射到 proto 约定的 offline 原因。
 * 1000 正常关闭 / 1012 服务主动替换 → 归为 disconnected；4xxx 归为 kicked；
 * 其它未归类按 expired 记。
 */
function inferOfflineReason(code: number): 'disconnected' | 'expired' | 'kicked' | undefined {
  if (code === 1000 || code === 1012 || code === 1001 || code === 1005 || code === 1006)
    return 'disconnected'
  if (code >= 4000 && code < 5000)
    return 'kicked'
  return 'expired'
}

/**
 * PLAN-019 §Risks "OTP shoulder-surfing"：明文 OTP 不允许进 audit 表。仅取
 * sha256 前 8 hex 作 fingerprint，足够对账某次 approve/reject 与 submit 配对，
 * 但反推不出原 OTP。
 *
 * 后续可被审计的 audit action 列表（grep 锚点，方便排障）：
 *   gateway.enrollment.requested  — OTP submit（S3 写入，本文件）
 *   gateway.enrollment.approved   — operator approve（S2 enroll handler 写入）
 *   gateway.enrollment.rejected   — operator reject（S2 enroll handler 写入）
 *   gateway.enrollment.expired    — TTL 过期（S2 onExpire 写入）
 *   gateway.enrollment.abandoned  — pending 期间 worker 掉线（S3 写入，本文件）
 */
function hashOtpForAudit(otp: string): string {
  return createHash('sha256').update(otp).digest('hex').slice(0, 8)
}

// 用于测试：把已暴露的 handleMessage / handleClose 命名导出。
export { handleClose as __handleCloseForTest, handleMessage as __handleMessageForTest }
