# FEAT-071 Soul App development skill and rules

- **status**: completed
- **priority**: P0
- **owner**: codex
- **createdAt**: 2026-05-13 19:00
- **plan**: PLAN-300
- **relatesTo**: FEAT-060, FEAT-065, docs, AGENTS.md, .agents/skills, apps/aiworker-hr, apps/aiworker-qa

## 背景

Soul App 已经具备独立 app 目录、manifest、SDK、standalone 和 Host mounted 验证入口。
下一步需要把开发规则落在 agent 会实际执行的位置，让参与者修改或新增 Soul App 时能快速
进入同一套 Host / Soul App 双自治语义。

## 目标

新增 agent-native Soul App 开发 skill，并由根 `AGENTS.md` 路由到该 skill。开发者文档需要
说明人类可读 authoring guide 与 agent skill 的关系。

具体目标：

1. 提供 `.agents/skills/aiworker-soul-app-dev/SKILL.md`。
2. 在根 `AGENTS.md` 中声明 Soul App 修改必须使用该 skill。
3. 在 `docs/soul-app-developer.md` 中串联 skill 与 authoring workflow。
4. 严格沿用 Host / Soul App、workspace/session、artifact、review/lesson、
   standalone/Host mounted 设计语言。
5. 不新增 `apps/AGENTS.md` 作为主机制，除非先验证目标 agent 原生支持 nested AGENTS。

## 非目标

- 不修改 Soul App protocol、runtime、registry、broker 或 mounted proxy。
- 不重做 HR/QA app 的产品能力。
- 不把规则落成只给人类阅读、agent 不会执行的 app-level 文件。
- 不在本轮修改 `aiworker app create` scaffold。

## 验收标准

- 新 skill 能指导 agent 读上下文、识别边界、使用统一产品语言并运行验证。
- 根 `AGENTS.md` 能把 `apps/aiworker-*` 和 Soul App authoring 相关改动路由到该 skill。
- `docs/soul-app-developer.md` 能说明 agent workflow 和人工 authoring 文档的关系。
- 文档和 skill 文件通过 `git diff --check`。

## 完成记录

- 新增 `.agents/skills/aiworker-soul-app-dev/SKILL.md`，覆盖 Soul App 上下文读取、
  Host / Soul App 边界、设计语言、standalone/Host mounted 一致性和验证 gate。
- 更新根 `AGENTS.md`，把 `apps/aiworker-*`、Soul App scaffold/validation 和 authoring
  文档改动路由到该 skill。
- 更新 `docs/soul-app-developer.md`，说明 authoring guide 与 agent-native skill 的关系，
  并明确不把 `apps/AGENTS.md` 作为当前 canonical rules surface。

## 验证

- `rg -n "待定|占位|apps/AGENTS.md" ...`
- `test ! -e apps/AGENTS.md`
- `git diff --check`
- code-review-graph skipped because this change only touches docs, root agent instructions, and skill markdown.
