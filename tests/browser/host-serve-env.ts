// Host 浏览器证明给被 spawn 的 Host 一个**干净 env**：清空根 `.env` 注入的整套
// `AIWORKER_HOST_*` 与 `LOGTO_*` source-checkout dev profile，使 spec 自己的显式 CLI flags
// （`--port` / `--public-base-url` / `--db` / `--dev-admin-email` …）成为唯一真相源。
//
// 为什么必须清：根 `.env` 是 source-checkout dev profile，Bun 会在每个子进程启动时自动加载它。
// 若放任继承，它会从两个方向破坏测试：
//   1) Logto 登录门：`AIWORKER_HOST_SESSION_SECRET` / `LOGTO_*` 让 buildSessionAuthFromEnv
//      （apps/host-cli/src/aiworker-host.ts）装配 sessionAuth、抢占 `--dev-admin-email`
//      （dev-admin 仅在 `!sessionAuth` 生效）→ `/host` 重定向到 auth.zonease.org 真 Logto
//      → 测试无法完成真 OIDC（随机端口 redirect_uri 未注册）→ Logto 返 400。
//   2) 端口/URL 错配：`AIWORKER_HOST_API_URL=http://127.0.0.1:9117` 经
//      `readNonEmptyEnvValue(process.env,'AIWORKER_HOST_API_URL')` 成为 publicBaseUrl，覆盖
//      dev-host.sh 的 healthcheck URL 为 9117，而 daemon 按 spec 的 `--port`（reserved 口）绑定
//      → healthcheck 永远打不到 daemon → 超时。
//
// 清空（显式空串，非 delete——Bun 会重新读 `.env` 文件；空串才能覆盖自动加载）后，host-lifecycle
// 由 CLI flags 重新派生 `AIWORKER_HOST_API_URL`/`AIWORKER_HOST_API_PORT` 等并显式传给 dev-host.sh，
// dev-host.sh 对未设项各有默认值，daemon 走 dev-admin 静态壳直渲。
//
// 产品登录门**不受影响**：配齐 Logto env 的真实部署里 `/host` 仍强制登录——该门由
// apps/host-cli/src/host-server.test.ts（302 重定向 / 403）单测覆盖；本 dev-serve 浏览器证明
// 验的是 Host web app 的渲染/同源服务契约，与 Logto 登录流正交。
const HOST_ENV_PREFIXES = ['AIWORKER_HOST_', 'LOGTO_'] as const

/**
 * 基于 base（默认 process.env）构造一个强制 dev-admin 模式、零 dev-profile 泄漏的 Host spawn 环境：
 * 保留全部非 Host/Logto 继承变量，把每个 AIWORKER_HOST_* / LOGTO_* 键显式置空。
 */
export function devAdminHostEnv(base: Record<string, string | undefined> = process.env): Record<string, string> {
  const env: Record<string, string> = {}
  for (const [key, value] of Object.entries(base)) {
    if (value === undefined)
      continue
    env[key] = HOST_ENV_PREFIXES.some(prefix => key.startsWith(prefix)) ? '' : value
  }
  return env
}
