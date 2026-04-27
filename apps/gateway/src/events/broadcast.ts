import type { EventFrame } from '@zonease/aiworker-gateway-proto'
import type { OperatorRegistry } from '../registry'
import { encodeFrame } from '@zonease/aiworker-gateway-proto'

/**
 * 把一条 node 上行的 event 帧广播给所有当前 operator 连接。
 *
 * PLAN-013 S2 策略：**全量广播**——每个 operator 都会收到所有 node 的所有
 * event。好处是协议与 registry 都极简，smoke 也好写；坏处是扩展到多 worker +
 * 多 operator 之后带宽浪费。S5 会加一层订阅过滤（按 workerId / event name），
 * `ConnectionData.subscribedAll` 字段已经预留了扩展点。
 */
export function broadcastEventToOperators(
  operators: OperatorRegistry,
  frame: EventFrame,
): void {
  const raw = encodeFrame(frame)
  operators.forEach((entry) => {
    try {
      entry.ws.send(raw)
    }
    catch {
      // 该 operator 已经断线——close 回调里会清理 registry。
    }
  })
}
