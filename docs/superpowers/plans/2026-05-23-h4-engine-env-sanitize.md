# H4 engine env 最小透传 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 在把环境注入外部 engine 子进程前，剥除 Host 内部命名空间 env（`AIWORKER_*`/`WORKER_*`/`OD_*`，含 bearer/mount token），通过一个共享 `sanitizeEngineEnv` helper 应用于三处 spawn 站点。

**Architecture:** 新增纯函数 `sanitizeEngineEnv(base)`：返回 `base` 去掉所有 Host 内部命名空间前缀的 key。三处裸 `...process.env` 注入点改为经该 helper；engine 专属 env（`engine.env`/`input.env`）仍层叠其上，可显式覆盖。

**Tech Stack:** TypeScript、Bun（`bun:test`），`packages/core`（`@zonease/aiworker-core`）。

**来源 spec:** `docs/superpowers/specs/2026-05-23-h4-engine-env-sanitize-design.md`

---

## 背景：执行前必读（已核实）

- 三处注入点：`packages/core/src/worker/engine-bridge.ts:56-60`、`packages/core/src/worker/executor.ts:207-210`、`packages/core/src/worker/executor.ts:335`。
- Host 内部敏感/操作 env 全在 `AIWORKER_*`/`WORKER_*`/`OD_*` 命名空间（最敏感：`AIWORKER_LOCAL_TOKEN`、`AIWORKER_MOUNT_TOKEN`）。
- engine 需要的 env（`PATH`/`HOME`/`LANG`/proxy/auth 如 `ANTHROPIC_API_KEY`）均**不在**这些命名空间。
- engine 专属 env 由 executor 显式设置（`executor.ts:130` `GEMINI_CLI_TRUST_WORKSPACE`），不依赖继承；`AIWORKER_CODEX_*`/`OD_CODEX_*` 是 Host 在 spawn 前自己读取（`executor.ts:91-93`），子进程不需要。
- `executor.ts` import 范式：`import { createEngineStreamHandler } from './engine-stream'`（同目录相对 import）。
- `execCommand` 仅在 `executor.ts:205` 被调用一次（已传显式 env）；`:320` 定义、`:335` 的 `?? process.env` 是兜底。
- `packages/core` 测试用 **`bun:test`**（不是 vitest）。
- 命令：core 测试 `bun run --filter '@zonease/aiworker-core' test`；类型检查 `bun run --filter '@zonease/aiworker-core' typecheck`。

## File Structure

- Create: `packages/core/src/worker/engine-env.ts`（`sanitizeEngineEnv` + 前缀常量）
- Create: `packages/core/src/worker/engine-env.test.ts`（helper 单测）
- Modify: `packages/core/src/worker/engine-bridge.ts`（import + `:56-60` env）
- Modify: `packages/core/src/worker/executor.ts`（import + `:207-210` 与 `:335` env）

---

## Task 1: 新增 sanitizeEngineEnv helper（TDD）

**Files:**
- Create: `packages/core/src/worker/engine-env.ts`
- Test: `packages/core/src/worker/engine-env.test.ts`

- [ ] **Step 1: 写失败测试**

新建 `packages/core/src/worker/engine-env.test.ts`：

```ts
import { describe, expect, test } from 'bun:test'
import { sanitizeEngineEnv } from './engine-env'

describe('sanitizeEngineEnv', () => {
  const sample = {
    AIWORKER_LOCAL_TOKEN: 'secret-bearer',
    AIWORKER_MOUNT_TOKEN: 'mount-secret',
    AIWORKER_HOME: '/home/u/.aiworker',
    WORKER_DB_PATH: '/db.sqlite',
    OD_CODEX_DISABLE_PLUGINS: '1',
    PATH: '/usr/bin',
    HOME: '/home/u',
    ANTHROPIC_API_KEY: 'engine-auth',
    LANG: 'en_US.UTF-8',
  }

  test('strips Host-internal namespaces, keeps engine env', () => {
    const result = sanitizeEngineEnv(sample)
    expect(result.AIWORKER_LOCAL_TOKEN).toBeUndefined()
    expect(result.AIWORKER_MOUNT_TOKEN).toBeUndefined()
    expect(result.AIWORKER_HOME).toBeUndefined()
    expect(result.WORKER_DB_PATH).toBeUndefined()
    expect(result.OD_CODEX_DISABLE_PLUGINS).toBeUndefined()
    expect(result.PATH).toBe('/usr/bin')
    expect(result.HOME).toBe('/home/u')
    expect(result.ANTHROPIC_API_KEY).toBe('engine-auth')
    expect(result.LANG).toBe('en_US.UTF-8')
  })

  test('does not mutate the input env', () => {
    const input = { AIWORKER_LOCAL_TOKEN: 'x', PATH: '/bin' }
    sanitizeEngineEnv(input)
    expect(input.AIWORKER_LOCAL_TOKEN).toBe('x')
  })
})
```

- [ ] **Step 2: 跑测试，确认失败**

Run: `bun run --filter '@zonease/aiworker-core' test -- src/worker/engine-env.test.ts`
Expected: FAIL —`sanitizeEngineEnv` 未定义（模块不存在）。

- [ ] **Step 3: 实现 helper**

新建 `packages/core/src/worker/engine-env.ts`：

```ts
import process from 'node:process'

const HOST_INTERNAL_ENV_PREFIXES = ['AIWORKER_', 'WORKER_', 'OD_'] as const

export function sanitizeEngineEnv(base: NodeJS.ProcessEnv = process.env): NodeJS.ProcessEnv {
  const result: NodeJS.ProcessEnv = {}
  for (const [key, value] of Object.entries(base)) {
    if (HOST_INTERNAL_ENV_PREFIXES.some(prefix => key.startsWith(prefix)))
      continue
    result[key] = value
  }
  return result
}
```

- [ ] **Step 4: 跑测试，确认通过**

Run: `bun run --filter '@zonease/aiworker-core' test -- src/worker/engine-env.test.ts`
Expected: PASS（2 个用例）。

- [ ] **Step 5: 提交**

```bash
git add packages/core/src/worker/engine-env.ts packages/core/src/worker/engine-env.test.ts
git commit -m "$(cat <<'EOF'
feat: 新增 sanitizeEngineEnv 剥除 Host 内部命名空间 env

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 2: 三处 spawn 站点改用 sanitizeEngineEnv

**Files:**
- Modify: `packages/core/src/worker/engine-bridge.ts`
- Modify: `packages/core/src/worker/executor.ts`

- [ ] **Step 1: engine-bridge.ts 接入**

在 `packages/core/src/worker/engine-bridge.ts` 顶部 import 区加入：
```ts
import { sanitizeEngineEnv } from './engine-env'
```
把 `:56-60` 的 env 块：
```ts
      env: {
        // eslint-disable-next-line node/prefer-global/process
        ...process.env,
        ...(input.env ?? {}),
      },
```
改为：
```ts
      env: {
        ...sanitizeEngineEnv(),
        ...(input.env ?? {}),
      },
```
（若移除 `...process.env` 后该文件不再直接用 `process`，删除其 `process` import / 相关 eslint-disable 注释；若仍用到则保留。）

- [ ] **Step 2: executor.ts 接入（两处）**

在 `packages/core/src/worker/executor.ts` 顶部 import 区（紧邻 `import { createEngineStreamHandler } from './engine-stream'`）加入：
```ts
import { sanitizeEngineEnv } from './engine-env'
```
把 `:207-210`：
```ts
    env: {
      ...process.env,
      ...(engine.env ?? {}),
    },
```
改为：
```ts
    env: {
      ...sanitizeEngineEnv(),
      ...(engine.env ?? {}),
    },
```
把 `:335`：
```ts
      env: options.env ?? process.env,
```
改为：
```ts
      env: options.env ?? sanitizeEngineEnv(),
```
（`executor.ts` 其它地方仍使用 `process.env`，保留 `process` import。）

- [ ] **Step 3: 确认三处不再裸注入 process.env**

Run: `rg -n "\.\.\.process\.env|env: options\.env \?\? process\.env" packages/core/src/worker/engine-bridge.ts packages/core/src/worker/executor.ts`
Expected: 无命中（三处均已改为 `sanitizeEngineEnv`）。

- [ ] **Step 4: 跑 core 测试 + typecheck**

Run: `bun run --filter '@zonease/aiworker-core' test && bun run --filter '@zonease/aiworker-core' typecheck`
Expected: 全绿、typecheck exit 0。重点确认既有 `executor.test.ts` 中验证 engine 专属 env（如 codex 的 `AIWORKER_CODEX_*` 由 Host 读取拼参、`engine.env` 覆盖）的用例仍通过——engine 专属 env 经 `...(engine.env ?? {})` 层叠，未受影响。

- [ ] **Step 5: lint 改动文件**

Run: `bunx eslint packages/core/src/worker/engine-bridge.ts packages/core/src/worker/executor.ts packages/core/src/worker/engine-env.ts`
Expected: exit 0（这三个文件无新增 lint 错误）。

- [ ] **Step 6: 提交**

```bash
git add packages/core/src/worker/engine-bridge.ts packages/core/src/worker/executor.ts
git commit -m "$(cat <<'EOF'
fix: engine spawn 经 sanitizeEngineEnv 注入,不再裸透传 process.env

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## 收尾验证（全部任务完成后）

- [ ] **Step 1: 全仓确认无裸注入残留**

Run: `rg -n "\.\.\.process\.env" packages/core/src/worker/`
Expected: engine-bridge.ts / executor.ts 的 spawn env 处无命中（其它非 spawn 用途的 process.env 读取不在本次范围）。

- [ ] **Step 2: core 测试 + typecheck + lint**

Run: `bun run --filter '@zonease/aiworker-core' test && bun run --filter '@zonease/aiworker-core' typecheck`
Expected: 全绿、typecheck 0。

- [ ] **Step 3: 人工/语义确认**

确认 engine 仍能正常 spawn：`sanitizeEngineEnv` 保留 `PATH`/`HOME`/auth/proxy/locale；engine 专属 env 仍能经 `engine.env`/`input.env` 注入或覆盖；子进程环境不含 `AIWORKER_LOCAL_TOKEN`/`AIWORKER_MOUNT_TOKEN`。

---

## 非目标

- 不改 worker engine 的 `--dangerously-skip-permissions`。
- 不动 bearer-auth provider 或 sandbox 层。
- 不引入 allowlist。
- 不碰 H1/H2/H3。
