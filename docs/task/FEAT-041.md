# FEAT-041 优化 CLI help 信息架构

- **status**: completed
- **priority**: P2
- **owner**: self
- **createdAt**: 2026-04-30 16:09
- **plan**: PLAN-048

## 描述

当前 `aiworker --help` 由 `cac` 默认渲染，所有命令被摊平成一个线性列表，且命令描述、选项描述混用中文和英文。首次使用者很难快速判断：

1. 自己是在配置本地 worker、操作 fleet gateway，还是做远端 worker 管理；
2. 哪些命令是日常路径，哪些只在安装、调试、维护或高级场景需要；
3. 下一步应该运行哪条命令或如何查看更细 help。

验收标准：

1. `aiworker --help` 使用统一中文文案，不再混杂英文描述。
2. 全局 help 按场景分组展示命令，至少区分本地 worker、gateway/fleet、远端 worker 操作、安装/诊断/高级维护。
3. 全局 help 提供简短 guide 语句，告诉用户常见场景从哪些命令开始，以及哪些命令不是日常必需路径。
4. 子命令 help 保留参数/选项细节，并同步把核心描述和选项说明统一为中文。
5. 现有 argv 预处理、参数校验、help 不触发 bootstrap 的行为保持不变。

## 进行时描述

优化 CLI help 的分组、语言一致性和新手引导。

## 依赖

- **blocked by**: (none)
- **blocks**: CLI 首次使用体验、后续发布验证中的 help smoke
- **relates to**: FEAT-027, FEAT-028, FEAT-036, BUG-039

## 笔记

- 2026-04-30 16:09：调查确认全局 help 由 `apps/cli/src/aiworker.ts` 的 `cac` 命令注册和 `cli.help()` 默认渲染生成。
- 2026-04-30 16:09：实际输出中 `init`、`run`、`serve`、`config-show` 等为英文描述，而 `fleet`、`gateway`、`chat`、`enroll` 等为中文描述，存在明显中英混输。
- 2026-04-30 16:09：`cac` 默认全局 help 只提供单个 `Commands` 区块，并自动生成完整逐命令 `--help` 列表，导致模块层次和常见路径不清晰。
- 2026-04-30 16:09：`cac` 6.7.14 的 `help(callback)` 可改写全局 sections；实现可在不替换 CLI 框架的前提下自定义全局 help。
- 2026-04-30 16:28：实现已完成。全局 help 改为中文场景分组和使用引导；子命令 help 的标准标题、全局 help/version 选项和命令/option 描述同步收敛为中文。
- 2026-04-30 16:28：验证通过：聚焦 `aiworker.test.ts`、CLI package typecheck、CLI package test、CLI bundle、root lint、`git diff --check`。
