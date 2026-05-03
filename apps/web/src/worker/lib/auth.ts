/**
 * Bearer-token 引导（FEAT-035 §验收 8 / §笔记）。
 *
 * 三种部署形态：
 *
 * 1. **loopback dev**：`aiworker serve --open` 打开带 `#token=<bearer>` 的
 *    admin URL；手动打开 `/admin/` 且没有 session token 时，UI 进入锁定态。
 *    `/api/worker/*` 始终需要 bearer token，loopback 只影响静态 admin 能否访问。
 *
 * 2. **公网叠 Caddy basic-auth**：浏览器先过 basic-auth 才能进 `/admin/`。
 *    UI 启动时从 `location.hash` 读 `#token=<bearer>`：
 *      - 提取后立即写 sessionStorage 并把 hash 用 `history.replaceState` 清掉，
 *      - 后续所有 fetch 在 `Authorization: Bearer <token>` 里带它，
 *      - 绝不写 localStorage（跨 tab/重启泄漏面），也绝不出现在 query string
 *        （Caddy access log 会留痕）。
 *
 * 3. **测试场景**：测试可直接用 `setBearerToken` 注入；`__resetBearerForTests`
 *    清状态，避免跨用例污染。
 */

const STORAGE_KEY = 'aiworker.worker.bearer'
const HASH_PREFIX = '#token='

let cached: string | null | undefined

function readSessionStorage(): string | null {
  try {
    return globalThis.sessionStorage?.getItem(STORAGE_KEY) ?? null
  }
  catch {
    return null
  }
}

function writeSessionStorage(value: string | null): void {
  try {
    if (value === null)
      globalThis.sessionStorage?.removeItem(STORAGE_KEY)
    else
      globalThis.sessionStorage?.setItem(STORAGE_KEY, value)
  }
  catch {
    // sessionStorage 不可用——通常是私有模式或 sandbox。回退到模块级 cache，
    // 当前 tab 内部仍能继续；下次刷新需要重新带 hash。
  }
}

/**
 * 从 `window.location.hash` 抽 `#token=<...>` 并塞入 sessionStorage，然后用
 * `history.replaceState` 把 hash 清掉。
 *
 * 入口（`main.tsx`）启动 RouterProvider 之前调用一次即可——后续所有 fetch
 * 通过 `getBearerToken()` 拿到这次抽出来的 token。
 */
export function bootstrapBearerFromLocation(): void {
  if (typeof window === 'undefined')
    return
  const { location, history } = window
  if (!location?.hash?.startsWith(HASH_PREFIX))
    return

  const raw = location.hash.slice(HASH_PREFIX.length)
  const token = safeDecode(raw)
  clearTokenHash(location, history)
  if (!token || token.length === 0)
    return

  writeSessionStorage(token)
  cached = token
}

function safeDecode(value: string): string | null {
  try {
    return decodeURIComponent(value)
  }
  catch {
    return null
  }
}

function clearTokenHash(location: Location, history: History): void {
  // 立即清 hash——`replaceState` 不会触发 hashchange 也不会留浏览历史，
  // 配合 basic-auth + sessionStorage 的同源约束，token 只会留在当前 tab 进程里。
  try {
    history.replaceState(null, '', location.pathname + location.search)
  }
  catch {
    // 极端环境（document 已 unload 等）忽略。
  }
}

/**
 * 取当前 token：
 *   - `null` → Worker Admin 应保持锁定态，不主动调用受保护 API。
 *   - `string` → 后续 fetch 通过 `Authorization: Bearer <token>` 带上它。
 */
export function getBearerToken(): string | null {
  if (cached !== undefined)
    return cached
  cached = readSessionStorage()
  return cached
}

/** 测试或显式登出场景下使用。 */
export function setBearerToken(token: string | null): void {
  cached = token
  writeSessionStorage(token)
}

/** 清测试态——`apps/web/src/worker/__tests__/` 调。 */
export function __resetBearerForTests(): void {
  cached = undefined
  writeSessionStorage(null)
}
