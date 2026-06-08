# Session Title Policy Design

## 背景

Worker session 的标题有三类来源：

- `auto-default`：新建 session 的默认标题，例如 `New session 3`。
- `auto-truncated`：首次真实用户消息开始执行时，立刻用用户输入截断生成的标题。
- `auto-engine`：后台内部 one-shot engine 调用生成的短标题。
- `user`：员工显式改名后的标题。

当前产品期望很明确：首次发消息后，员工不需要刷新 Web，就能看到 session 标题从默认名变成截断标题；之后 engine refined title 可以升级标题；但员工手动改名后，自动命名永远不能覆盖它。

近期问题暴露出一个边界缺口：标题状态流转规则分散在 runtime auto-name、daemon PATCH rename、Web session upsert/sync 等位置。修复单点同步可以解决当前 bug，但如果规则继续分散，后续仍容易出现刷新后才生效、标题闪回、或自动命名覆盖用户命名的问题。

## 目标

把 session 标题状态流转抽成后端内部的轻量规则边界，集中管理什么时候允许改标题、标题来源如何变化、哪些来源可以覆盖哪些来源。

用户可见目标：

- 新 session 仍以默认标题展示。
- 首次真实 invocation 开始后，标题立即变为首条用户消息的截断版本。
- engine refined title 成功后可以升级自动标题。
- 员工手动 rename 后，后续自动命名不会覆盖。
- Web 不需要刷新即可看到标题变化，并且不出现旧标题闪回。

非目标：

- 不新增公开 API。
- 不引入 command bus 或完整 session command 层。
- 不改变 session/invocation 协议。
- 不把 rename 变成 Host 或 Soul 能力。
- 不在 Web 侧新增独立 rename 状态机。

## 设计

新增或抽出一个 package-local 的 `SessionTitlePolicy`，优先放在 Worker runtime/daemon 能共同复用的位置。它只表达标题状态规则，不负责 engine 调用、HTTP 路由、React 状态或存储细节。

建议接口保持小而明确：

```ts
type SessionTitleSource = 'auto-default' | 'auto-truncated' | 'auto-engine' | 'user'

function canApplyAutoTitle(source: SessionTitleSource): boolean
function applyAutoTruncatedTitle(session: SessionRow, title: string): SessionPatch | null
function applyAutoEngineTitle(session: SessionRow, title: string): SessionPatch | null
function applyUserTitle(session: SessionRow, title: string): SessionPatch | null
```

规则：

- `auto-default` 可以升级为 `auto-truncated`。
- `auto-default` 和 `auto-truncated` 可以升级为 `auto-engine`。
- `auto-engine` 可以被后续更好的 `auto-engine` 覆盖，前提是当前仍非 `user`。
- `user` 不能被任何自动标题覆盖。
- 用户显式 rename 一律写入 `titleSource='user'`。
- 空标题、无变化标题、无效标题不产生 patch。

runtime 使用 policy 处理首次 auto-truncated 和 engine refine。daemon 的手动 PATCH rename 使用同一个 policy 标记 `user`。这样 rule 不再靠各调用点各自记忆。

## 数据流

首次消息：

1. Web 调用 session invocation API。
2. Worker runtime 创建或恢复 invocation context。
3. runtime 读取 session 当前 `titleSource`。
4. policy 判断可以应用 auto-truncated。
5. runtime 持久化 session title 和 `titleSource='auto-truncated'`。
6. invocation start 返回包含更新后 session 的响应。
7. Web 用现有 session upsert 同步 header/sidebar/current session。

engine refine：

1. runtime 启动内部 one-shot auto-name invocation。
2. engine 返回短标题后，runtime 读取最新 session。
3. policy 判断当前标题仍可被 auto title 覆盖。
4. runtime 持久化 `auto-engine` 标题。
5. Web 通过现有刷新/同步路径拿到更新后的 session。

用户手动 rename：

1. Web 或后续调用方 PATCH session title。
2. daemon 读取当前 session。
3. policy 生成 user title patch。
4. daemon 持久化标题和 `titleSource='user'`。
5. 后续 auto-truncated/auto-engine 都无法覆盖。

## 错误处理

- policy 返回 `null` 表示不应修改标题，调用方直接跳过写入。
- engine refine 失败时保留 `auto-truncated` 或当前标题，不向用户暴露错误。
- 用户 rename 的校验仍由现有 PATCH session schema 负责；policy 不替代输入验证。
- 并发场景下，写入前需要读取最新 session，再交给 policy 判断，避免旧 context 覆盖用户 rename。
- Web 收到旧 session snapshot 时，继续依赖 `updatedAt` 防止旧标题覆盖新标题。

## 测试

新增或调整 focused contract tests：

- `auto-default -> auto-truncated`：首次 invocation 返回更新后的 session。
- `auto-truncated -> auto-engine`：engine refine 可以升级自动标题。
- `user` 不可被 auto-truncated 覆盖。
- `user` 不可被 auto-engine 覆盖。
- 用户 PATCH rename 会写入 `titleSource='user'`。
- 旧 snapshot 不覆盖较新的 session title。

验证命令以 touched package 为准，优先运行 runtime、daemon、worker-web 中与 session naming/sync 相关的最小测试集。

## 接受标准

- 首次发消息后，不刷新 Web，当前 session header 和 sidebar 立即显示截断标题。
- engine refined title 后，标题可以升级且不闪回旧值。
- 用户手动 rename 后，自动命名不会覆盖用户标题。
- title source 状态流转只通过统一 policy 表达，调用点不再重复硬编码覆盖规则。
