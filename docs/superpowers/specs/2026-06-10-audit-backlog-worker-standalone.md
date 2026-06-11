# 审计 backlog:worker 独立 (worker standalone)

- 日期:2026-06-10
- 状态:tracking backlog(来自闭门造车审计,逐条可追踪)
- 来源:tmp/aiworker-audit-2026-06-10/report.md + findings.json
- 范围:脱离 Host 的 Worker 运行体本身 —— engine-bridge(EB-\*)、projection(PROJ-\*)、worker-daemon 生命周期(WDLM-\*)、session/invocation 状态机与 broker(SIM-\*)、worker-web/Workbench(WWB-\*)、redaction worker 侧(REDACT-\*)、soul-descriptor 授权/构建(SD-\*)、守 worker 边界的 testing-guards(TGA-\*)。系统级 SL-3(engine-bridge 重造 SDK)、SL-5(全仓默认手搓文化)归此线;build/release 基础设施(ci-split、release-check、procfile、版本同步)作 cross-cutting 放此线(主代码与 v1 发版闭环都在 worker 线)。
- 相关线:auth-1(手搓 OIDC)在 host 独立 spec,与本线 SL-5 同主题;Phase 2 隧道帧(WAT-1)在 host-worker 联调 spec,与 SL-5 同根。

## 概览

本线 finding 计数(去重后 30 条 + 3 系统级):
- high:EB-1 ✅、PROJ-1 ✅、WDLM-1、WWB-1、ci-split ✅、SL-3
- medium:EB-3、EB-4、PROJ-2、PROJ-3、PROJ-4 ✅、SD-1、SD-2、REDACT-1、WDLM-3、WDLM-4、SIM-1、SIM-4、WWB-2、TGA-1、TGA-2、TGA-4 🟡、release-check-monolithic ✅、SL-5
- low:EB-2、PROJ-5、PROJ-6、SD-3、WDLM-2、WDLM-5、SIM-3、SIM-5、REDACT-2、WWB-3、WWB-4、WWB-5、TGA-3、TGA-5、reinvented-procfile、manual-two-package-version-sync
- 已解决:5(EB-1、PROJ-1、PROJ-4、ci-split、release-check-monolithic) + 1 部分(TGA-4) + runtime.md resume 标注;其余待办。
- 驳回:SIM-2(见附录)。

## Findings

### EB-1 · 生产路径 native resume 死掉导致多轮 follow-up 失忆 `[high][contract-drift][✅ 已解决 PR #27]`

- **现状/问题**:唯一生产 adapter hardcode `supportsNativeResume:false`,已存的 `externalSessionRef` 在 `invokeLocalExecutorThroughBridge` 被静默丢弃,`buildSessionPrompt` 不注入历史,第二轮拿不到第一轮会话上下文。
- **证据**:`packages/worker-runtime/src/worker/runtime.ts:1788-1801`(invokeLocalExecutorThroughBridge 不读 externalSessionRef)、`packages/engine-bridge/src/index.ts:249-264`、`runtime.ts:1761`、`executor.ts:92-183`、`runtime.ts:1135-1156`(buildSessionPrompt 只注 request.trim())。
- **建议**:在 `createLocalExecutorBridgeAdapter` 路径接真实续接:给 LocalExecutorInput 加 resume 输入、把 externalSessionRef thread 进 per-engine buildArgs(codex `resume <id>`/claude `--resume <id>`)并翻 `supportsNativeResume:true`;在 REAL 生产 adapter(非 fake)上加端到端 follow-up 测试。
- **状态**:✅ 已解决 PR #27(原生 resume 接通,真引擎实证;runtime.md 按引擎 resume 标注同步)。

### PROJ-1 · bootstrap repair 不带 overlay 重投影,定制过的 worker 每次 daemon 重启自锁 `[high][contract-drift][✅ 已解决 PR #27]`

- **现状/问题**:`repairWorkspaceLayouts` 用 `projectWorkerOverlayAssets:false` 重投影,既把 AGENTS.md/CLAUDE.md 还原成 baseline,又让 freshness gate 下次 invocation 硬抛 `PROJECTION_RECEIPT_STALE`,唯一恢复是手动 UI 刷新。
- **证据**:`runtime.ts:247`、`runtime.ts:1282-1291`、`workspace-projection.ts:107-115/148`、`runtime.ts:1091-1105`、`workspace-projection.ts:182-199`、`runtime.ts:1424-1425`。
- **建议**:让 repair 带 `projectWorkerOverlayAssets:true` + `preserveUnownedExistingTargets:true`(比照 `reprojectWorkspaceAssets` runtime.ts:349-359),repair 后更新 `metadataJson.engineAssetProjection`,保留 marker;加 create-with-overlay → 第二次 init/repair → 断言 overlay 内容磁盘存活且不抛 STALE 的契约测试。不引 chezmoi。
- **状态**:✅ 已解决 PR #27。

### WDLM-1 · PID 存活性裸用 process.kill(pid,0) 无 cmdline 校验 `[high][known-pitfall][⬜ 待办]`

- **现状/问题**:`isProcessAlive` 是裸 `process.kill(pid,0)`,持久 pidFile 跨 crash/reboot;幽灵 running 空操作不 spawn、EPERM 把 stop 打崩、5s 挂死。正确 guard `canRestartManagedDaemon` 已在仓里但只接升级路径,且 check-then-spawn 非原子(TOCTOU)。
- **证据**:`aiworker.ts:733-741`(isProcessAlive)、`:1113-1118`、`:1206-1228`、`:1417`(stop catch 只吞 ESRCH)、`:1460-1467`、`updater.ts:344-367`(canRestartManagedDaemon)。
- **建议**:(1) 给 daemonStatus/start/stop 加 cmdline 身份校验;(2) **必须先泛化 predicate** 认 `bun …/aiworker-bun.js daemon foreground` 与 compiled `<binary> daemon foreground` 形态再复用 —— **不能照搬 `canRestartManagedDaemon`**(其 `endsWith('/aiworker')` 不匹配 shipped argv,会把真守护当 foreign 重 spawn);(3) stop 旁吞 EPERM 并清 stale pidFile;(4) check-then-spawn 换 atomic-mkdir/O_EXCL 锁。全零依赖。
- **状态**:⬜ 待办。

### WWB-1 · 手搓 838 行流式 Markdown 解析器,重造已声明从未 import 的 react-markdown/remark-gfm `[high][reinvented-wheel][⬜ 待办]`

- **现状/问题**:`assistant-markdown.tsx` 从零实现 parser+renderer + 流式修复 + CJK 边界 + href allowlist;`react-markdown ^10.1.0` / `remark-gfm ^4.0.1` 已声明但全仓零 import = 死重量;无 memo,每个 streamed token 重 parse 整条消息。git log 证一条真实 bug 流(CJK 粗体/有序列表/list key/globstar/glob 误判)。
- **证据**:`packages/ui/src/components/assistant-markdown.tsx`(parseMarkdownBlocks:71-179、renderInlineMarkdown:437-553、repairStreamingMarkdown:48-69、CJK:788-837、normalizeAssistantHref:685-700)、`apps/worker-web/package.json:32-33`(声明)。
- **建议**:用已声明的 react-markdown + remark-gfm 替换 parser 核心(bundle-size gate 保持绿),只保留 AIWorker 特有:http/https href allowlist 走 rehype-sanitize/harden、branch/path chip 做 custom remark/rehype 插件;加 per-block memo。若死依赖不接线则删除。KaTeX/Mermaid 要再按 bundle-size 基线单评 Streamdown。
- **状态**:⬜ 待办。

### ci-split · PR/main CI 只跑 lint,typecheck/契约测试/单元测试推迟到 tag `[high][known-pitfall][✅ 已解决 PR #26]`

- **现状/问题**:`lint.yml` 触发 PR+push:main 但只跑 `bun run lint` + 5 个 worker-web step,typecheck/test:contracts(testing.md 自承 primary guardrail)/单测全推到 tag 时 —— broken main 只在 tag 时发现。
- **证据**:`lint.yml:3-6/29-45`、`release.yml:46-47`、`package.json:54`(test:contracts)、`docs/testing.md:7`。
- **建议**:给 lint.yml 加 job,对每个 PR/push-to-main 跑 `bun run typecheck` + `bun run test:contracts`(二者确定性、无 engine auth、无 browser)。**不要整体加 `bun run test`** —— 它扇出到 host-cli 的 tmux flake + host/worker-web vitest,先隔离稳定其 flaky 成员。昂贵/auth/browser/smoke/publish 门保持 tag-only。
- **状态**:✅ 已解决 PR #26(lint.yml 加 checks job 跑 typecheck+test:contracts)。

### SL-3 · engine-bridge 包装原生 CLI + 自研 reconciler/reattach/进程监管,重造 Claude Agent SDK 与 Codex SDK `[high][reinvented-wheel][🟡 部分解决]` `[系统级]`

- **现状/问题**:Claude Agent SDK(resume/forkSession + `pathToClaudeCodeExecutable` 复用已登录 CLI)与 Codex SDK(`resumeThread`)恰好提供 AIWorker 自研全部(engine-stream.ts 580 行 5 方言、6 套 buildArgs、自研 reconciler/进程监管),且自研版更差(EB-1 失忆)。auth 不挡路:SDK 委托已安装 CLI 登录态。
- **证据**:`engine-stream.ts`(352-475)、`executor.ts:92-183`、`process-manager.ts:110-115`;官方文档(2026-06)核实 SDK 提供 resume + CLI-credential 复用。
- **建议**:不整体替换(cursor/gemini/opencode/qwen 无对应 SDK、统一 normalize 层有价值)。仅对 claude-code 与 codex 评估用官方 SDK typed 流 + 内建 resume(把已存 externalSessionRef 当 resume/resumeThread 传入)—— 按构造修好 EB-1 这两个引擎。优先 EB-1 直接修复,本条是同一修复更优架构变体。同步把 docs/runtime.md 的 B+ bridge 宣称做实或降级。
- **状态**:🟡 部分解决 —— EB-1 的多轮失忆已由 PR #27 接通真实 resume(已做);**未做**:claude/codex 改走官方 SDK 的架构迁移(本条独立残留),仍是手搓 stdout 解析。

### EB-3 · doc 称 B+ 结构化 bridge 但唯一生产 adapter 是 local-executor shim `[medium][contract-drift][🟡 部分解决]`

- **现状/问题**:`runtime.md:187-188` 称「per-engine Codex/Claude adapter 注册进 registry」,生产 registry 里根本没有,只有一个泛型 local-executor shim;adapter 级 protocol cancel 退化成 `{}`(实际取消靠 process-manager 的 OS-signal escalation)。
- **证据**:`runtime.ts:970-974`、`runtime.ts:1754-1756`(no-op cancel)、`process-manager.ts:310-316`(SIGINT→SIGTERM→SIGKILL)、`docs/runtime.md:174,187-188`。
- **建议**:要么 (a) 注册真实结构化 Codex/Claude adapter 使 supportsNativeResume/supportsProtocolCancel 变 live(同解 EB-1/EB-2),要么 (b) 把 `docs/runtime.md:174-231 + 187-188` 降级为实况:CLI-spawn local-executor shim、无 per-engine 注册 adapter、protocol cancel 退化为 OS-signal escalation。
- **状态**:🟡 部分解决 —— inert resume 与 EB-1 同根、已随 PR #27 接通;**未做**:doc-vs-registry 架构漂移 + no-op protocol cancel 的 doc 降级或 registry 做实(本条独立残留)。

### EB-4 · 每个引擎以全权限/sandbox-bypass 跑员工真机,零隔离零披露 `[medium][known-pitfall][⬜ 待办]`

- **现状/问题**:claude `bypassPermissions`、codex `workspace-write` + **主动放宽** `network_access=true`、cursor `--force --trust`、gemini `--yolo`、opencode/qwen 同类;`sanitizeEngineEnv` 是 denylist、整个 host env 透传;无容器/jail。OpenAI 文档证 workspace-write 默认 network OFF。
- **证据**:`executor.ts:111-117`(codex network 覆盖)、`:100,140-141,153,158,164,175`、`engine-env.ts:5-13`、`process-manager.ts:110-115`。
- **建议**:(1) **停止默认 codex `network_access=true`**,保留引擎自身 network-off 默认除非运营者显式 opt-in(干净约束安全的修复);(2) 有 sandboxed-but-auto 模式的引擎优先用它;(3) 首次运行做**披露**(disclosure ≠ 配置)取得知情同意;(4) **不要**把最宽标志做成必填 per-employee 配置(违 zero-config-员工 约束)。
- **状态**:⬜ 待办。

### PROJ-2 · freshness gate 只指纹 INPUT 并硬阻塞,不做 target-vs-actual 调和 `[medium][known-pitfall][⬜ 待办]`

- **现状/问题**:`computeWorkspaceProjectionFreshnessMarker` 只 SHA-256 INPUT,从不读磁盘实际投影字节;gate 不匹配即抛 STALE,invocation 路径无 catch-and-reproject —— 既 over-block 又对手改完全 under-detect。
- **证据**:`workspace-projection.ts:128-151`、`runtime.ts:1100-1105`、`worker.ts:657-669`(唯一 refresh)。
- **建议**:marker 留作快速变更探测器,但不匹配时**调和(auto-reproject-then-proceed)而非抛错**,至少当唯一分歧是 overlay membership 时;硬 STALE 留给「重投影本身跑不了」。若必须保留硬 gate,额外指纹磁盘 receipt entry 以测手改漂移。PROJ-1(已修)是更高优先具体步骤,本条是其底层设计教训。
- **状态**:⬜ 待办(PROJ-1 已修了急性症状,本设计教训未动)。

### PROJ-3 · 四份发散的字面 secret 检测器,projection/daemon 拷贝缺 storage 的 prefix-disguise guard `[medium][reinvented-wheel][⬜ 待办]`

- **现状/问题**:engine-projection 与 worker-daemon 的 `isSecretReference` 只做 `startsWith`、无 disguise guard;storage 两 plane 带 `if (body.includes('=')) return false` 强守卫。`env:OPENAI_API_KEY=sk-realsecret` 被前两者放行、被后两者拒绝。读路径 redactor 认的 ghp_/AKIA/AIza/JWT/PEM 四个写路径都不认。
- **证据**:`workspace-projection.ts:529-545`、`worker.ts:1366-1378`、`storage-sqlite/src/worker/index.ts:148-180`、`storage-sqlite/src/host/index.ts:612-638`、`engine-bridge/src/index.ts:54`。
- **建议**:四份收敛成一个共享内部模块,取**最强行为**(storage 的 prefix-disguise guard + engine-bridge 的宽格式),四处全 import。**收敛方向是把弱拷贝抬到强行为,绝不把 storage 放松去迁就弱拷贝。** 补 `env:KEY=literal` prefix-disguise 回归测试。secretlint 仅作后续可选升级(先确认 in-memory-string 适配)。
- **状态**:⬜ 待办。

### PROJ-4 · bootstrap repair 无 try/catch,一个不可投影 workspace 拖垮整个 daemon boot `[medium][known-pitfall][✅ 已解决 PR #27]`

- **现状/问题**:`init()` 无 try/catch await `repairWorkspaceLayouts()`,后者无条件遍历每个 workspace 重投影;descriptor MCP 源缺失/overlay readFile 失败任一抛出即冲出 init 中止 boot —— 一个 workspace 的可恢复错误干掉整个 Worker。
- **证据**:`runtime.ts:237-250`、`runtime.ts:1282-1291`、`workspace-projection.ts:296-297`、`runtime.ts:1338,1355`(无守卫 readFile);对比 `reconcileEngineInvocationsOnStartup` runtime.ts:252-314 容忍 per-invocation 部分状态。
- **建议**:每个 per-workspace repair 迭代包 try/catch:记录失败(脱敏)、在该 workspace metadata 标 needs-repair、继续 boot 其余;fail-fast 只保留给 single-active-worker 结构性不变量。
- **状态**:✅ 已解决 PR #27(随 PROJ-1 try/catch)。

### SD-1 · soul-descriptor 仍 ship 已废弃 micro-app 表面:死 lifecycle/permission/mounted schema 零运行时使用 `[medium][contract-drift(downgraded)][⬜ 待办]`

- **现状/问题**:`SoulAppScopedContext/SoulAppLifecycleProtocol/SoulAppEventProtocol` + `soulAppMountedSurfaceScopeSchema/Permission*Schema/isLoopbackMountedServiceUrl` 全 ship 为 typed/importable API,grep 全仓 9 符号零真实 consumer —— 废弃 micro-app/capability 模型滞留 public 包表面,author 困惑。
- **证据**:`protocol.ts:5-30`、`manifest.ts:62-96`、`soul-app/index.ts:1-21`;`buildHostedSoulApp/projectSoulAppSoul` 仍用(registry.ts:14,185)正确保留。
- **建议**:删 protocol.ts husk + manifest.ts permission/mounted schema + isLoopbackMountedServiceUrl + re-export;保留 soulAppIdSchema/engine-asset/projection-receipt schema 与 buildHostedSoulApp/projectSoulAppSoul。**必须同步**更新 `tests/architecture/refactor-contract.test.ts`:从 line-765-778 源列表移除 protocol.ts、删 line-783 `disable: (context: SoulAppScopedContext)` forbidden snippet,再加正向 guard 断言不导出 permission/mounted/lifecycle 表面。
- **状态**:⬜ 待办(原 high 复核降 medium:schema 100% unreferenced、零运行路径)。

### SD-2 · descriptor identity 是开放 record 而非文档化 {id,name,description?} `[medium][contract-drift(downgraded)][⬜ 待办]`

- **现状/问题**:`identity` 用开放 `hostInterpretedObjectSchema`,实证 ACCEPTS `{}`/`{capability:{workflow}}`/`{recall,playbook}`,blocklist 只挡 `{memory}` 漏同义词 —— Host publish 把 inert 领域 payload 持久成 Soul release version。(危害收窄:Host publish 路径 host-server.ts:725 已守 id/name 空/非串、Host 从不解释 descriptorJson,故是 junk 存储非 PK 损坏/安全洞。)
- **证据**:`index.ts:114,155-161`(开放 identity)、`host-server.ts:722-726`(第二 guard)、`worker-runtime/src/soul-app/registry.ts:67,207`(worker install 路径 `as string` cast,validateDescriptor 是 stub)、`soul-sdk/src/index.ts:280-284/313-318`、`docs/protocol.md:30`。
- **建议**:把 identity 关闭:`z.object({ id: z.string().min(1).regex(<ID_RE from manifest.ts:5>), name: z.string().min(1), description: z.string().optional() }).strict()`。**必需协同**:更新 soul-sdk `fallbackDescriptor()`(index.ts:313-318)传 placeholder id/name 否则会抛;可选去 registry.ts:67 的 `as string`。**不要移除递归 forbidden-key walker**(index.ts:31-73)—— 它仍管 engine/mcp target,只关闭 identity。
- **状态**:⬜ 待办(原 high 复核降 medium,两处 FALSE 证据校正后)。

### REDACT-1 · 持久化路径脱敏正则比 console 诊断弱,漏无引号 api_key=/password: `[medium][contract-drift][⬜ 待办]`

- **现状/问题**:engine-bridge/storage 的赋值分支硬编码引号要求,error-handler 诊断分支不要求引号 —— 方向反转:守持久化的最弱、只打 console 的最强。实跑 `redactValue({data:'stdout: api_key=mysecret123'})` 等三例(模拟 raw stdout chunk)全 LEAKED 原样落库,违反 runtime.md「persist 前必脱敏」明文契约。
- **证据**:`engine-bridge/src/index.ts:55`(引号要求)、`storage-sqlite/src/worker/index.ts:39`、`worker-daemon/error-handler.ts:6`(无引号分支)、`runtime.md:299-302`;结构兜底 isSecretLikeKey(index.ts:442)只覆盖 secret-named-key 对象、不覆盖自由文本。
- **建议**:把 error-handler 的无引号赋值分支(键名词根 + 可选引号 + `[^"'\s]+` 值)提为 engine-bridge 共享导出,display 脱敏/storage 写守卫/worker-daemon 诊断三处共用消除发散。补契约测试:断言裸 `api_key=secret`/`password: secret`(包在 {data}/{text}/{message} 非-secret-key 自由文本里)在持久路径被脱敏。维持 medium(v1 无跨信任主体暴露,Phase 2 Host 拉 Worker DB/经隧道透出时升 latent-high)。不引 redact-pii 运行期依赖。
- **状态**:⬜ 待办。

### WDLM-3 · 后台 aiworker start 在子进程绑端口前就打印预测 URL `[medium][known-pitfall][⬜ 待办]`

- **现状/问题**:`startDaemonProcess` child.unref() 后返回据请求算的 daemonUrl 非已绑端口,`startDaemon` 立即 printJson 无就绪等待;子进程实跑 migration+bootstrap+Bun.serve 才写真实 URL —— 冷启动 race 确定性,follow-up 脚本/`aiworker open`/员工粘贴 URL 会撞 connection-refused/404。
- **证据**:`aiworker.ts:1194-1197`、`:1234-1238`、`:1520-1526`、`worker.ts:228`(/health 存在)。
- **建议**:spawn 后轮询 `GET <url>/health`(复用现有短超时 fetch)直到 ok 或有界 deadline;成功后读子进程写的 `aiworker-daemon.json` 打印真实绑定 URL;子进程永不健康则 fail loudly。零新依赖。
- **状态**:⬜ 待办。

### WDLM-4 · 后台 spawn target 对 bun build --compile standalone 二进制坏掉且无 start-smoke `[medium][known-pitfall][⬜ 待办]`

- **现状/问题**:`spawn(process.execPath, [resolve(process.argv[1]), 'daemon', 'foreground'])` 假设 argv[1] 是脚本路径;compiled binary 里 argv[1] 是首个用户参数(如 'start')→ respawn 今天就坏。github-tarball 是带 auto-upgrade 的支持安装形态,smoke 只跑 --version/doctor/bootstrap/list 从不跑 start。npm bin 路径 OK。
- **证据**:`aiworker.ts:1173-1188`、`smoke-standalone-runtime.ts:51`(产 compiled binary)、`:66-75`(smoke 不跑 start)、`updater.ts:8,200`(github-tarball auto-upgrade)。
- **建议**:分支 compiled-binary 情形(import.meta.main/embedded marker):只用 `process.execPath` + 子命令参数 respawn,无脚本参数。扩 smoke-standalone-runtime 对 compiled binary 跑真实后台 start → poll /health → stop。**与 WDLM-1 的 predicate 泛化耦合**,使 cmdline-verify 认 compiled-binary 命令形态。
- **状态**:⬜ 待办(原自评 low,复核升 medium:支持安装形态的 start 坏掉且未测)。

### SIM-1 · invocation_status enum 建模同步 v1 从不产生的 queued→starting 异步管线 `[medium][unnecessary][⬜ 待办]`

- **现状/问题**:enum 7 值、column default 'queued'(死默认,生产两调用点显式传 'running'),engine-bridge 镜像;grep 全仓 `status:'queued'/'starting'` 生产者 0(仅 web/cli test mock);为未承诺 async pipeline 预留死宽度。
- **证据**:`schema.ts:78`、`engine-bridge/index.ts:19`、`runtime.ts:638/526`(显式 running)、consumer:reconciler runtime.ts:267、cancel guard runtime.ts:778/worker.ts:609、ternary runtime.ts:809、UI mapper bridge-event-mapper.ts:400。
- **建议**:优先 (a) 收敛到 v1 实际生产的 running/succeeded/failed/cancelled/lost,删 queued/starting 析取支与 :809 的 'not_spawned' 死臂、UI mapper 去 queued/starting 分支。若团队确认 async pipeline 是近期 committed milestone(当前 docs 无)走 (b) milestone marker gate + 加真正驱过 queued→starting 的测试。enum TS-only 无 migration。不引状态机库。(注:真正不可达只有 :809 ternary 一臂,reconciler/cancel guard 因同时检 'running' 是 live。)
- **状态**:⬜ 待办。

### SIM-4 · SSE live-tail 流式分支自承未测的并发代码随 v1 出货 `[medium][known-pitfall][⬜ 待办]`

- **现状/问题**:streamSSE 分支含 bus.subscribe + promise-chain 串行化 + abort listener + settled 双发守卫,代码逐字自标 'unverified: no test exercises this live-tail branch … defensive code for a future asynchronous engine';v1 同步 executor 在 EventSource 连上前已驱到终态,该分支 v1 不可达(latent 非 live)。
- **证据**:`worker.ts:1238-1290`、`:1258-1265`(自承注释)、`:1235-1236`(204 是同步 executor 唯一命中);docs/testing.md Deferred 三件套不含它。
- **建议**:在 live-tail 变 load-bearing 前二选一:(a) 加驱动可控长跑 invocation 的测试真走 subscribe/replay/abort/双发守卫;或 (b) 把 live-tail 放显式 async-engine feature gate 后让它在 v1 明确 inert。保留同步 executor 真命中的 replay-then-close + 204 路径。与 SIM-1 同批处理(同 async-scaffolding 主题)。
- **状态**:⬜ 待办。

### WWB-2 · SSE resume 契约半接线:冻结 ?after cursor 遮蔽文档化的 Last-Event-ID resume,前端 EventSource 无 onerror `[medium][contract-drift][⬜ 待办]`

- **现状/问题**:后端读 cursor 为 `query('after') ?? header('last-event-id')`(query 优先),前端总追加 `?after=`,故 server 的 last-event-id 分支对唯一真实 consumer 永不 fire;全文件零 onerror,5xx 静默死流靠并行 1s tail-poll 兜底(故被掩盖非破坏)。
- **证据**:`worker.ts:594`、`:1207-1211`(误导注释)、`use-invocation-events.ts:220-222`(总追加 ?after)、`:121`(EventSource)、`:178`(scheduleTailPoll)。
- **建议**:单源化 resume 契约:要么 (a) EventSource URL 去掉 ?after 让后端 Last-Event-ID header 路径成 live,要么 (b) 删死的 `?? last-event-id` fallback 与误导注释纯靠 tail-poll 拥有 cursor。加 onerror 使 CLOSED/errored EventSource 确定性检测。**不加 reconnecting-eventsource 库。**
- **状态**:⬜ 待办。

### TGA-1 · import-boundary 强制三重化,eslint no-restricted-imports/dependency-cruiser 已在栈内 `[medium][reinvented-wheel][⬜ 待办]`

- **现状/问题**:`scripts/check-soul-app-boundaries.ts` 与 `apps/worker-cli/src/soul-app-boundary.ts` 维护字节等价 7+4 包列表,eslint.config.ts 是第三处;`resolveRelativeImport` 只解 `./`-relative、不处理 @/ alias/tsconfig-path/re-export(正是 dependency-cruiser 解决的 bypass)。
- **证据**:`check-soul-app-boundaries.ts:21-50/403-437`、`soul-app-boundary.ts:16-53`、`eslint.config.ts:24-29`(已对 souls/** 跑同规则)、`inversion-guards.test.ts:28-41`。
- **建议**:扩展已有 eslint no-restricted-imports 到 source 级 worker-\*↛host-\*,7+4 列表收敛到单一真源,close alias/re-export/undeclared-import bypass。**保留一条精简的 package.json dep-direction 断言**(peer/optional dep 是 graph-invisible)—— **不要整体删 G2/G3/G5**。保留真正 tool-shaped 的 descriptor JSON walk、retired-surface audit。
- **状态**:⬜ 待办(原 high 复核降 medium:DRY/可维护性、零正确性影响)。

### TGA-2 · 186 行 parity guard 专门看守一份死代码拷贝 `[medium][unnecessary][⬜ 待办]`

- **现状/问题**:`apps/worker-cli/src/soul-app-boundary.ts`(214 行)无 live runtime caller,parity test 守护的「CLI runtime 校验层」不存在;叠加 TGA-1 的三重化。
- **证据**:grep 仅命中文件本身 + `soul-app-boundary-parity.test.ts:27` + `package-ownership.test.ts:172-175`(读文件为字符串的隐藏第三消费者)。
- **建议**:删 `soul-app-boundary.ts`(无 caller)、删 `soul-app-boundary-parity.test.ts`,并**移除/调整** `package-ownership.test.ts:172-175` 的孤儿命名 guard(否则 CI 红)。若日后真要 CLI-time 边界检查,把单一权威 scanner(或 TGA-1 的 eslint/dependency-cruiser 配置)接进真实 `aiworker soul build`/install,而非维护第二份拷贝。
- **状态**:⬜ 待办(原 high 复核降 medium)。

### TGA-4 · release gate 自称确定性 fail-fast,却把项目反复标 flaky 的 browser/tmux 证明焊进来 `[medium][contract-drift][🟡 部分解决 PR #26]`

- **现状/问题**:release:check 把 `test:browser:freeform` + `test:browser:phase2`(host-single-serve/phase2-host-worker-access/host-dev-loop)与静态 guard 同列;项目记忆跨多 session 确认这些 spec flaking、routinely「隔离重跑判 flake」—— 真实回归与环境 flake 产生相同红。
- **证据**:`package.json:66/61-62`、`docs/testing.md:7/10`;项目记忆 rc.8/9/10 反复撞。
- **建议**:取 **option (b) 非 (a)**:**保留** browser proof 在 gate(standalone-Worker 质量门需 browser proof,静态 guard 曾全绿而 chat 未接线只有 browser proof 抓到),但**做成确定性** —— 绑固定非争用端口、加有界重试 + 硬 cap、hardening tmux/serve 生命周期杀 5000ms flake;然后更新 docs/testing.md 诚实刻画 browser tier。
- **状态**:🟡 部分解决 PR #26(release:check 拆 worker 门 + `release:check:phase2`,host flaky 移到 phase2 门让 v1 发版不被拖累);**未做**:phase2 spec 本身的确定性硬化/有界重试/端口隔离/tmux 生命周期 hardening。

### release-check-monolithic · release:check 是单条 16-gate && 链,掩蔽下游失败并把 typecheck+lint 跑两遍 `[medium][contradicts-best-practice][✅ 已解决 PR #26]`

- **现状/问题**:release:check 16 gate `&&` 连,position 16 `bun run check`(=`typecheck && lint` 逐字重复)、docs:check 跑三次;作单一 CI step,首个红 gate 中止掩蔽下游。
- **证据**:`package.json:66/65/42/41`、`release.yml:46-47`、`check-doc-contract.ts:624-630 + ~590-607`(三方锁)。
- **建议**:两独立修复。(1) 删尾部 `bun run check`(**三处锁定位置 lockstep 更新**:package.json:66、docs/testing.md Current Release Gates、check-doc-contract.ts expectedReleaseGateCommands)。(2) 每次 surface 所有 gate 结果但**保留 release:check 作单一权威 aggregator**(SKILL.md:34 + 锁要求),优先把每个 gate 作命名 sub-script 组成独立 release.yml step,或加 continue-on-error。
- **状态**:✅ 已解决 PR #26(拆双门 + 删冗余 check)。

### SL-5 · 跨 11 域反复出现的 reinvented-wheel 主题:同类基础能力手搓 2-5 份且彼此漂移 `[medium][reinvented-wheel][⬜ 待办]` `[系统级]` `[cross-cutting]`

- **现状/问题**:贯穿全仓的系统性模式、Phase 2 过度建造的同根病灶 —— secret 检测器 4 份(PROJ-3)+ 正则 5 份(SD-3/REDACT-1/REDACT-2)、import-boundary 三重化(TGA-1)+ 186 行 parity guard(TGA-2)、838 行 Markdown 解析器(WWB-1)、手搓 OIDC(auth-1,见 host 独立 spec)、手搓 relative-time(WWB-4)、tmux supervisor(reinvented-procfile)、双包版本同步(manual-two-package)。与全局 CLAUDE.md「优先用托管轮子别手搓」直接冲突。
- **证据**:见各子 finding 证据行(PROJ-3/SD-3/REDACT-1/REDACT-2/TGA-1/TGA-2/WWB-1/WWB-4 本 spec;auth-1 见 host 独立 spec)。
- **建议**:把「手搓 vs 轮子」立为显式工程约束并机械化:secret 检测/正则收敛到 ONE 内部共享模块(取最强行为);import-boundary 收敛到 eslint no-restricted-imports + 单一 package 列表真源;markdown 用 react-markdown/remark-gfm;relative-time 用 Intl.RelativeTimeFormat。**更重要的是把这条原则前置到 review** —— 动手写多步基础设施(隧道/守护/认证/解析)前先问「有没有现成轮子或单一真源」。
- **状态**:⬜ 待办(伞 finding,随各子 finding 收敛逐步关闭)。

### EB-2 · 手搓 5 方言 stream-json 解析 + 坏掉的 resume 链,重造官方 Claude/Codex SDK `[low][reinvented-wheel(downgraded)][⬜ 待办]`

- **现状/问题**:`engine-stream.ts` 580 行手解析 5 方言,`codexThreadExternalSessionRef` 抽 thread_id 作 resume ref(按 EB-1 从不被消费);package.json 零 engine SDK 依赖。
- **证据**:`engine-stream.ts:352-475/228-234`、`process-manager.ts:110-115`。
- **建议**:仅对 claude-code 与 codex 评估用官方 SDK typed 流 + 内建 resume(会按构造修好 EB-1 这两个引擎)。其余四引擎保留手搓。本条是 EB-1/SL-3 同一修复的更优架构变体、非独立必做项;优先 EB-1 直接修复。
- **状态**:⬜ 待办(medium→low downgrade:只覆盖 6 引擎中 2 个、统一 normalize 层有价值、其 payoff 已计入 EB-1)。

### PROJ-5 · reserved no-op projection-overlay kind 为写不出文件的特性 ship 完整管线 `[low][unnecessary][⬜ 待办]`

- **现状/问题**:`ReservedOverlayProjectionConfig` JSDoc 自承「produces no projected file」,有条件折进 marker + omit-when-empty + 自身 fingerprint,resolver 对无 projection-overlay 行的 worker 返 []。
- **证据**:`workspace-projection.ts:42-49/425-440`、`runtime.ts:1366-1382`、`runtime.test.ts:734`(证移 marker 不投文件)。
- **建议**:可选清理非阻塞。推迟 projection-overlay 管线直到真有 projection-level config 特性设计(借 AGENTS.md:81 pre-1.0 destructive-refactor,届时 kind + marker 一起加)。若团队偏好保留作文档化 forward-compat anchor 也是可辩护的低成本选择。
- **状态**:⬜ 待办(非紧急)。

### PROJ-6 · 手搓 {{var}} 模板引擎静默把未知/大小写不匹配占位符替成空串 `[low][known-pitfall][⬜ 待办]`

- **现状/问题**:`renderTemplate` 用 `gi` 大小写不敏感正则但 lookup 大小写敏感,变量表仅 appId/workerName/workspaceName;实证 `{{APPID}}`→''、`{{example}}`→''、字面 `{{foo}}`→''(无转义)。当前无 soul ship 字面 `{{`,latent 非 active。
- **证据**:`workspace-projection.ts:566-568`、`runtime.ts:1326-1332`、应用于 baseline + author 写的 AGENTS.md/CLAUDE.md(workspace-projection.ts:185,193,205)。
- **建议**:未知占位符显式处理(抛错或要求注册默认值),加文档化的字面 double-brace 转义,修大小写不匹配(去 i flag 或归一化 key)。**不要为三个变量引 Handlebars/Mustache。** 低优先但廉价。
- **状态**:⬜ 待办。

### SD-3 · 字面 secret 检测正则跨 5 模块复制粘贴并已漂移(worker-daemon settings 拷贝更弱)`[low][known-pitfall(downgraded)][⬜ 待办]`

- **现状/问题**:5 份拷贝(soul-sdk/storage host+worker/engine-bridge/worker-daemon settings),settings.ts 缺 token=/apiKey:= 分支。**但 EXPLOITABLE-GAP 被证伪**:settings.ts 唯一调用点 `:117 if (body.includes('=')) return false` 在正则前先跑,缺失分支不可达,无实际漏过。纯可维护性/anti-drift。
- **证据**:`soul-sdk:7-8`、`storage-sqlite host:19-20/worker:39-40`、`engine-bridge:54`(导出 SECRET_FORMAT_ALTERNATION)、`worker-daemon/settings.ts:104/117`、`error-handler.ts:2`(唯一 importer);`engine-bridge:50-53` 注释已声明单一真源意图。
- **建议**:完成代码库已开始的单源 consolidation:让 SECRET_FORMAT_ALTERNATION(或中立 packages/secret-redaction)成唯一真源,soul-sdk/两 storage plane/settings import。加契约测试断言无模块自声明 sk-/ghp_/AKIA 正则。**不要框架成修活泄漏**(settings.ts 不可利用),**不要引 gitleaks/trufflehog/secretlint**(运行期 reject ≠ CI 扫描器)。
- **状态**:⬜ 待办(medium→low downgrade)。

### WDLM-2 · 手搓 detached-spawn daemonize 复制 supervisor 职责 `[low][contradicts-best-practice(downgraded)][⬜ 待办]`

- **现状/问题**:`aiworker.ts:1166-1198` 是完整后台监管机制,stop/restart 手搓 SIGTERM+poll+pidFile cleanup。原 finding 两处误归引用(runtime.md:71-73 实为 Phase-2 HOST 非 Worker;index.ts:1-14 实无 Bun.serve/signal handler),委托-supervisor 半边只适合 Phase-2 Host/operator box。
- **证据**:`aiworker.ts:1166-1198/1407-1424/1430-1438`;server 实在 aiworker.ts:1507/1539。
- **建议**:折叠进 WDLM-1。保留 `aiworker daemon foreground` 作受监管入口(已真);Type=simple/PM2 仅文档化为 Phase-2 Host/operator box 推荐部署,非 zero-config 员工 Worker。唯一具体动作是 WDLM-1 的收敛。**不加运行期 process-manager 依赖。**
- **状态**:⬜ 待办(medium→low,折叠进 WDLM-1)。

### WDLM-5 · Phase-2 Worker Access 隧道把 exp-backoff + 半开探测 ship 进 v1 standalone daemon `[low→informational][unnecessary(downgraded)][⬜ 待办(无需动作)]`

- **现状/问题**:`connectWorkerAccessTunnel` 实现 exp-backoff+equal-jitter+missed-pong+reprovision-hint,但 gated —— 非 `AIWORKER_HOST_URL` 设 + `access.mode==='worker_access'` 即返 null,standalone v1 路径不跑。无 bug、无约束违反、无 hot-path 耦合。
- **证据**:`provision-client.ts:209-212`(gated)、`:141-144/243-245`、`runtime.md:311-331`。
- **建议**:降 informational,v1 正确性无需动作。**不要用本条削弱隧道的 standalone-non-fatal 保证。** 若日后真要瘦 v1 表面积,可把重连机降为有界重试直到真 Host 行使 Phase-2 hardening。
- **状态**:⬜ 待办(无需动作;reviewer-approved 刻意建造,见 PR #13)。

### SIM-3 · reserved 'deleted' session-lifecycle enum 值无生产者无消费者,纯 YAGNI `[low][unnecessary][⬜ 待办]`

- **现状/问题**:`sessions.status` enum=['active','archived','deleted'],注释自承 'deleted' reserved、v1 无 soft-delete 生产者;deleteSession 是物理 DELETE,worker-control-protocol 对 'deleted' grep 空(Phase-2 reservation 抗辩被证伪)。
- **证据**:`schema.ts:53-56`、`engine-bridge/index.ts:18`、`index.ts:758`(物理 DELETE)、`worker.ts:567`(DELETE 路由)。
- **建议**:从 enum 与 AIWORKER_SESSION_LIFECYCLES 删 'deleted',待真有 soft-delete 生产者时同 commit 加回;DELETE 保持显式硬删。可与其他 cleanup 合并提交,不必单独优先(近乎 cosmetic)。
- **状态**:⬜ 待办。

### SIM-5 · 重复 invocation-create 端点:扁平 POST /api/engine/invocations 与嵌套冗余 `[low][contradicts-best-practice(downgraded)][⬜ 待办]`

- **现状/问题**:flat create 与 nested create 委托同一 `createSessionInvocationFromBody`,product client 只用 nested;但 protocol.md:151 明确这些是「broker routes, not business product APIs」,flat POST 补全资源动词集 —— 文档化 broker 对称性非偶然重复。smoke 只对 flat 做 OpenAPI 存在性断言、从不发请求,功能调用者全仓 0。
- **证据**:`worker.ts:572/577-583`、`smoke-dist-release.ts:344/353-358`、`protocol.md:140/151/174`。
- **建议**:可选清理:删 flat create 路由并把 smoke OpenAPI 断言改指 nested(保留 GET/cancel/reconcile),或在 protocol.md 显式注明 flat create 为 diagnostic/broker-only。非阻塞不必优先。
- **状态**:⬜ 待办(low downgrade)。

### REDACT-2 · 自研 7 形态凭据正则漏一线 SaaS 格式(Stripe sk_/Slack xoxb/npm token/Basic)`[low][reinvented-wheel][⬜ 待办]`

- **现状/问题**:`SECRET_FORMAT_ALTERNATION` 手工 7 形态白名单(PEM/JWT/ghp_/gho_/github_pat_/AKIA/AIza),storage 复刻;实跑确认漏报 Stripe `sk_live_`(团队只匹连字符 sk-)、Slack `xoxb-`、webhook、`npm_`、`Authorization: Basic`。(自我设界:sk-proj-/sk-ant- 已被 sk- 覆盖、token= 已覆盖,非漏洞。)
- **证据**:`engine-bridge/src/index.ts:54`、`storage-sqlite/src/worker/index.ts:39`。
- **建议**:把 Stripe sk_/rk_、Slack xox[bpoa]-/xapp-/hooks.slack.com、npm_、Basic 等高置信前缀型规则扩进 `SECRET_FORMAT_ALTERNATION` 单一真源(改一处即 storage+诊断同覆盖);用 gitleaks default ruleset 仅作 **pattern data**、不在运行期跑其二进制。维持 low。
- **状态**:⬜ 待办。

### WWB-3 · 每次 mutation 经单个手搓 {data,error,loading} 快照重取全部六个 broker 端点 `[low][contradicts-best-practice][⬜ 待办]`

- **现状/问题**:单 `useState<StudioState>`,`refresh()` 在每 create/archive mutation 触发 Promise.all 六端点全量重取,无 react-query/swr/zustand;session rename 会无谓重拉 settings/info/apps/workers。
- **证据**:`worker-studio.tsx:102/114-125`(269/286/313/360/369/457 触发)、`workspace-data.ts:12-20`(六端点)。
- **建议**:作 deferred polish。Workbench 长大后采用 TanStack Query(PMA-web house guide 已标准化)keyed per-resource 使 mutation 只 invalidate 受影响 query,退役手搓 {data,error,loading}。**不阻塞任何 v1 发版。**
- **状态**:⬜ 待办。

### WWB-4 · formatRelativeTime 手搓 per-locale 相对时间,重造 Intl.RelativeTimeFormat `[low][reinvented-wheel][⬜ 待办]`

- **现状/问题**:手算 ms→分→时→天分桶 + per-locale closure,该目录对 `Intl.` grep 零命中,粒度被静默截顶(无秒、天为最粗)。
- **证据**:`apps/worker-web/src/features/i18n/index.ts:38-50`。
- **建议**:用 `Intl.RelativeTimeFormat(locale,{numeric:'auto'})` 按 active SupportedLocale 替换 closure,删四个 locale 文件的 `relativeTime.*` 条目;**保留**其余 typed StaticMessages catalog。低优先。
- **状态**:⬜ 待办。

### WWB-5 · packages/ui ship 两套共存的 headless-primitive 系统(radix-ui×33 + @base-ui/react 单 combobox)`[low][contradicts-best-practice][⬜ 待办]`

- **现状/问题**:`packages/ui/package.json` 同时声明 `@base-ui/react`、`radix-ui`、`cmdk`;仅 combobox.tsx import @base-ui/react、33 组件 import radix-ui;给单组件翻倍 a11y/behavioral baseline、bundle、升级矩阵,无记录 rationale(AGENTS.md 禁 ad-hoc 组件系统)。
- **证据**:`packages/ui/package.json:39/45/50`、`combobox.tsx:12`、`components.json`(style='radix-mira')。
- **建议**:作**显式记录的决定**而非静默双 stack:要么承诺 @base-ui/react 并规划 radix→base-ui 迁移,要么把 combobox 重新落到已存在的 cmdk/radix primitive(cmdk 已被 command.tsx 用)并删 @base-ui/react。把选择记进 UI 包 decisions。
- **状态**:⬜ 待办。

### TGA-3 · G4 word-token allowlist 的维护税残留 `[low][known-pitfall(downgraded)][⬜ 待办]`

- **现状/问题**:`HOST_AUTH_ALLOWLIST` 33 个手维护 lowercase token,flag 任何含 session/secret/domain 且不在 allowlist 的 token。**中央指控「G4 与 dep guard 冗余」被反证** —— G4 是**唯一**对 host 源码扫 session/projection 词汇的 source-level 扫描(G9 只读 docs、G2/G3/G5 只看 package-graph),删它会开硬约束背书缺口。
- **证据**:`inversion-guards.test.ts:199-240/252-254`、G9(307-331,只读 docs)、G4 negative test(282-293,证现法仍抓 createWorkerSession 变体)。
- **建议**:**拒绝**「drop ambiguous leg」(会开约束背书缺口、deny-list 替代 rename 即绕)。保留 G4 现状。唯一可接受改进是**非破坏性**降维护税:从单一注解化的 Host-auth symbol registry 派生 allowlist 使新增成一行 review,并把「每个新 auth 标识符强制一次性 review」文档化为有意摩擦。**不削弱强制力。**
- **状态**:⬜ 待办(medium→low,仅 33 项 allowlist 维护税残留真实;recommendation 已校正)。

### TGA-5 · check-doc-contract.ts 断言 500+ 精确多行 doc 子串,cosmetic doc 编辑会破 CI `[low][contradicts-best-practice][⬜ 待办]`

- **现状/问题**:1153 行、564 条 array-string 断言、148 条含字面 `\n` 多行断言;`:59` 逐字 pin canonical 句,rewrap 即破 CI 而契约未变。
- **证据**:`scripts/check-doc-contract.ts:59`(pin 多行句)。
- **建议**:保留高价值结构断言(required heading/anchor、section presence、forbidden phrase、release-gate triple-lock),但**匹配前归一化空白**(collapse 空白/换行)使段落 reflow 与 typo fix 不破 CI,长精确散文 pin 缩到 load-bearing 子句 token。保住 canonical-docs-are-contract / no-silent-reversal 保证(硬规则)。
- **状态**:⬜ 待办。

### reinvented-procfile · dev-local.sh + dev-fleet-web.ts 手搓 tmux/Procfile supervisor `[low][reinvented-wheel(downgraded)][⬜ 待办]` `[cross-cutting]`

- **现状/问题**:手搓 tmux new-session + env 注入 + trap cleanup;但 `verifyViteWithRestart` 在 **HTTP-readiness 失败**时重启(overmind 只在进程死亡时重启,不同信号、不可替换)、`shouldRejectApiPortReuse` 4-way PID 校验同样 load-bearing。
- **证据**:`dev-local.sh:148-179`、`dev-fleet-web.ts:500-511/542-564(verifyViteWithRestart)/269-287(shouldRejectApiPortReuse)`。
- **建议**:低优先/可选。若采用,overmind 只替换裸 tmux/trap/env-quote 调用,**必须保留** verifyViteWithRestart 与 shouldRejectApiPortReuse。保留固定端口(AGENTS.md)。代价是引外部 Go 二进制 + 5 套 distinct per-process env 不映射进单一 .overmind.env。把手搓 substrate 留着也合理。
- **状态**:⬜ 待办(medium→low downgrade)。

### manual-two-package-version-sync · 双包版本手工同步,CI 断言补偿 desync 风险 `[low][reinvented-wheel][⬜ 待办]` `[cross-cutting]`

- **现状/问题**:worker-cli + host-cli package.json 手工设成相同版本,release.yml 专设一步断言 tag==两包版本;commitlint 已装但无 .changeset,conventional commit 不驱动 changelog/版本。
- **证据**:`apps/worker-cli/package.json:4` + `apps/host-cli/package.json:4`、`release.yml:33-44`、`SKILL.md:29/31`。
- **建议**:低优先、文档化选项非紧急。出现第三个可发布包或 GA cadence 时再采用 changesets `fixed` group 绑两包同版本(使断言冗余)。**不要采用 semantic-release**(其 publish-on-push-to-main 违反 tag-only-publish 不变量)。
- **状态**:⬜ 待办。

## 附录:已驳回(本线相关)

- **SIM-2(rejected)· 17 个增量 drizzle migration 矛盾 runtime.md「while migrations are collapsed」**:代码事实属实(17 migration、0013 RENAME archaeology、ad-hoc sql.raw 修补),但 contract-drift 前提把 `runtime.md:134-135` 读反 —— 原文是**许可**历史列名在「迁移尚被折叠」期间存留(许可性非强制性),architecture.md:328-346 无「必须 collapse 成单 baseline」强制令。17 个增量文件是 drizzle 正常运作,不构成 drift;collapse 已部署 box 有 brick 风险。**不列入待办。**
