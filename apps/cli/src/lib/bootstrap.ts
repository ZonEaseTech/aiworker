// FEAT-030: side-effect-only 入口。
// CLI 入口（apps/cli/src/aiworker.ts）必须在任何业务模块（含 packages/core 的 zod schema）
// import 之前 import 本文件——schema 在 import 期就 parse process.env，必须先注入。
// 单独抽一个文件而非内联调用，是为了 eslint `import/first`：side-effect import 仍然算 import 行。
//
// PLAN-023 / FEAT-036: scope-aware bootstrap。先解析 aiworker scope（user vs
// project），把命中的 home 写回 `AIWORKER_HOME` 让 packages/core 的 zod schema
// 派生出正确的 WORKER_DB_PATH / WORKER_DATA_ROOT；再传给 dotenv-bootstrap。
//
// 当 cwd 没有 `.aiworker/` 时 scope 自然 fallback user-default，行为与 FEAT-030
// 完全一致；不会污染随机目录（如 `/tmp` 跑 `aiworker --version`）。
import process from 'node:process'
import { resolveAiworkerScope } from '@zonease/aiworker-fs-layout'
import { bootstrapDotenv } from './dotenv-bootstrap'

const scope = resolveAiworkerScope()
process.env.AIWORKER_HOME ??= scope.home
bootstrapDotenv({ home: scope.home })
