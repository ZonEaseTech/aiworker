import { chmod, readFile, rm, writeFile } from 'node:fs/promises'
import path from 'node:path'

/**
 * 持久 Worker Access 重连状态(全仓首个 0600 secret 文件范式)。
 *
 * 背景:Worker Access 反向 tunnel 的 hello 帧要求三元组 {assignmentId, workerId, token}
 * (见 worker-control-protocol `workerAccessHelloFrameSchema`),且 token 是受 TTL/可撤销
 * 约束的 capability token(授权本 worker 重连自己的 tunnel,不授 LLM 访问)。其中 assignmentId
 * 只在一次性 check-in 响应里出现——本地没有别的来源。因此重连必须落盘的最小集 = access(mode+token)
 * + assignment(assignmentId+workerId)。first-provision(CLI 引导)与 daemon 重启都从这个文件读回,
 * 跳过重复 check-in(provision token 单次消费,重 check-in 必 401)。
 *
 * secret 边界:这是一个本地 0600 文件信任域,区别于「DB/descriptor/receipt/log 不存字面 secret」。
 * 范式 = `writeFile(path, json, {mode:0o600})` + 之后 `chmod(0o600)` 兜底(部分平台 umask 会让
 * 写入 mode 失真)。**Windows 的 chmod 是 no-op,无头 Windows worker 不在 v1 分发范围 → 显式 out-of-scope**。
 *
 * 脱敏:access token 无前缀,engine-bridge 共享的 provider-shaped 正则抓不住它 → 这里做**字段级/
 * 已知值脱敏**(`redactWorkerAccessToken(text, token)`),任何 log/diagnostic 路径打印含 token 的文本前
 * 必须先过它。绝不在任何 log/diagnostic 打印 token 明文。
 */

const ACCESS_TOKEN_FILENAME = 'access-token'
const ACCESS_TOKEN_FILE_MODE = 0o600

export interface PersistedWorkerAccess {
  access: {
    mode: 'worker_access'
    token: string
  }
  assignment: {
    assignmentId: string
    workerId: string
  }
}

/** `<worker-home>/access-token`。两侧(CLI 引导 + daemon boot)必须从同一 worker-home 派生此路径。 */
export function persistedWorkerAccessPath(workerHome: string): string {
  return path.join(workerHome, ACCESS_TOKEN_FILENAME)
}

/**
 * 落盘重连三元组到 `<worker-home>/access-token`,0600 + chmod 兜底。
 */
export async function persistWorkerAccess(workerHome: string, value: PersistedWorkerAccess): Promise<void> {
  const file = persistedWorkerAccessPath(workerHome)
  const body = JSON.stringify({
    access: { mode: value.access.mode, token: value.access.token },
    assignment: { assignmentId: value.assignment.assignmentId, workerId: value.assignment.workerId },
  })
  await writeFile(file, body, { mode: ACCESS_TOKEN_FILE_MODE })
  // chmod 兜底:某些平台/umask 下 writeFile 的 mode 不可靠。Windows 为 no-op(out-of-scope,见模块注释)。
  await chmod(file, ACCESS_TOKEN_FILE_MODE).catch(() => undefined)
}

/**
 * 读回持久重连三元组;文件不存在/不可读/结构非法 → 返回 null(由调用方决定降级)。
 */
export async function readPersistedWorkerAccess(workerHome: string): Promise<PersistedWorkerAccess | null> {
  const file = persistedWorkerAccessPath(workerHome)
  let raw: string
  try {
    raw = await readFile(file, 'utf8')
  }
  catch {
    return null
  }
  try {
    const parsed = JSON.parse(raw) as Partial<PersistedWorkerAccess>
    const token = parsed.access?.token
    const mode = parsed.access?.mode
    const assignmentId = parsed.assignment?.assignmentId
    const workerId = parsed.assignment?.workerId
    if (mode !== 'worker_access' || !token || !assignmentId || !workerId)
      return null
    return {
      access: { mode: 'worker_access', token },
      assignment: { assignmentId, workerId },
    }
  }
  catch {
    return null
  }
}

/**
 * 删除持久 token 文件(撤销/失败恢复用)。文件不存在为 no-op,不抛。
 */
export async function clearPersistedWorkerAccess(workerHome: string): Promise<void> {
  await rm(persistedWorkerAccessPath(workerHome), { force: true })
}

/**
 * 字段级脱敏:把已知 access token 明文从一段文本中替换为占位符。token 为空或文本不含它时原样返回。
 * 任何会打印含 token 文本的 log/diagnostic 路径必须先过它。
 */
export function redactWorkerAccessToken(text: string, token: string): string {
  if (!token)
    return text
  return text.split(token).join('[REDACTED_ACCESS_TOKEN]')
}
