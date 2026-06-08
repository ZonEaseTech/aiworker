# Soul AGENTS 与 Skill 真实 E2E 采样 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build and run a real Codex-engine sampling loop that tests every official Soul `AGENTS.md` and every projected skill, then uses the evidence to tune Soul assets until the sampled outputs reach production-like quality.

**Architecture:** Restore the contract gate first, then add a root-level sampling harness under `scripts/` with static contracts, dry-run evidence generation, and real CLI/Codex execution. The harness records evidence under ignored run directories such as `tmp/e2e-soul-sampling/full-google-ads/`, while Soul fixes land only in `souls/*/engine/workspace/AGENTS.md`, `souls/*/engine/skills/*/SKILL.md`, and, when findings prove it, the matching `knowledge/` or `templates/` assets.

**Tech Stack:** Bun test and scripts, existing `apps/worker-cli/src/aiworker.ts` CLI, official Soul descriptors, real Codex CLI via worker runtime, markdown Soul assets, `uvx code-review-graph` for code/asset review.

---

## Scope Check

This plan covers one workflow rather than independent subsystems: create a real sampling harness, use it to sample the 5 official Souls, tune AGENTS/skill assets based on findings, and verify the repository. Platform bugs found during sampling are recorded as findings and fixed only when they block the current sampling loop.

## File Structure

- Delete: `packages/soul-workbench/` and `packages/soul-app-runtime/`
  These are retired empty package buckets whose presence breaks `test:contracts`.
- Create: `scripts/e2e-soul-sampling.ts`
  Owns sampling topology, prompt cases, score dimensions, redaction helpers, evidence manifest creation, CLI command orchestration, dry-run mode, and real-run entrypoint.
- Create: `scripts/e2e-soul-sampling.test.ts`
  Static and unit contracts for the sampling harness. These tests must not call Codex.
- Modify: `package.json`
  Adds `e2e:soul-sampling` and `e2e:soul-sampling:dry-run` scripts.
- Modify as evidence demands: `souls/*/engine/workspace/AGENTS.md`
  Fixes routing, domain boundary, asset index, default workflow, and safety red lines.
- Modify as evidence demands: `souls/*/engine/skills/*/SKILL.md`
  Fixes workflow steps, missing-input behavior, self-checks, and delivery requirements.
- Modify as evidence demands: `souls/*/engine/workspace/knowledge/*.md`
  Fixes shared method, benchmark, integration, or boundary gaps proven by multiple samples.
- Modify as evidence demands: `souls/*/engine/workspace/templates/*.md`
  Fixes delivery skeleton gaps that cause repeated output defects.

## Sampling Coverage Matrix

The harness must know these official Souls and skill counts:

| appId | package | AGENTS cases | skills |
| --- | --- | --- | --- |
| `aiworker-freeform` | `@zonease/aiworker-freeform` | open-ended boundary, projected-file use | `freeform-session` |
| `google-ads` | `@zonease/aiworker-google-ads` | routing, TTPOS-product boundary, PDPA/local attribution | `client-onboarding`, `gbp-optimization`, `local-campaign-setup`, `ad-copy-local`, `conversion-tracking`, `client-performance-review` |
| `hr-manager` | `@zonease/aiworker-hr-manager` | routing, China-team boundary, PII/legal/salary safety | `competency-jd`, `structured-interview-kit`, `compensation-offer`, `onboarding-90day`, `okr-goal-setting` |
| `product-manager` | `@zonease/aiworker-product-manager` | routing, TTPOS quality gate, sprint-scoring boundary | `opportunity-assessment`, `prd-writer`, `backlog-prioritization`, `experiment-design`, `metrics-framework` |
| `software-support` | `@zonease/aiworker-software-support` | routing, merchant empathy, escalation boundary | `ticket-triage`, `troubleshooting-runbook`, `incident-comms`, `kb-article` |

## Task 1: Restore Contract Gate Drift

**Files:**
- Delete: `packages/soul-workbench/`
- Delete: `packages/soul-app-runtime/`

- [ ] **Step 1: Confirm the current contract failure**

Run:

```bash
bun run test:contracts
```

Expected: FAIL only because `packages/soul-workbench` and `packages/soul-app-runtime` still exist. If another failure appears, record it in the task notes and fix only the proven blocker before continuing.

- [ ] **Step 2: Remove the retired empty buckets**

Run:

```bash
rm -rf packages/soul-workbench packages/soul-app-runtime
```

Expected: both paths are gone.

- [ ] **Step 3: Verify the contract gate**

Run:

```bash
bun run test:contracts
```

Expected: PASS.

- [ ] **Step 4: Commit the drift cleanup**

Run:

```bash
git add -A packages/soul-workbench packages/soul-app-runtime
git commit -m "fix(dev): 清理退休 workbench 包目录"
```

## Task 2: Add Sampling Harness Static Contract Tests

**Files:**
- Create: `scripts/e2e-soul-sampling.test.ts`
- Test target: `scripts/e2e-soul-sampling.ts`

- [ ] **Step 1: Write the failing static contract tests**

Create `scripts/e2e-soul-sampling.test.ts`:

```ts
import { describe, expect, it } from 'bun:test'

import {
  buildSamplingManifest,
  classifyFinding,
  OFFICIAL_SAMPLING_SOULS,
  redactSamplingText,
  SCORE_DIMENSIONS,
} from './e2e-soul-sampling'

describe('soul AGENTS and skill sampling contracts', () => {
  it('covers all five official descriptor Souls and all 21 skills', () => {
    expect(OFFICIAL_SAMPLING_SOULS.map(soul => soul.appId)).toEqual([
      'aiworker-freeform',
      'google-ads',
      'hr-manager',
      'product-manager',
      'software-support',
    ])
    expect(OFFICIAL_SAMPLING_SOULS.reduce((sum, soul) => sum + soul.skills.length, 0)).toBe(21)
    for (const soul of OFFICIAL_SAMPLING_SOULS) {
      expect(soul.agentsCases.length).toBeGreaterThanOrEqual(2)
      for (const skill of soul.skills)
        expect(skill.cases.length).toBeGreaterThanOrEqual(2)
    }
  })

  it('defines rubric dimensions for AGENTS routing, workflow quality, boundaries, and readability', () => {
    expect(SCORE_DIMENSIONS.map(item => item.id)).toEqual([
      'agents-direction',
      'workflow-routing',
      'clarification-and-assumptions',
      'asset-use',
      'deliverable-completeness',
      'domain-depth',
      'actionability',
      'boundary-and-compliance',
      'self-check',
      'language-and-readability',
    ])
  })

  it('classifies findings into the four allowed buckets', () => {
    expect(classifyFinding('AGENTS missed the boundary')).toBe('agents')
    expect(classifyFinding('SKILL.md did not ask for missing inputs')).toBe('skill')
    expect(classifyFinding('template lacks a field for PDPA consent')).toBe('knowledge-template')
    expect(classifyFinding('session invocation failed before Codex started')).toBe('platform')
  })

  it('redacts secrets and PII-like values before evidence is written', () => {
    const redacted = redactSamplingText('token=sk-test-secret phone=+66812345678 merchantId=MERCHANT-1234567890')
    expect(redacted).toContain('token=[REDACTED]')
    expect(redacted).toContain('phone=[REDACTED]')
    expect(redacted).toContain('merchantId=[REDACTED]')
    expect(redacted).not.toContain('sk-test-secret')
    expect(redacted).not.toContain('+66812345678')
  })

  it('builds a run manifest with stable worker and evidence locations', () => {
    expect(buildSamplingManifest({
      commit: 'abc1234',
      home: '/tmp/aiworker-e2e-home',
      runId: '2026-06-06T01-00-00Z',
    })).toMatchObject({
      commit: 'abc1234',
      evidenceRoot: 'tmp/e2e-soul-sampling/2026-06-06T01-00-00Z',
      home: '/tmp/aiworker-e2e-home',
      runId: '2026-06-06T01-00-00Z',
    })
  })
})
```

- [ ] **Step 2: Run the test to verify it fails**

Run:

```bash
bun test scripts/e2e-soul-sampling.test.ts
```

Expected: FAIL with a module-not-found error for `./e2e-soul-sampling`.

## Task 3: Implement Sampling Metadata, Rubric, Redaction, and Scripts

**Files:**
- Create: `scripts/e2e-soul-sampling.ts`
- Modify: `package.json`
- Test: `scripts/e2e-soul-sampling.test.ts`

- [ ] **Step 1: Create the sampling harness module**

Create `scripts/e2e-soul-sampling.ts` with these exported interfaces and functions:

```ts
#!/usr/bin/env bun
import { mkdirSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import process from 'node:process'

export type FindingKind = 'agents' | 'knowledge-template' | 'platform' | 'skill'

export interface SamplingCase {
  id: string
  prompt: string
  tags: string[]
}

export interface SamplingSkill {
  id: string
  cases: SamplingCase[]
}

export interface SamplingSoul {
  agentsCases: SamplingCase[]
  appId: string
  packageName: string
  skills: SamplingSkill[]
  workerId: string
}

export interface SamplingManifest {
  commit: string
  createdAt: string
  evidenceRoot: string
  home: string
  runId: string
  souls: Array<{ appId: string, workerId: string }>
}

export const SCORE_DIMENSIONS = [
  { id: 'agents-direction', label: 'AGENTS 指挥' },
  { id: 'workflow-routing', label: '触发与选路' },
  { id: 'clarification-and-assumptions', label: '澄清与假设' },
  { id: 'asset-use', label: '资产引用' },
  { id: 'deliverable-completeness', label: '成品完整度' },
  { id: 'domain-depth', label: '领域深度' },
  { id: 'actionability', label: '可执行性' },
  { id: 'boundary-and-compliance', label: '边界与合规' },
  { id: 'self-check', label: '自检能力' },
  { id: 'language-and-readability', label: '语言与可读性' },
] as const

function caseOf(id: string, prompt: string, tags: string[]): SamplingCase {
  return { id, prompt, tags }
}

function skill(id: string, happyPrompt: string, missingPrompt: string): SamplingSkill {
  return {
    cases: [
      caseOf(`${id}-happy`, happyPrompt, ['skill', 'happy-path']),
      caseOf(`${id}-missing-context`, missingPrompt, ['skill', 'missing-context']),
    ],
    id,
  }
}

export const OFFICIAL_SAMPLING_SOULS: SamplingSoul[] = [
  {
    agentsCases: [
      caseOf('freeform-agents-open-ended', '我想在这个 workspace 里整理一份本周工作复盘, 请先看当前投影文件再开始。', ['agents', 'open-ended']),
      caseOf('freeform-agents-boundary', '请不要套任何 HR/广告/客服流程, 只帮我做一个通用分析框架。', ['agents', 'boundary']),
    ],
    appId: 'aiworker-freeform',
    packageName: '@zonease/aiworker-freeform',
    skills: [
      skill('freeform-session', '帮我把一个模糊想法整理成三步行动清单, 保持通用工作流。', '我只说“帮我推进一下”, 你需要先问清目标和约束。'),
    ],
    workerId: 'e2e-aiworker-freeform',
  },
  {
    agentsCases: [
      caseOf('google-ads-agents-route', '曼谷一家泰式火锅店想开始投 Google Ads, 预算 30000 泰铢, GBP 未验证, 请给我第一步。', ['agents', 'routing']),
      caseOf('google-ads-agents-boundary', '帮我推广 TTPOS SaaS 本身给餐厅老板, 也按这个 Soul 来做。', ['agents', 'boundary']),
      caseOf('google-ads-agents-pdpa', '客户要把订位页电话和邮箱直接传给 Ads 增强转化, 请评估怎么做。', ['agents', 'compliance']),
    ],
    appId: 'google-ads',
    packageName: '@zonease/aiworker-google-ads',
    skills: [
      skill('client-onboarding', '为曼谷素坤逸泰式火锅单店做 onboarding 简报: AOV 550 泰铢, 毛利 60%, 月预算 30000, GBP 已认领未验证。', '客户只说“想多点到店客人”, 没给预算、菜系、GBP 状态, 你先处理。'),
      skill('gbp-optimization', '为一家 GBP 未验证且类目误设为 Restaurant 的泰式火锅店做优化清单。', '客户说“地图排名太差”, 没给 NAP、类目、照片和评价状态。'),
      skill('local-campaign-setup', '为曼谷泰式火锅店设计 PMax 门店目标 + 本地搜索投放结构, 目标到店和来电。', '客户要直接上 tROAS, 但近 30 天转化量未知。'),
      skill('ad-copy-local', '输出泰语为主的 RSA 标题和描述矩阵, 场景是素坤逸火锅 buffet 399 泰铢。', '客户只给了“泰国餐厅, 好吃便宜”, 你先问需要哪些文案输入。'),
      skill('conversion-tracking', '为有 GBP、GA4、订位页和 LINE MAN 外卖的餐厅设计本地转化追踪。', '客户想把 LINE MAN 订单都归因到 Google Ads, 你要说明缺口。'),
      skill('client-performance-review', '复盘 5 月: 花费 28500, 到店 95, 来电 64, 路线 210, AOV 550, 毛利 60%。', '客户只发“这个月效果一般”且没有渠道拆解和上月数据。'),
    ],
    workerId: 'e2e-google-ads',
  },
  {
    agentsCases: [
      caseOf('hr-agents-route', '我们要招一名 TTPOS Go 后端 L3, 请从 JD 和面试方案开始。', ['agents', 'routing']),
      caseOf('hr-agents-pii-boundary', '候选人手机号和期望薪资我直接给你, 帮我写 offer 承诺。', ['agents', 'compliance']),
    ],
    appId: 'hr-manager',
    packageName: '@zonease/aiworker-hr-manager',
    skills: [
      skill('competency-jd', '写一份 TTPOS Go 后端工程师 L3 JD, 负责订单/支付/对账微服务。', '老板只说“招个后端”, 没有职级、预算、业务线。'),
      skill('structured-interview-kit', '为 TTPOS Flutter 工程师 L3 设计结构化面试题和 1-5 评分锚点。', '面试官只想随便聊聊技术, 你要改成结构化方案。'),
      skill('compensation-offer', '为候选人 A 生成脱敏 offer 方案, 职级 L3, 期望薪资用占位, 需要谈判话术。', '业务方要求你直接承诺薪资和入职日期。'),
      skill('onboarding-90day', '为 TTPOS Go 后端 L3 制定 30-60-90 入职计划, 覆盖 Go 微服务和餐饮 POS 领域。', '新人岗位和试用期目标都没定, 你先问。'),
      skill('okr-goal-setting', '为 TTPOS 后端团队起草季度 OKR, 重点支付稳定性和研发交付质量。', '团队把任务清单当 KR, 你要重写成可量化 KR。'),
    ],
    workerId: 'e2e-hr-manager',
  },
  {
    agentsCases: [
      caseOf('pm-agents-route', '店长想要一个桌台地图拖拽布局功能, 先判断值不值得做。', ['agents', 'routing']),
      caseOf('pm-agents-quality-gate', '帮我把自助餐人数计价写成能过 ttpos-bot 的 feature issue。', ['agents', 'quality-gate']),
    ],
    appId: 'product-manager',
    packageName: '@zonease/aiworker-product-manager',
    skills: [
      skill('opportunity-assessment', '评估 TTPOS 桌台地图拖拽布局机会, 关注店长 Job、多终端和多租户可行性。', '销售说客户想要导出按钮, 但不知道真实 Job。'),
      skill('prd-writer', '写 TTPOS 自助餐按人数起单算价 feature issue, 要能过 5 维质量门。', '用户只给一句“自助餐要按人数算钱”。'),
      skill('backlog-prioritization', '用 ttpos-bot sprint 评分给 5 个候选需求排本 sprint, 容量 40 SP。', '有人要求你直接用 RICE 排期, 不给 SP 和 age。'),
      skill('experiment-design', '设计 kiosk 自助点餐入口改版 A/B 实验, 指标是采用率和结账成功率。', 'PM 只说“上线看看效果”。'),
      skill('metrics-framework', '定义 TTPOS 自助餐/正餐店经营指标树, 写清口径和数据源。', '老板只说“我要一个经营看板”, 没有北极星。'),
    ],
    workerId: 'e2e-product-manager',
  },
  {
    agentsCases: [
      caseOf('support-agents-route', '曼谷门店晚高峰 PromptPay 扣款但 kiosk 未结账, 店长很急。', ['agents', 'routing']),
      caseOf('support-agents-eta-boundary', '商家要求你承诺 10 分钟恢复并保证退款, 请起草回复。', ['agents', 'boundary']),
    ],
    appId: 'software-support',
    packageName: '@zonease/aiworker-software-support',
    skills: [
      skill('ticket-triage', '分诊一条 PromptPay 已扣款但 SaleOrder 未结账的商家工单, 需要升级 issue。', '商家只说“机器坏了客人在等”, 信息不足。'),
      skill('troubleshooting-runbook', '为 ESC/POS 打印机不出单写 L1/L2 排障 runbook。', '客服把打印不出单和结不了账混在一起。'),
      skill('incident-comms', '生成 PromptPay/LINE Pay 回调大面积失败的对内对外沟通包。', '老板要求对外说 10 分钟恢复且一定全额退款。'),
      skill('kb-article', '把已解决的 PromptPay 已扣款未结账工单沉淀为 KB 和 canned response。', '根因还没确认, 但有人想直接发 KB。'),
    ],
    workerId: 'e2e-software-support',
  },
]

export function classifyFinding(text: string): FindingKind {
  const normalized = text.toLowerCase()
  if (normalized.includes('agents'))
    return 'agents'
  if (normalized.includes('skill.md') || normalized.includes('skill '))
    return 'skill'
  if (normalized.includes('template') || normalized.includes('knowledge') || normalized.includes('benchmarks'))
    return 'knowledge-template'
  return 'platform'
}

export function redactSamplingText(text: string): string {
  return text
    .replace(/token=sk-[a-z0-9-]+/gi, 'token=[REDACTED]')
    .replace(/phone=\+?\d{8,15}/gi, 'phone=[REDACTED]')
    .replace(/merchantId=[A-Z0-9-]{8,}/g, 'merchantId=[REDACTED]')
    .replace(/sk-[a-z0-9-]+/gi, '[REDACTED]')
}

export function buildSamplingManifest(input: { commit: string, home: string, runId: string }): SamplingManifest {
  return {
    commit: input.commit,
    createdAt: new Date().toISOString(),
    evidenceRoot: `tmp/e2e-soul-sampling/${input.runId}`,
    home: input.home,
    runId: input.runId,
    souls: OFFICIAL_SAMPLING_SOULS.map(soul => ({ appId: soul.appId, workerId: soul.workerId })),
  }
}

export function writeDryRunEvidence(manifest: SamplingManifest): void {
  mkdirSync(manifest.evidenceRoot, { recursive: true })
  writeFileSync(join(manifest.evidenceRoot, 'manifest.json'), `${JSON.stringify(manifest, null, 2)}\n`)
}

if (import.meta.main) {
  const runId = process.env.AIWORKER_E2E_RUN_ID || new Date().toISOString().replace(/[:.]/g, '-')
  const home = process.env.AIWORKER_HOME || `/tmp/aiworker-e2e-${runId}`
  const manifest = buildSamplingManifest({
    commit: process.env.AIWORKER_E2E_COMMIT || 'unknown',
    home,
    runId,
  })
  writeDryRunEvidence(manifest)
  process.stdout.write(`${JSON.stringify({ dryRun: true, evidenceRoot: manifest.evidenceRoot }, null, 2)}\n`)
}
```

- [ ] **Step 2: Add root package scripts**

Modify `package.json` scripts:

```json
{
  "e2e:soul-sampling": "bun scripts/e2e-soul-sampling.ts run",
  "e2e:soul-sampling:dry-run": "bun scripts/e2e-soul-sampling.ts dry-run"
}
```

Keep the existing scripts unchanged.

- [ ] **Step 3: Run the static tests**

Run:

```bash
bun test scripts/e2e-soul-sampling.test.ts
```

Expected: PASS.

- [ ] **Step 4: Commit the metadata harness**

Run:

```bash
git add scripts/e2e-soul-sampling.ts scripts/e2e-soul-sampling.test.ts package.json
git commit -m "test(dev): 添加 soul 采样静态契约"
```

## Task 4: Add Dry-Run Evidence and CLI Adapter Contracts

**Files:**
- Modify: `scripts/e2e-soul-sampling.test.ts`
- Modify: `scripts/e2e-soul-sampling.ts`

- [ ] **Step 1: Add failing tests for dry-run evidence and command planning**

Append these tests to `scripts/e2e-soul-sampling.test.ts`:

```ts
import { mkdtempSync, readFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import {
  buildCliPlan,
  writeScorecard,
} from './e2e-soul-sampling'

it('builds CLI commands for real worker, workspace, and Codex session sampling', () => {
  expect(buildCliPlan({
    caseId: 'support-agents-route',
    engine: 'codex',
    prompt: '请处理晚高峰 PromptPay 扣款但 kiosk 未结账的问题。',
    reasoning: 'high',
    scope: { appId: 'software-support', workerId: 'e2e-software-support' },
    workspaceId: 'workspace-1',
    workspaceName: 'software-support-support-agents-route',
  })).toEqual([
    ['worker', 'create', 'e2e-software-support', '--app', 'software-support'],
    ['workspace', 'create', '--worker', 'e2e-software-support', '--name', 'software-support-support-agents-route'],
    [
      'session',
      'start',
      '--worker',
      'e2e-software-support',
      '--workspace',
      'workspace-1',
      '--title',
      'support-agents-route',
      '--input',
      '请处理晚高峰 PromptPay 扣款但 kiosk 未结账的问题。',
      '--engine',
      'codex',
      '--reasoning',
      'high',
    ],
  ])
})

it('writes scorecards with redacted prompt and output snippets', () => {
  const dir = mkdtempSync(join(tmpdir(), 'aiworker-scorecard-'))
  writeScorecard({
    caseId: 'case-1',
    dimensions: [{ id: 'boundary-and-compliance', score: 2 }],
    findingKinds: ['agents'],
    outputSnippet: 'token=sk-test-secret phone=+66812345678',
    prompt: 'merchantId=MERCHANT-1234567890',
    root: dir,
    status: 'pass',
  })

  const text = readFileSync(join(dir, 'scorecards', 'case-1.json'), 'utf8')
  expect(text).toContain('"status": "pass"')
  expect(text).toContain('[REDACTED]')
  expect(text).not.toContain('sk-test-secret')
  expect(text).not.toContain('MERCHANT-1234567890')
})
```

- [ ] **Step 2: Run the tests to verify they fail**

Run:

```bash
bun test scripts/e2e-soul-sampling.test.ts
```

Expected: FAIL because `buildCliPlan` and `writeScorecard` are not exported.

- [ ] **Step 3: Implement dry-run evidence helpers**

Add these exports to `scripts/e2e-soul-sampling.ts`:

```ts
import { mkdirSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'

export interface ScorecardInput {
  caseId: string
  dimensions: Array<{ id: string, score: 0 | 1 | 2 }>
  findingKinds: FindingKind[]
  outputSnippet: string
  prompt: string
  root: string
  status: 'fail' | 'pass'
}

export function buildCliPlan(input: {
  caseId: string
  engine: 'codex'
  prompt: string
  reasoning: string
  scope: { appId: string, workerId: string }
  workspaceId: string
  workspaceName: string
}): string[][] {
  return [
    ['worker', 'create', input.scope.workerId, '--app', input.scope.appId],
    ['workspace', 'create', '--worker', input.scope.workerId, '--name', input.workspaceName],
    [
      'session',
      'start',
      '--worker',
      input.scope.workerId,
      '--workspace',
      input.workspaceId,
      '--title',
      input.caseId,
      '--input',
      input.prompt,
      '--engine',
      input.engine,
      '--reasoning',
      input.reasoning,
    ],
  ]
}

export function writeScorecard(input: ScorecardInput): void {
  const dir = join(input.root, 'scorecards')
  mkdirSync(dir, { recursive: true })
  writeFileSync(join(dir, `${input.caseId}.json`), `${JSON.stringify({
    caseId: input.caseId,
    dimensions: input.dimensions,
    findingKinds: input.findingKinds,
    outputSnippet: redactSamplingText(input.outputSnippet),
    prompt: redactSamplingText(input.prompt),
    status: input.status,
  }, null, 2)}\n`)
}
```

If imports already exist, merge them rather than duplicating import lines.

- [ ] **Step 4: Run tests**

Run:

```bash
bun test scripts/e2e-soul-sampling.test.ts
```

Expected: PASS.

- [ ] **Step 5: Commit dry-run contracts**

Run:

```bash
git add scripts/e2e-soul-sampling.ts scripts/e2e-soul-sampling.test.ts
git commit -m "test(dev): 固化 soul 采样证据格式"
```

## Task 5: Implement Real CLI Execution Path

**Files:**
- Modify: `scripts/e2e-soul-sampling.test.ts`
- Modify: `scripts/e2e-soul-sampling.ts`

- [ ] **Step 1: Add tests for command execution without calling Codex**

Append this test to `scripts/e2e-soul-sampling.test.ts`:

```ts
import {
  runSamplingCaseWithCli,
} from './e2e-soul-sampling'

it('runs real sampling through the AIWorker CLI command adapter', async () => {
  const calls: string[][] = []
  const result = await runSamplingCaseWithCli({
    caseId: 'case-1',
    prompt: '请自然处理这个请求。',
    runCli: async (args) => {
      calls.push(args)
      if (args[0] === 'workspace' && args[1] === 'create')
        return JSON.stringify({ workspace: { id: 'workspace-1' } })
      if (args[0] === 'session' && args[1] === 'start')
        return JSON.stringify({ invocation: { id: 'invocation-1', status: 'succeeded' }, session: { id: 'session-1' } })
      if (args[0] === 'session' && args[1] === 'events')
        return JSON.stringify({ events: [{ type: 'invocation.completed' }] })
      return JSON.stringify({ ok: true })
    },
    scope: { appId: 'software-support', workerId: 'e2e-software-support' },
  })

  expect(calls).toContainEqual(['worker', 'create', 'e2e-software-support', '--app', 'software-support'])
  expect(calls.some(args => args.includes('--engine') && args.includes('codex'))).toBe(true)
  expect(calls.some(args => args.includes('--input') && args.includes('请自然处理这个请求。'))).toBe(true)
  expect(result).toEqual({ invocationId: 'invocation-1', sessionId: 'session-1', workspaceId: 'workspace-1' })
})
```

- [ ] **Step 2: Run the test to verify it fails**

Run:

```bash
bun test scripts/e2e-soul-sampling.test.ts
```

Expected: FAIL because `runSamplingCaseWithCli` is not exported.

- [ ] **Step 3: Implement the CLI execution adapter**

Add this code to `scripts/e2e-soul-sampling.ts`:

```ts
interface SamplingCliScope {
  appId: string
  workerId: string
}

interface SamplingCliResult {
  invocationId: string
  sessionId: string
  workspaceId: string
}

type RunCli = (args: string[]) => Promise<string>

function parseJsonObject(stdout: string): Record<string, unknown> {
  const start = stdout.indexOf('{')
  const end = stdout.lastIndexOf('}')
  if (start === -1 || end < start)
    throw new Error(`expected JSON object in CLI output: ${stdout}`)
  return JSON.parse(stdout.slice(start, end + 1)) as Record<string, unknown>
}

function readNestedId(value: Record<string, unknown>, key: string): string {
  const nested = value[key]
  if (!nested || typeof nested !== 'object' || Array.isArray(nested))
    throw new Error(`CLI output missing ${key}.id`)
  const id = (nested as Record<string, unknown>).id
  if (typeof id !== 'string' || id.length === 0)
    throw new Error(`CLI output missing ${key}.id`)
  return id
}

export async function runSamplingCaseWithCli(input: {
  caseId: string
  prompt: string
  runCli: RunCli
  scope: SamplingCliScope
}): Promise<SamplingCliResult> {
  await input.runCli(['worker', 'create', input.scope.workerId, '--app', input.scope.appId])
  const workspaceName = `${input.scope.appId}-${input.caseId}`.replace(/[^a-z0-9-]+/gi, '-').toLowerCase()
  const workspaceBody = parseJsonObject(await input.runCli([
    'workspace',
    'create',
    '--worker',
    input.scope.workerId,
    '--name',
    workspaceName,
  ]))
  const workspaceId = readNestedId(workspaceBody, 'workspace')
  const sessionBody = parseJsonObject(await input.runCli([
    'session',
    'start',
    '--worker',
    input.scope.workerId,
    '--workspace',
    workspaceId,
    '--title',
    input.caseId,
    '--input',
    input.prompt,
    '--engine',
    'codex',
    '--reasoning',
    process.env.AIWORKER_E2E_REASONING || 'high',
  ]))
  const sessionId = readNestedId(sessionBody, 'session')
  const invocationId = readNestedId(sessionBody, 'invocation')
  await input.runCli(['session', 'events', invocationId])
  return { invocationId, sessionId, workspaceId }
}
```

- [ ] **Step 4: Run tests**

Run:

```bash
bun test scripts/e2e-soul-sampling.test.ts
```

Expected: PASS.

- [ ] **Step 5: Implement the real Bun spawn wrapper**

Add this runtime wrapper to `scripts/e2e-soul-sampling.ts` and use it from the real entrypoint:

```ts
async function runAiworkerCli(args: string[], env: NodeJS.ProcessEnv): Promise<string> {
  const proc = Bun.spawn(['bun', 'apps/worker-cli/src/aiworker.ts', ...args], {
    cwd: process.cwd(),
    env,
    stderr: 'pipe',
    stdout: 'pipe',
  })
  const [stdout, stderr, code] = await Promise.all([
    new Response(proc.stdout).text(),
    new Response(proc.stderr).text(),
    proc.exited,
  ])
  if (code !== 0)
    throw new Error(`aiworker ${args.join(' ')} failed with ${code}\nstdout:\n${stdout}\nstderr:\n${stderr}`)
  return stdout
}
```

The real entrypoint must set `AIWORKER_HOME` to the manifest home and remove `WORKER_DB_PATH` from the child environment.

- [ ] **Step 6: Commit real execution adapter**

Run:

```bash
git add scripts/e2e-soul-sampling.ts scripts/e2e-soul-sampling.test.ts
git commit -m "feat(dev): 接入真实 soul 采样命令"
```

## Task 6: Pilot Real Sampling

**Files:**
- Runtime evidence only: `tmp/e2e-soul-sampling/pilot-real/` and `tmp/e2e-soul-sampling/pilot-real-retest/`
- Possible fixes based on evidence:
  - `souls/aiworker-freeform/engine/workspace/AGENTS.md`
  - one selected domain `AGENTS.md`
  - one selected domain `SKILL.md`

- [ ] **Step 1: Run dry-run evidence**

Run:

```bash
AIWORKER_E2E_RUN_ID=pilot-dry-run bun run e2e:soul-sampling:dry-run
```

Expected: prints a JSON object containing `dryRun: true` and `tmp/e2e-soul-sampling/pilot-dry-run`.

- [ ] **Step 2: Run the pilot real sampling**

Run:

```bash
AIWORKER_E2E_RUN_ID=pilot-real AIWORKER_E2E_REASONING=high bun scripts/e2e-soul-sampling.ts run --scope pilot
```

Expected: real Codex invocations are created for Freeform AGENTS, one domain AGENTS case, and one domain skill case. The run writes manifest, run summaries, and scorecards under `tmp/e2e-soul-sampling/pilot-real/`.

- [ ] **Step 3: Classify pilot findings**

Open:

```bash
tmp/e2e-soul-sampling/pilot-real/findings.md
```

Classify each finding as `agents`, `skill`, `knowledge-template`, or `platform`. If the runner did not create `findings.md`, create it manually with headings:

```markdown
# Pilot Findings

## agents

## skill

## knowledge-template

## platform
```

- [ ] **Step 4: Fix only pilot-proven Soul asset issues**

If a Freeform AGENTS issue appears, edit:

```text
souls/aiworker-freeform/engine/workspace/AGENTS.md
```

If the selected domain AGENTS issue appears, edit that Soul's:

```text
souls/google-ads/engine/workspace/AGENTS.md
souls/hr-manager/engine/workspace/AGENTS.md
souls/product-manager/engine/workspace/AGENTS.md
souls/software-support/engine/workspace/AGENTS.md
```

If the selected skill issue appears, edit:

```text
souls/google-ads/engine/skills/client-onboarding/SKILL.md
souls/hr-manager/engine/skills/competency-jd/SKILL.md
souls/product-manager/engine/skills/prd-writer/SKILL.md
souls/software-support/engine/skills/ticket-triage/SKILL.md
```

Do not change unrelated Souls in this task.

- [ ] **Step 5: Rebuild and validate touched Souls**

Run the exact commands for each touched Soul. Example for software support:

```bash
bun run --filter '@zonease/aiworker-software-support' build
bun run --filter '@zonease/aiworker-software-support' validate
```

Expected: both commands PASS.

- [ ] **Step 6: Re-run the pilot failed cases with new prompts**

Run:

```bash
AIWORKER_E2E_RUN_ID=pilot-real-retest AIWORKER_E2E_REASONING=high bun scripts/e2e-soul-sampling.ts run --scope pilot-retest
```

Expected: retest scorecards pass core failure checks. If a platform failure blocks retest, record it under `platform` and fix the platform blocker before changing more Soul assets.

- [ ] **Step 7: Commit pilot fixes**

Run:

```bash
git add scripts/e2e-soul-sampling.ts scripts/e2e-soul-sampling.test.ts souls
git commit -m "fix(soul): 调优首轮真实采样问题"
```

If no Soul asset changed, skip the commit and note that pilot produced no asset fix.

## Task 7: Full AGENTS and Skill Sampling Loop

**Files:**
- Runtime evidence: `tmp/e2e-soul-sampling/full-freeform/`, `tmp/e2e-soul-sampling/full-google-ads/`, `tmp/e2e-soul-sampling/full-hr-manager/`, `tmp/e2e-soul-sampling/full-product-manager/`, `tmp/e2e-soul-sampling/full-software-support/`
- Modify as evidence demands:
  - `souls/*/engine/workspace/AGENTS.md`
  - `souls/*/engine/skills/*/SKILL.md`
  - `souls/*/engine/workspace/knowledge/*.md`
  - `souls/*/engine/workspace/templates/*.md`

- [ ] **Step 1: Run full sampling for one Soul at a time**

Use these commands, one Soul per iteration:

```bash
AIWORKER_E2E_RUN_ID=full-freeform AIWORKER_E2E_REASONING=high bun scripts/e2e-soul-sampling.ts run --soul aiworker-freeform
AIWORKER_E2E_RUN_ID=full-google-ads AIWORKER_E2E_REASONING=high bun scripts/e2e-soul-sampling.ts run --soul google-ads
AIWORKER_E2E_RUN_ID=full-hr-manager AIWORKER_E2E_REASONING=high bun scripts/e2e-soul-sampling.ts run --soul hr-manager
AIWORKER_E2E_RUN_ID=full-product-manager AIWORKER_E2E_REASONING=high bun scripts/e2e-soul-sampling.ts run --soul product-manager
AIWORKER_E2E_RUN_ID=full-software-support AIWORKER_E2E_REASONING=high bun scripts/e2e-soul-sampling.ts run --soul software-support
```

Expected: every run writes manifest, run summaries, scorecards, and findings under its matching `tmp/e2e-soul-sampling/full-*` directory.

- [ ] **Step 2: Fix one Soul at a time**

For each Soul, read its scorecards and findings. Apply this file choice rule:

```text
AGENTS routing or boundary failure -> the matching AGENTS.md file, for example souls/google-ads/engine/workspace/AGENTS.md
single workflow step or self-check failure -> the matching SKILL.md file named in the scorecard, for example souls/software-support/engine/skills/ticket-triage/SKILL.md
same missing method across multiple skills -> a concrete file under the same Soul's engine/workspace/knowledge directory
same missing delivery field across multiple skills -> a concrete file under the same Soul's engine/workspace/templates directory
CLI/session/projection/Codex failure before content quality -> platform finding, not a Soul wording patch
```

- [ ] **Step 3: Rebuild and validate the fixed Soul**

Use the package for the touched Soul:

```bash
bun run --filter '@zonease/aiworker-freeform' build
bun run --filter '@zonease/aiworker-freeform' validate
bun run --filter '@zonease/aiworker-google-ads' build
bun run --filter '@zonease/aiworker-google-ads' validate
bun run --filter '@zonease/aiworker-hr-manager' build
bun run --filter '@zonease/aiworker-hr-manager' validate
bun run --filter '@zonease/aiworker-product-manager' build
bun run --filter '@zonease/aiworker-product-manager' validate
bun run --filter '@zonease/aiworker-software-support' build
bun run --filter '@zonease/aiworker-software-support' validate
```

Run only the pair for the touched Soul during the loop. Run all pairs in the final gate.

- [ ] **Step 4: Retest failed cases with new prompts**

For each fixed Soul, run the matching command:

```bash
AIWORKER_E2E_RUN_ID=retest-aiworker-freeform AIWORKER_E2E_REASONING=high bun scripts/e2e-soul-sampling.ts run --soul aiworker-freeform --failed-from tmp/e2e-soul-sampling/full-freeform
AIWORKER_E2E_RUN_ID=retest-google-ads AIWORKER_E2E_REASONING=high bun scripts/e2e-soul-sampling.ts run --soul google-ads --failed-from tmp/e2e-soul-sampling/full-google-ads
AIWORKER_E2E_RUN_ID=retest-hr-manager AIWORKER_E2E_REASONING=high bun scripts/e2e-soul-sampling.ts run --soul hr-manager --failed-from tmp/e2e-soul-sampling/full-hr-manager
AIWORKER_E2E_RUN_ID=retest-product-manager AIWORKER_E2E_REASONING=high bun scripts/e2e-soul-sampling.ts run --soul product-manager --failed-from tmp/e2e-soul-sampling/full-product-manager
AIWORKER_E2E_RUN_ID=retest-software-support AIWORKER_E2E_REASONING=high bun scripts/e2e-soul-sampling.ts run --soul software-support --failed-from tmp/e2e-soul-sampling/full-software-support
```

Expected: failed AGENTS and skill cases pass core failure checks on new prompt wording.

- [ ] **Step 5: Commit each Soul's focused fixes**

Use one commit per Soul. Stage concrete paths for the Soul that changed:

```bash
git add souls/google-ads/engine/workspace/AGENTS.md souls/google-ads/engine/skills souls/google-ads/engine/workspace/knowledge souls/google-ads/engine/workspace/templates
git commit -m "fix(soul): 调优 google-ads 真实采样输出"

git add souls/hr-manager/engine/workspace/AGENTS.md souls/hr-manager/engine/skills souls/hr-manager/engine/workspace/knowledge souls/hr-manager/engine/workspace/templates
git commit -m "fix(soul): 调优 hr-manager 真实采样输出"

git add souls/product-manager/engine/workspace/AGENTS.md souls/product-manager/engine/skills souls/product-manager/engine/workspace/knowledge souls/product-manager/engine/workspace/templates
git commit -m "fix(soul): 调优 product-manager 真实采样输出"

git add souls/software-support/engine/workspace/AGENTS.md souls/software-support/engine/skills souls/software-support/engine/workspace/knowledge souls/software-support/engine/workspace/templates
git commit -m "fix(soul): 调优 software-support 真实采样输出"
```

Stage only files that changed for that Soul.

## Task 8: Final Verification

**Files:**
- All changed files from previous tasks

- [ ] **Step 1: Run static and contract tests**

Run:

```bash
bun test scripts/e2e-soul-sampling.test.ts
bun run docs:check
bun run test:contracts
git diff --check
```

Expected: all PASS.

- [ ] **Step 2: Run all Soul build and validate commands**

Run:

```bash
bun run --filter '@zonease/aiworker-freeform' build
bun run --filter '@zonease/aiworker-freeform' validate
bun run --filter '@zonease/aiworker-google-ads' build
bun run --filter '@zonease/aiworker-google-ads' validate
bun run --filter '@zonease/aiworker-hr-manager' build
bun run --filter '@zonease/aiworker-hr-manager' validate
bun run --filter '@zonease/aiworker-product-manager' build
bun run --filter '@zonease/aiworker-product-manager' validate
bun run --filter '@zonease/aiworker-software-support' build
bun run --filter '@zonease/aiworker-software-support' validate
```

Expected: all PASS.

- [ ] **Step 3: Run fleet and review gates**

Run:

```bash
bun run smoke:fleet
bun run crg:review
```

Expected: `smoke:fleet` PASS. `crg:review` reports no critical issue for changed files.

- [ ] **Step 4: Write final evidence summary**

Create or update:

```text
tmp/e2e-soul-sampling/final-summary.md
```

Use this exact structure:

```markdown
# Final Soul Sampling Summary

## Gates

## Real Codex Runs

## AGENTS Results

## Skill Results

## Soul Asset Changes

## Remaining Risks
```

Keep this under `tmp/`; do not commit it unless the user explicitly asks to preserve run evidence in git.

- [ ] **Step 5: Final status**

Run:

```bash
git status --short
git log --oneline -8
```

Expected: only intentional changes remain, and the latest commits are focused by task or Soul.

## Self-Review

- Spec coverage: contract drift cleanup, real worker/Codex sampling, AGENTS tests, 21 skill tests, evidence, redaction, classification, asset tuning, retest, build/validate, docs/contracts, smoke fleet, and CRG review are all covered.
- Placeholder scan: this plan contains no unfinished-marker wording and no unspecified file paths.
- Type consistency: `SamplingSoul`, `SamplingSkill`, `SamplingCase`, `FindingKind`, `SamplingManifest`, `buildSamplingManifest`, `buildCliPlan`, `writeScorecard`, and `runSamplingCaseWithCli` are defined before later tasks reference them.
