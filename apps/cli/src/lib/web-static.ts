import { existsSync, realpathSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import process from 'node:process'
import { fileURLToPath } from 'node:url'

/**
 * `apps/web/dist/{fleet,worker}/` 静态资源解析器（PLAN-022 / FEAT-033）。
 *
 * 解析顺序：
 * 1. ENV 显式覆盖：`AIWORKER_WEB_STATIC_DIR_FLEET` / `AIWORKER_WEB_STATIC_DIR_WORKER`。
 *    给 ops 一条强制旁路（譬如反代单独同步过来的资源目录）。注意：env 路径
 *    必须由 ops 自己保证非可写、不含到 fleet/worker bundle 之外的 symlink；
 *    本模块通过 `realpathSync` 把链接解析后再次 existsSync 兜底，但不强制
 *    chroot——ops 设错路径相当于打开本机文件浏览器。
 * 2. cli binary 同级 `<dist>/web/{fleet,worker}/`。这是 npm install 后的标准
 *    布局——`apps/cli/scripts/build-publish-manifest.ts` 把 `apps/web/dist/`
 *    复制到 `apps/cli/dist/web/`，npm pack 时整个 dist/ 都进 tarball。
 * 3. monorepo dev 路径 `<repo>/apps/web/dist/{fleet,worker}/`。本地源码跑
 *    `bun src/aiworker.ts` 时走这条。
 *
 * 找不到 → 返回 undefined。调用方（gateway / worker bootstrap）收到 undefined
 * 时**必须容错**：`/admin/*` 直接 404，但**不阻塞启动**——这与 `--no-serve-web`
 * 显式禁用是同一行为。
 */
export type WebBundle = 'fleet' | 'worker'

export function resolveWebStaticDir(bundle: WebBundle): string | undefined {
  // 1) ENV 显式覆盖：必须含 index.html 才视为有效。
  const envKey = bundle === 'fleet'
    ? 'AIWORKER_WEB_STATIC_DIR_FLEET'
    : 'AIWORKER_WEB_STATIC_DIR_WORKER'
  const envValue = process.env[envKey]
  if (envValue) {
    const candidate = safeResolve(envValue)
    if (candidate && existsSync(resolve(candidate, 'index.html')))
      return candidate
  }

  const cliBinDir = getCliBinDir()
  if (!cliBinDir)
    return undefined

  // 2) npm install 布局：<cli-bin>/web/<bundle>/index.html
  //    cliBinDir 形如 `<node_modules>/@zonease/aiworker-cli/dist/`。
  const npmCandidate = resolve(cliBinDir, 'web', bundle)
  if (existsSync(resolve(npmCandidate, 'index.html')))
    return npmCandidate

  // 3) monorepo dev 布局：dev 用 `bun src/aiworker.ts`，cliBinDir 是
  //    `<repo>/apps/cli/src/lib/`（本文件所在目录）—— ../../../../  →  <repo>。
  //    prod 用 `node dist/aiworker.js`，cliBinDir 是 `<repo>/apps/cli/dist/`
  //    —— ../../../  →  <repo>。两条路径不同，分开走。
  const isSrcLayout = cliBinDir.endsWith(`apps${separator()}cli${separator()}src${separator()}lib`)
    || cliBinDir.endsWith('apps/cli/src/lib')
  const upwardSteps = isSrcLayout ? 4 : 3
  const repoRoot = resolve(cliBinDir, ...Array.from({ length: upwardSteps }, () => '..'))
  const repoCandidate = resolve(repoRoot, 'apps', 'web', 'dist', bundle)
  if (existsSync(resolve(repoCandidate, 'index.html')))
    return repoCandidate

  return undefined
}

function getCliBinDir(): string | undefined {
  if (typeof import.meta.url !== 'string')
    return undefined
  try {
    return dirname(fileURLToPath(import.meta.url))
  }
  catch {
    return undefined
  }
}

function safeResolve(input: string): string | undefined {
  try {
    // realpathSync 把 symlink / .. / // 全部 normalize；缺失时抛 ENOENT，被 catch
    // 吃掉返回 undefined。这条不构成 chroot，仅做最基本"路径存在 + 真实"的过滤。
    return realpathSync(resolve(input))
  }
  catch {
    return undefined
  }
}

function separator(): string {
  // 仅供分隔符判断；node:path.sep 在 Bun runtime 下也可用，写这层封装是为了
  // 在测试环境里被 mock 时能注入。
  return process.platform === 'win32' ? '\\' : '/'
}
