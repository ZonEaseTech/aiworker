# EB-1 native resume 修复 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: superpowers:subagent-driven-development 或 executing-plans。Steps 用 `- [ ]`。

**Goal:** 修复多轮 follow-up 失忆——让 claude/codex 的 turn-2 通过原生 resume 真正接上 turn-1 的会话上下文。

**Architecture:** option A（接通原生 resume，零新依赖）。纯 worker-runtime / engine-bridge，不碰 host。

**Spec/来源:** 闭门造车审查 EB-1（`tmp/aiworker-audit-2026-06-10/report.md`）。本轮经当前 main `422041e4` 实证复现 + 官方文档核实 resume CLI 语法。

---

## 精确根因（orientation 修正了审计的初判）

resume 链在 `runtime.ts:968-1028` **大部分已接通**：
- `allowResume`(默认 true) → `previousInvocation = latestPriorEngineInvocation(...)`（**已排除 internal auto-naming**，runtime.ts:1707-1715）。
- bridge 构造时**已传** `resolveLatestExternalSessionRef`（runtime.ts:989）。
- `previousInvocation ? bridge.followUp(request) : bridge.startInvocation(request)`（1026-1028）——**第一轮走 start（无 resume guard），follow-up 才走 resume**，结构本就安全。
- `engine-bridge` followUp(index.ts:244-264)：resolve ref → guard `if (supportsNativeResume && !externalSessionRef)` → spread `{...request, externalSessionRef}` 进 `adapter.followUp`。

**唯一断点**：生产 adapter 的 `invokeLocalExecutorThroughBridge`(runtime.ts:1778-1803) 解构了十来个字段，**不读 `request.externalSessionRef`**——ref 到了 adapter 被丢弃；且 `buildArgs` 无 resume flag；且 claude 侧根本没捕获 session_id（只有 codex 捕获 thread_id）；且 adapter `supportsNativeResume:false` 让 guard 永不 live。

**关键安全约束**：`supportsNativeResume` 必须**按引擎**判定，不能全局翻 true。否则 cursor/gemini/opencode/qwen（不捕获 ref）follow-up 时 resolver 返 null → guard 抛 `ENGINE_SESSION_REF_MISSING` → **直接报错（比失忆更糟）**。adapter 是 `createLocalExecutorBridgeAdapter(executor, target)` per-target 创建，`target` 已知，可按引擎返回。

## 官方文档核实的 resume 语法

- **codex**：`codex exec resume <SESSION_ID> "<prompt>"`（exec 模式支持 resume，保留 transcript）。thread_id **已捕获**（`codexThreadExternalSessionRef`）。prompt 传递方式（arg vs stdin）实测确认。
- **claude**：`claude -p --resume <session_id>`。session_id 在 stream-json 的 **system/init 事件**里，**当前未捕获**，需补。

## 修复面（全部 worker-runtime）

- `packages/worker-runtime/src/worker/engine-stream.ts` — claude handler 捕获 system/init 的 session_id → emit `external_session_ref`。
- `packages/worker-runtime/src/worker/executor.ts` — `LocalExecutorInput.resumeRef`；buildArgs：claude `--resume <id>`、codex `exec resume <id>`（仅 resumeRef present 时）。
- `packages/worker-runtime/src/worker/runtime.ts` — `invokeLocalExecutorThroughBridge` 读 `request.externalSessionRef`→`executor.invoke({resumeRef})`；adapter `discover()` 按 target 返 `supportsNativeResume`（claude/codex→true）。
- 测试：桩引擎确定性 e2e（入套件/CI 安全）+ **真实 claude/codex 两轮 resume 实测**（本轮硬验收，用户本机已登录）。

## 不做（YAGNI / best-effort）

- cursor/gemini/opencode/qwen 不接 resume（`supportsNativeResume:false`，保持失忆 + 文档标注），prompt 注历史兜底留后续。
- 不引官方 SDK（SL-3 留后续；本轮 option A 手拼 flag）。

---

## Task 1: 桩引擎 + 真实路径 e2e（先 RED）

**Files:** Create 测试 + 桩脚本（落 `packages/worker-runtime/src/worker/` 测试夹具或 `tests/`）。

- [ ] **Step 1**：写桩引擎脚本——读 argv，emit stream-json：首轮吐一个 session_id（claude system/init 形 + codex thread 形各一变体）；若 argv 含 `--resume <id>` / `exec resume <id>` 则在输出里回显收到的 id。
- [ ] **Step 2**：写测试——用**真实** `WorkerRuntime`（或真实 `createLocalExecutorBridgeAdapter` + 真实 executor，engineCommand 指向桩），跑两轮 follow-up，断言 turn-2 的桩进程收到了 turn-1 emit 的 session id（即 resume flag 真带上）。
- [ ] **Step 3**：跑测试确认**失败**（resume 未接）。Expected: RED。
- [ ] **Step 4**：commit（测试先行）。

## Task 2: claude 捕获 session_id

**Files:** Modify `engine-stream.ts`。

- [ ] **Step 1**：claude handler 解析 system/init（`type==='system' && subtype==='init'` 或等价）的 `session_id` → `onEvent({type:'external_session_ref', ref:{id:session_id, target:'claude'}})`。
- [ ] **Step 2**：单测——喂 claude init JSON 行 → 断言 emit `external_session_ref{id,target:'claude'}`；喂普通文本行不 emit。
- [ ] **Step 3**：跑单测绿。commit。

## Task 3: resumeRef 穿透 adapter→executor→buildArgs

**Files:** Modify `executor.ts`（LocalExecutorInput + buildArgs）、`runtime.ts`（invokeLocalExecutorThroughBridge）。

- [ ] **Step 1**：`LocalExecutorInput` 加 `resumeRef?: Record<string, unknown> | null`。
- [ ] **Step 2**：`invokeLocalExecutorThroughBridge` 读 `request.externalSessionRef`（解析 JSON/对象）→ 传 `executor.invoke({..., resumeRef})`。
- [ ] **Step 3**：buildArgs：claude destructure 加 `input`，resumeRef.id present 时 `args.push('--resume', id)`；codex resumeRef.id present 时把 `'exec'` 改成 `'exec','resume',id`（其余 flag 保留；确认 prompt 经 stdin 仍有效）。
- [ ] **Step 4**：单测——buildArgs(claude/codex) 有/无 resumeRef 各断言 flag 在/不在；无 resumeRef 时 codex 仍是裸 `exec`。
- [ ] **Step 5**：跑单测绿。commit。

## Task 4: 按引擎 supportsNativeResume

**Files:** Modify `runtime.ts`（createLocalExecutorBridgeAdapter.discover）。

- [ ] **Step 1**：discover() 按 `target` 返 `supportsNativeResume: target==='claude-code' || target==='codex'`（其余 false）。
- [ ] **Step 2**：单测/契约——claude/codex adapter discover supportsNativeResume=true；cursor/gemini/opencode/qwen=false。
- [ ] **Step 3**：跑绿。commit。

## Task 5: e2e GREEN + 真实引擎实测

- [ ] **Step 1**：跑 Task 1 桩 e2e → 现在应 GREEN（turn-2 带上 turn-1 ref）。
- [ ] **Step 2**：**真实 claude 两轮**：turn-1 "记住数字 4729"，turn-2 "我刚让你记的数字是多少?" → 断言回答含 4729（证明 native resume 真带了上下文）。
- [ ] **Step 3**：**真实 codex 两轮**：同上记忆点测试。
- [ ] **Step 4**：负向：cursor（或任一非-resume 引擎，若本机有）follow-up 不报 ENGINE_SESSION_REF_MISSING（best-effort 不破）；若本机没有则用单测覆盖 supportsNativeResume=false 路径。
- [ ] **Step 5**：commit（含实测证据写进 commit body / 记忆）。

## Task 6: 全验证

- [ ] `bun run --filter '@zonease/aiworker-worker-runtime' test`（worker-runtime 单测全绿）。
- [ ] `bun run typecheck` + `bun run test:contracts` 绿。
- [ ] `bun run lint` 绿。
- [ ] diff 只动 worker-runtime（+ 测试夹具），不碰 host。

## 风险

- **R1 codex prompt 传递**：`exec resume <id>` 是否仍吃 stdin prompt——Task 3 + Task 5 真测坐实；若只吃 arg 则把 prompt 作 arg。
- **R2 claude init 事件形状**：不同 claude 版本 system/init 字段名——按 2.1.170 实际输出核实（Task 2 用真实 claude 一次 init 抓样本）。
- **R3 pre-fix 会话**：旧会话无捕获 ref，翻 true 后其 follow-up 会抛 ENGINE_SESSION_REF_MISSING（contract-correct，docs:170「resume 数据缺失不得静默新建」）。v1 未发布、无生产旧会话，接受。
