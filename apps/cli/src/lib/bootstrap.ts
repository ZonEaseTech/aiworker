// FEAT-030: side-effect-only 入口。
// CLI 入口（apps/cli/src/aiworker.ts）必须在任何业务模块（含 packages/core 的 zod schema）
// import 之前 import 本文件——schema 在 import 期就 parse process.env，必须先注入。
// 单独抽一个文件而非内联调用，是为了 eslint `import/first`：side-effect import 仍然算 import 行。
import { bootstrapDotenv } from './dotenv-bootstrap'

bootstrapDotenv()
