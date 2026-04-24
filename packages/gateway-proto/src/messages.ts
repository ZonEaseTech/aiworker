import { z } from 'zod'
import { roleSchema } from './roles'

/**
 * connect：连接建立后客户端必须发的第一帧。
 * - operator 填 device id，node 填 workerId。
 * - auth.token 是 bearer token；loopback 场景允许空字符串。
 */
export const connectFrameSchema = z.object({
  type: z.literal('connect'),
  role: roleSchema,
  agentId: z.string().min(1),
  deviceId: z.string().min(1),
  auth: z.object({
    token: z.string(),
  }),
  meta: z.record(z.string()).optional(),
})
export type ConnectFrame = z.infer<typeof connectFrameSchema>

/**
 * request：operator → gateway（或经 gateway → node）的调用。
 * id 由发起端生成，response 必须回填同一 id。
 */
export const requestFrameSchema = z.object({
  type: z.literal('request'),
  id: z.string().min(1),
  method: z.string().min(1),
  params: z.unknown().optional(),
})
export type RequestFrame = z.infer<typeof requestFrameSchema>

/**
 * response：按 ok 布尔拆两种形态。
 * 成功：{ ok: true, result }
 * 失败：{ ok: false, error: { code, message, details? } }
 * 使用 discriminatedUnion 保证 ok=true 时没有 error、ok=false 时没有 result。
 */
export const responseErrorSchema = z.object({
  code: z.string().min(1),
  message: z.string(),
  details: z.unknown().optional(),
})
export type ResponseError = z.infer<typeof responseErrorSchema>

const responseOkSchema = z.object({
  type: z.literal('response'),
  id: z.string().min(1),
  ok: z.literal(true),
  result: z.unknown(),
})
const responseErrSchema = z.object({
  type: z.literal('response'),
  id: z.string().min(1),
  ok: z.literal(false),
  error: responseErrorSchema,
})

export const responseFrameSchema = z.discriminatedUnion('ok', [
  responseOkSchema,
  responseErrSchema,
])
export type ResponseFrame = z.infer<typeof responseFrameSchema>

/**
 * event：gateway → operator 推送。payload 结构由 `EVENTS`/`EVENT_PAYLOADS` 约束。
 * 本层只保证结构合法，具体 payload 类型交给 events.ts 的 EVENT_PAYLOADS 校验。
 */
export const eventFrameSchema = z.object({
  type: z.literal('event'),
  name: z.string().min(1),
  payload: z.unknown(),
  ts: z.number().int(),
})
export type EventFrame = z.infer<typeof eventFrameSchema>

/** 所有合法帧的联合类型。 */
export type Frame = ConnectFrame | RequestFrame | ResponseFrame | EventFrame

/**
 * FrameSchema：按 `type` 字段先分派，再在 type=response 时按 `ok` 做第二层判别。
 * 注意：不能直接用 z.discriminatedUnion('type', ...) 把 responseOk / responseErr 展开为两支，
 * 因为它们在 type 上共用同一个 literal 'response'，zod 会抛
 * `Discriminator property type has duplicate value response`。
 * 因此外层用 z.union，两个 response 分支由内部 discriminatedUnion 保证互斥。
 */
export const FrameSchema: z.ZodType<Frame> = z.union([
  connectFrameSchema,
  requestFrameSchema,
  responseFrameSchema,
  eventFrameSchema,
])

export type ParseResult
  = | { ok: true, frame: Frame }
    | { ok: false, error: string }

/**
 * 从入站的原始字符串解析成 Frame。
 * - 非 JSON → `{ ok: false, error: 'invalid_json:...' }`
 * - 结构非法 → `{ ok: false, error: 'schema:...' }`
 * - 通过 → `{ ok: true, frame }`
 */
export function parseFrame(raw: string): ParseResult {
  let json: unknown
  try {
    json = JSON.parse(raw)
  }
  catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    return { ok: false, error: `invalid_json:${msg}` }
  }

  const parsed = FrameSchema.safeParse(json)
  if (!parsed.success) {
    return { ok: false, error: `schema:${parsed.error.message}` }
  }
  return { ok: true, frame: parsed.data }
}

/** 把 Frame 编码成出站字符串（JSON）。 */
export function encodeFrame(frame: Frame): string {
  return JSON.stringify(frame)
}
