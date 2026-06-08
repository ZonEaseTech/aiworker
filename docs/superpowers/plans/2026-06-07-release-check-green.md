# release:check 收绿（A1-A5）Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 把分支 `codex/aiworker-refactor-dev-loop` 的 `bun run release:check` 从当前 5 个预先存在失败收成全绿，且不削弱任何安全/架构守卫、不碰 WS2/产品语义。

**Architecture:** 5 个独立失败各自修复（A1 G4 守卫精化 / A2 host-single-serve 登录门 / A3 worker-runtime typecheck / A4 repo-wide lint / A5 standalone-runtime smoke），各自产出一个绿门；A1/A3/A4 已可具体落地，A2/A5 含一个 discovery 步（真实未知=设计决策/调查），discovery 后即可确定具体修法。每项独立 commit。

**Tech Stack:** Bun test、ESLint (antfu config)、TypeScript、drizzle、`bun build --compile`。

**前置事实（已严格归因，详见 `.omc/progress.txt` 与 commit 5cea7ef2 message）：** 这 5 个失败均非 WS1 引入，均来自最近 Logto/provisioning 工作（06-06/07）落地后未把门修绿。逐项已用 git stash / 逻辑证明非本分支 WS1 改动所致。

**硬约束：** 不削弱安全/架构守卫（A1 必须保 deny-list 强度 + 负向断言）；不碰 WS2（部署/Logto 租户/Caddy/拱顶石）；不改产品语义；中文 commit；不 push 除非用户要求；TDD where applicable。

---

## Task 1: A1 — G4 inversion-guard 精化（Host-auth 显式 allowlist 排除）

权威设计：`docs/superpowers/specs/2026-06-07-g4-host-auth-reconciliation-design.md`。

**Files:**
- Modify: `tests/architecture/inversion-guards.test.ts`（G4 测试，约 :179-202）

- [ ] **Step 1: 先加负向断言（失败测试）** — 在 G4 测试**后面**新增一个 `test('G4 still catches Worker-ownership even with Host-auth allowlist', ...)`，用一个**临时内联字符串**模拟 host 源含 `workerChatSession` 与 `engineSecret`，断言精化后的扫描逻辑仍判它违规。（此 test 现在会失败，因为精化逻辑还没写。）写法：把精化后的扫描抽成一个可单测的纯函数（见 Step 3），该 test 直接调它。

- [ ] **Step 2: 跑负向测试确认失败**

Run: `bun test tests/architecture/inversion-guards.test.ts -t "still catches Worker-ownership"`
Expected: FAIL（函数未定义 / 未抽出）

- [ ] **Step 3: 抽出可测的扫描函数 + 实现 allowlist 精化**

在 G4 测试文件内（或就近 helper）实现：
```ts
// host-* 控制面不得携带 Worker 的 session/invocation/projection/engine/native-secret/
// domain-业务态归属。Host 自身的 Logto 登录 session / OIDC 凭证 / email 域门是 Phase 2.1
// 钦定的合法职责,按下方显式可审计 allowlist 排除——这缩小误报,不削弱守卫。
const STRICT_OWNERSHIP_TOKENS = ['invocation', 'projection', 'engine'] as const
const AMBIGUOUS_OWNERSHIP_TOKENS = ['session', 'secret', 'domain'] as const
// 显式 Host-auth allowlist(小写;每组语义)。新增 auth 标识符必须显式加入 = 强制 review。
const HOST_AUTH_ALLOWLIST = [
  // 登录 session
  'hostsession', 'sessionauth', 'sessionsecret', 'sessioncookie', 'readuserfromsessioncookie',
  'buildsessionauthfromenv', 'hasanysessionenv', 'asserthostsessionsecret', 'ishostsessionpayload',
  'logtosessionrequiredenvkeys', 'hostsessionauthenv', 'sessionpayload',
  // OIDC 凭证
  'clientsecret', 'mappsecret', 'readapplicationsecret', 'applicationsecret', 'deprecatedsecret',
  // email 域门
  'allowedemaildomains', 'alloweddomains', 'emailbelongstoalloweddomain', 'emaildomain',
] as const

function scanHostOwnership(rawCode: string): string[] {
  // 返回命中的 forbidden token 列表(空=干净)
  const code = rawCode // 调用方已 stripComments().toLowerCase()
  const hits: string[] = []
  for (const token of STRICT_OWNERSHIP_TOKENS)
    if (code.includes(token)) hits.push(token)
  // 歧义类:先剔除显式 Host-auth 标识符,再扫
  let ambiguous = code
  for (const allowed of HOST_AUTH_ALLOWLIST)
    ambiguous = ambiguous.split(allowed).join('')
  for (const token of AMBIGUOUS_OWNERSHIP_TOKENS)
    if (ambiguous.includes(token)) hits.push(token)
  return hits
}
```
然后把 G4 主测试体改为：对每个 host-* 源文件，`const hits = scanHostOwnership(stripComments(read(file)).toLowerCase())`，`expect(hits, \`${file} must not carry Worker ownership: ${hits}\`).toEqual([])`。
负向 test 调 `scanHostOwnership('const workerchatsession = 1; const enginesecret = 2;')` 断言返回含 `session` 与 `engine`（证明 allowlist 不放行 Worker 归属：`workerchatsession` 不匹配任何 allowlist 项 → `session` 仍命中；`enginesecret` 含 `engine` 严扫命中）。

- [ ] **Step 4: 跑负向测试 + G4 主测试**

Run: `bun test tests/architecture/inversion-guards.test.ts`
Expected: PASS（负向 test 绿 + G4 主测试对 ~15 处 Host-auth 不再误报）

- [ ] **Step 5: 跑完整 test:contracts**

Run: `bun run test:contracts`
Expected: 193 pass / 0 fail（原 192 pass + 负向新 test）

- [ ] **Step 6: Commit**

```bash
git add tests/architecture/inversion-guards.test.ts
git commit -m "fix(test): G4 区分 Host 自身 auth 与 Worker 归属(显式 allowlist+负向断言)"
```

---

## Task 2: A3 — worker-runtime soul-app/registry.test typecheck（TS2532 非空守卫）

**Files:**
- Modify: `packages/worker-runtime/src/soul-app/registry.test.ts`（约 :155, :168, :180 — `definitions[0]` / `first[0]` 等 possibly undefined）

- [ ] **Step 1: 复现失败**

Run: `bun run --filter '@zonease/aiworker-worker-runtime' typecheck`
Expected: FAIL — `registry.test.ts(155/168/180,...): error TS2532: Object is possibly 'undefined'`

- [ ] **Step 2: 修复** — 对每处 possibly-undefined 的数组下标访问（如 `definitions[0].descriptorPath`），改为非空断言 `definitions[0]!.descriptorPath`（测试上下文里该元素必存在，断言安全），或在前面加 `expect(definitions[0]).toBeDefined()` 守卫。读 :155/:168/:180 实际行确定是 `definitions[0]` 还是 `first[0]`/`second[0]`/`third[0]`，逐处加 `!`。**不改产品源,只改测试。**

- [ ] **Step 3: 验证 typecheck 绿**

Run: `bun run --filter '@zonease/aiworker-worker-runtime' typecheck`
Expected: Exited with code 0

- [ ] **Step 4: Commit**

```bash
git add packages/worker-runtime/src/soul-app/registry.test.ts
git commit -m "fix(test): 补 registry.test 数组下标非空守卫(TS2532)"
```

---

## Task 3: A4 — repo-wide lint 123 errors 收绿

**Files:** repo-wide（多文件；按 rule 归类处理）

- [ ] **Step 1: 复现 + 快照基线**

Run: `bun run lint 2>&1 | tail -3`
Expected: `123 errors`（含 `eslint .` + boundary + ui:check + docs:check 链；先确认 123 全来自 `eslint .`，boundary/ui/docs 是否各自绿）

- [ ] **Step 2: 自动修可修项**

Run: `npx eslint . --fix`
预期消化大头：`style/no-multiple-empty-lines(21)`、`style/quote-props(16)`、`perfectionist/sort-named-imports(14)`、`import/consistent-type-specifier-style(14)`、`perfectionist/sort-imports(13)`、`style/indent(12)`、`style/arrow-parens(7)`、`style/jsx-one-expression-per-line(6)` 等 ≈ 80+ 项。

- [ ] **Step 3: 复查剩余 + 归类手动修**

Run: `npx eslint . 2>&1 | grep -E "error" | grep -oE "[a-z@-]+/[a-z-]+$|no-console|antfu/[a-z-]+" | sort | uniq -c | sort -rn`
对剩余非自动项逐类处理：
- `node/prefer-global(~23, Buffer)`：把 `Buffer.from(...)` 改为顶部 `import { Buffer } from 'node:buffer'` 后用（按文件）。
- `no-console(~19)`：结构化 ops 日志改 `console.warn`（仓库既有 idiom）；调试残留 console 删除；确属必要的加 `// eslint-disable-next-line no-console` + 理由。
- `regexp/*(prefer-w / use-ignore-case / no-useless-assertions)`：按规则提示改正则（如 `[0-9a-z]`→`\w`、加 `i` flag、删无用 `\b`）。
- `antfu/no-top-level-await(2)`、`antfu/curly(2)`：包进函数/加大括号。

- [ ] **Step 4: 验证 lint 绿**

Run: `bun run lint`
Expected: 0 errors（exit 0）

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "fix(lint): 收绿 repo-wide eslint(自动修+Buffer/console/regexp 归类)"
```

> 注：本 task 触及多文件,但纯 lint 修复、零行为改动。若某 `no-console` 涉及承重日志(如 host-server 转发日志已用 warn),不动其行为。

---

## Task 4: A2 — host-single-serve `/host` 400（登录门）discovery + fix

**已知：** spec 用 `aiworker-host.ts ... --dev-admin-email <email> --host ...`（`env: process.env`）spawn 真 host,浏览器请求 `/host` 返 **400**。最近 Logto 登录门(`07422618`/`97c47bd4`)后 /host 走 session auth。带 `--env-file=.env` 仍 400。

- [ ] **Step 1: Discovery — 定位 400 来源 + 决定修法**

读 `apps/host-cli/src/host-server.ts` 的 /host 路由处理 + session auth 门(`sessionAuth`/`readUserFromSessionCookie`/`bootstrapHostAdminEmails`),与 `tests/browser/host-single-serve.spec.ts` 的 spawn+请求方式。确定 400 是：(a) 无 session cookie 被登录门拒,还是 (b) `--dev-admin-email` 的 bootstrap-admin 路径没给 /host 放行,还是 (c) sessionAuth 未配置导致 fail-closed。
**产出一个明确修法**(择一,记进本 task)：
- 修法甲(测试侧)：spec 先走 dev-admin 登录拿 session cookie,再带 cookie 请求 /host。
- 修法乙(产品侧)：dev-admin 模式下 /host 静态壳免 Logto session(若架构允许 dev landing 不需登录);**须确认不破坏 `97c47bd4 阻止 host 静态页绕过登录门禁` 的安全意图**。
- 修法丙(spec 过期)：登录门后 /host 契约变了,spec 断言需更新到新契约。
⚠️ 若修法触及"静态页是否需登录"的安全边界,**停下确认**(这关联 Logto 安全门,可能需用户/架构裁定),不擅自放宽。

- [ ] **Step 2: 写/改测试反映选定修法** — 按 Step 1 选定修法,先让 `host-single-serve.spec.ts` 表达期望(失败态)。

- [ ] **Step 3: 实现修法** — 落地甲/乙/丙之一。

- [ ] **Step 4: 验证**

Run: `bun --env-file=.env tests/browser/host-single-serve.spec.ts`（按 spec 实际 env 需求）
Expected: EXIT 0；随后 `bun run test:browser:phase2` 三 spec 全绿。

- [ ] **Step 5: Commit**（message 按选定修法写）

---

## Task 5: A5 — smoke:standalone-runtime migrationsReady（bun-compile 嵌入）discovery + fix

**已知：** smoke `delete env.WORKER_MIGRATIONS_FOLDER`(smoke-standalone-runtime.ts:62)→ compile 二进制 doctor 报 `migrationsFolder:"/drizzle/worker", migrationsReady:false`(aiworker.ts:529-533 `getWorkerEnv().WORKER_MIGRATIONS_FOLDER || <default>` + `existsSync(folder+'/meta/_journal.json')`)。dist 实有 journal、smoke:npm-package PASS——仅 `bun build --compile` 路径 existsSync 失败。

- [ ] **Step 1: Discovery — 弄清 compile 二进制怎么解析 `/drizzle/worker`**

读 `apps/worker-cli/src/aiworker.ts` 里 migrationsFolder 默认值怎么来(grep `/drizzle/worker`、`import.meta`、`embeddedFiles`、`Bun.embeddedFiles`、`compile`),以及 `bun build --compile` 如何嵌入 `drizzle/`(看 build:bundle 脚本 + 是否用 `with { type: 'file' }`/`Bun.embeddedFiles`)。判断 existsSync 在 compile 二进制对嵌入虚拟路径为何返 false。
**产出明确修法**(择一)：
- 修法甲：doctor 的 migrationsReady 检测改用对 compile 二进制有效的方式(如 `Bun.embeddedFiles` 探测 / try-read 而非 existsSync)。
- 修法乙：compile 二进制启动时把嵌入 migrations 解出到可达临时路径,migrationsFolder 指向它。
- 修法丙：smoke 对 compile 路径设正确的 WORKER_MIGRATIONS_FOLDER(若嵌入资源有确定可达路径)。
⚠️ 必须保持 npm 路径(smoke:npm-package)仍 PASS——修法不能只为 compile 而破 npm。

- [ ] **Step 2: 写测试/冒烟反映期望** — 让 smoke(或一个更小的单测)表达 compile 二进制 doctor `migrationsReady:true` 的期望(失败态)。

- [ ] **Step 3: 实现修法**

- [ ] **Step 4: 验证**

Run: `bun run smoke:standalone-runtime`
Expected: PASS；且 `bun run smoke:npm-package` 仍 PASS（不回归 npm 路径）。

- [ ] **Step 5: Commit**（按选定修法写）

---

## Task 6: 全门验证 — release:check 全绿

- [ ] **Step 1: 跑完整 release:check**

Run: `bun run release:check`
Expected: exit 0（docs:check / test:contracts / test:protocol / test:cli / test:browser:freeform / test:browser:phase2 / typecheck / lint / build / 4 smokes / test / check 全绿）

- [ ] **Step 2: 若仍有红 → 回到对应 Task 修；若绿 → 记录最终 commit 序列**

- [ ] **Step 3: code-review-graph**

Run: `bun run crg:review`（AGENTS.md 要求代码改动跑）

---

## Self-Review（写计划后自查）

- **Spec coverage（A1 spec）**：Task 1 完整覆盖 A1 spec 的方案 A（严扫类不变 / 歧义类 allowlist 排除 / 负向断言 / doc-comment 更新）。✓
- **A2-A5 覆盖**：A2=Task 4、A3=Task 2、A4=Task 3、A5=Task 5,各有 discovery+fix+验证。A2/A5 含明确 discovery 步(真实未知),非占位——discovery 产出择一修法,且都标了"触及安全边界/npm 回归须停下确认"的护栏。
- **No-placeholder**：A1/A3/A4 步骤含具体代码/命令/期望;A2/A5 的 discovery 是诚实的"先查清再修"(其修法依赖 discovery 结论,不能预先硬编,已列候选修法+护栏)。
- **不削弱守卫**：Task 1 强制负向断言 + 保 deny-list;Task 4 标注不动承重日志行为;Task 5 标注不破 npm 路径;Task 4-A2 标注静态页登录边界须确认。

## Non-Goals
- 不碰 WS2（Caddy/部署/真 Logto 租户/拱顶石）、不碰 GA backlog、不动产品语义。
- 不重构 Logto auth 代码（A1 是改守卫；方案 B 已否决）。
- A2/A5 的 discovery 若撞上安全边界或架构裁定,停下问用户,不擅自决定。
