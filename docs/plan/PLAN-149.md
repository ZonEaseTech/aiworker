# PLAN-149 File-first Soul and Brain Pack authoring

- **status**: completed
- **createdAt**: 2026-05-07 01:54
- **approvedAt**: 2026-05-07 01:54
- **completedAt**: 2026-05-07 02:04
- **relatedTask**: REFACTOR-016

## 现状

1. `packages/shared/src/soul/modules/*.ts` 是内置 Soul 的主要 authoring 面；
   CLI 再把 `SoulModule` 投影成 preset，并在 `aiworker init` 中拼接
   `SOUL.md` / `AGENT.md`。
2. `packages/core/src/worker/brain/providers/filesystem/scanner.ts` 已经有
   agentskills 风格 frontmatter 扫描逻辑，但目前只覆盖 `.aiworker/skills/`。
3. open-design 的核心机制是 capability folder + `SKILL.md` + frontmatter +
   sidecar references/assets + runtime discovery；代码只负责扫描、索引、装载。
4. 当前项目处于 1.0.0 前，AGENTS.md 已明确不为未发布旧 CLI/API/config 形态
   保留兼容 shim。

## 方案

1. 在 `@zonease/aiworker-shared` 新增 Soul Pack loader：
   - `SOUL.md` frontmatter 承载 `SoulModule` 所需结构化字段。
   - `SOUL.md` body 是 LLM-facing Soul 文本。
   - `AGENT.md` body 是 LLM-facing Worker role 文本。
   - loader 解析 frontmatter，校验后输出 `SoulModule` + pack bodies。
2. 将内置 9 个 Soul 改成 `packages/shared/src/soul/packs/<id>/` 下的
   Markdown packs，并让 `BUILTIN_SOUL_MODULES` 从 packs 派生。
3. CLI preset 保留为显示/初始化投影，但从 Soul Pack registry 获取 body；
   `aiworker init --soul <id>` 直接 materialize pack-authored Markdown。
4. 保留 `policy.json` / `toolsets.json` / `capability-packs.json` 作为 draft /
   validation / overlay 数据，不再把它们当作 Soul 语义主入口。
5. 更新架构文档和测试，明确新增 Soul 语义默认写 pack，不写 TS registry。

## 风险

1. Bun bundled CLI 必须能把 Markdown text import 打进 bundle；本轮已用
   `bun build` 对 `.md` text import 做了验证。
2. YAML frontmatter 太大时仍会有结构维护成本；但它只放索引/治理字段，正文
   仍是 Markdown。
3. 本轮不实现完整第三方 pack 安装/precedence；若直接扩展成安装器会放大范围。

## 范围

- `packages/shared/src/soul/` pack loader、内置 pack、registry 导出和测试。
- `apps/cli/src/soul/presets.ts` 与 `apps/cli/src/commands/worker/init.ts`
  的 materialization 改造。
- 相关 CLI/shared focused tests。
- `docs/architecture.md` 的 authoring 方向补充。

## 非范围

- 不改 gateway/fleet。
- 不新增 executor adapter 能力。
- 不实现 project-local pack install/remove 命令。
- 不为旧 per-Soul TS module authoring 保留长期兼容层。

## 验证

- `bun run --filter '@zonease/aiworker-shared' test` PASS：144 pass / 0 fail。
- `bun run --filter '@zonease/aiworker-cli' test` PASS：178 pass / 0 fail。
- `bun run --filter '@zonease/aiworker-core' test` PASS：633 pass / 0 fail。
- `bun run typecheck` PASS。
- `bun run --filter '@zonease/aiworker-cli' build:bundle` PASS。
- `bun run lint` PASS。
- `git diff --check` PASS。

## 进度

- 2026-05-07 01:54：完成调查与方案收敛，开始实现 file-first Soul Pack。
- 2026-05-07 02:04：完成实现。9 个内置 Soul 迁移为 Markdown Soul Pack；
  `SoulModule` 由 loader 派生；CLI init 从 pack materialize persona docs；
  brief compiler 与 runtime context assembly 会在投影前剥离 `SOUL.md`
  frontmatter；文档与测试同步完成。
