import { existsSync, mkdtempSync, readFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, expect, it } from 'bun:test'

import {
  buildCliEnv,
  buildCliPlan,
  buildSamplingManifest,
  classifyFinding,
  OFFICIAL_SAMPLING_SOULS,
  redactSamplingText,
  runSamplingCaseWithCli,
  samplingOutputSnippet,
  SCORE_DIMENSIONS,
  writeCaseEvents,
  writeScorecard,
} from './e2e-soul-sampling'
import { INTERNAL_OFFICIAL_SOUL_CATALOG_VIEW_ENV } from './worker-create-catalog-view'

const expectedAppIds = [
  'aiworker-freeform',
  'google-ads',
  'hr-manager',
  'product-manager',
  'software-support',
]

const expectedScoreDimensionIds = [
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
]

describe('e2e soul sampling static contracts', () => {
  it('locks the official Soul sampling order and coverage floor', () => {
    expect(OFFICIAL_SAMPLING_SOULS.map(soul => soul.appId)).toEqual(expectedAppIds)

    const totalSkillCount = OFFICIAL_SAMPLING_SOULS.reduce(
      (count, soul) => count + soul.skills.length,
      0,
    )

    expect(totalSkillCount).toBe(21)

    for (const soul of OFFICIAL_SAMPLING_SOULS) {
      expect(soul.agentsCases.length).toBeGreaterThanOrEqual(2)

      for (const skill of soul.skills) {
        expect(skill.cases.length).toBeGreaterThanOrEqual(2)
      }
    }
  })

  it('locks the rubric dimension order', () => {
    expect(SCORE_DIMENSIONS.map(dimension => dimension.id)).toEqual(expectedScoreDimensionIds)
  })

  it('uses real pilot prompts from the first live sampling evidence', () => {
    const freeform = OFFICIAL_SAMPLING_SOULS.find(soul => soul.appId === 'aiworker-freeform')
    const support = OFFICIAL_SAMPLING_SOULS.find(soul => soul.appId === 'software-support')
    const ticketTriage = support?.skills.find(skill => skill.id === 'ticket-triage')

    expect(freeform?.agentsCases).toEqual([
      {
        expectedEvidence: 'AGENTS instructions route the task to the right skill or base workflow',
        id: 'aiworker-freeform-agents-routing',
        prompt: '我想在这个 workspace 里整理一份本周工作复盘, 请先看当前投影文件再开始。',
      },
      {
        expectedEvidence: 'AGENTS instructions surface assets, boundaries, and self-check points',
        id: 'aiworker-freeform-agents-assets',
        prompt: '请不要套任何 HR/广告/客服流程, 只帮我做一个通用分析框架。',
      },
    ])
    expect(support?.agentsCases.find(item => item.id === 'software-support-agents-routing')?.prompt)
      .toBe('曼谷门店晚高峰 PromptPay 扣款但 kiosk 未结账, 店长很急。')
    expect(ticketTriage?.cases.find(item => item.id === 'ticket-triage-happy-path')?.prompt)
      .toBe('分诊一条 PromptPay 已扣款但 SaleOrder 未结账的商家工单, 需要升级 issue。')
  })

  it('keeps Product Manager asset citations out of temporary projection paths', () => {
    const agents = readFileSync('souls/product-manager/engine/workspace/AGENTS.md', 'utf8')

    expect(agents).toContain('不要输出投影工作区绝对路径')
    expect(agents).toContain('knowledge/product-playbook.md')
  })

  it('keeps Google Ads monthly review deliverables from collapsing into a short summary', () => {
    const skill = readFileSync(
      'souls/google-ads/engine/skills/client-performance-review/SKILL.md',
      'utf8',
    )

    expect(skill).toContain('最低可交付月报')
    expect(skill).toContain('分区月报草案')
    expect(skill).toContain('不要退化成几段摘要')
    expect(skill).toContain('输出时必须保留这些小节标题')
    expect(skill).toContain('客户健康度')
    expect(skill).toContain('客户可以进入复盘会议的月报草案')
  })

  it('keeps the repo-local sampling skill frontmatter loadable by Codex', () => {
    const skill = readFileSync('.agents/skills/aiworker-soul-e2e-sampling/SKILL.md', 'utf8')

    expect(skill.startsWith('---\nname: aiworker-soul-e2e-sampling\n')).toBe(true)
    expect(skill).toContain('description: "Use only inside an AIWorker repository/worktree')
  })

  it('keeps official Soul answers focused on deliverables instead of internal process narration', () => {
    for (const soul of expectedAppIds) {
      const agents = readFileSync(`souls/${soul}/engine/workspace/AGENTS.md`, 'utf8')

      expect(agents).toContain('不要把内部过程写给用户')
      expect(agents).toContain('直接给结论、交付物、必要假设和下一步')
      expect(agents).toContain('不要用“我会先读取 / 我先检查 / 我将调用”')
    }
  })

  it('keeps official Soul skills from starting user answers with tool-use narration', () => {
    for (const soul of OFFICIAL_SAMPLING_SOULS) {
      for (const skill of soul.skills) {
        const skillText = readFileSync(skill.sourcePath, 'utf8')

        expect(skillText).toContain('回答从结果开始')
        expect(skillText).toContain('不要以“使用 `')
        expect(skillText).toContain('不要以“使用 `skill` / 我会按 / 我会先 / 我先读取 / 已确认”')
      }
    }
  })

  it('classifies sampling findings by remediation owner', () => {
    expect(classifyFinding('AGENTS.md 选路不稳, 领域边界和资产索引不清')).toBe('agents')
    expect(classifyFinding('SKILL.md 缺步骤、缺约束、触发描述不清、自检不足')).toBe('skill')
    expect(classifyFinding('knowledge/playbook 或 templates 缺必要口径')).toBe('knowledge-template')
    expect(classifyFinding('descriptor、projection、CLI、session 或 engine bridge 运行异常')).toBe('platform')
  })

  it('redacts sampling secrets and merchant identifiers before evidence is written', () => {
    const redacted = redactSamplingText(
      'token=sk-test-secret phone=+66812345678 merchantId=MERCHANT-1234567890',
    )

    expect(redacted).toBe('token=[REDACTED] phone=[REDACTED] merchantId=[REDACTED]')
    expect(redacted).not.toContain('sk-test-secret')
    expect(redacted).not.toContain('+66812345678')
    expect(redacted).not.toContain('MERCHANT-1234567890')
  })

  it('builds a stable manifest for a sampling run', () => {
    const manifest = buildSamplingManifest({
      commit: 'abc1234',
      home: '/tmp/aiworker-e2e-home',
      runId: '2026-06-06T01-00-00Z',
    })

    expect(manifest).toMatchObject({
      commit: 'abc1234',
      evidenceRoot: 'tmp/e2e-soul-sampling/2026-06-06T01-00-00Z',
      home: '/tmp/aiworker-e2e-home',
      runId: '2026-06-06T01-00-00Z',
      totals: {
        minAgentsCasesPerSoul: 2,
        minSkillCasesPerSkill: 2,
        skills: 21,
        souls: 5,
      },
    })
    expect(manifest.souls.map(soul => soul.appId)).toEqual(expectedAppIds)
    expect(manifest.scoreDimensions.map(dimension => dimension.id)).toEqual(expectedScoreDimensionIds)
  })

  it('passes an extended local engine timeout to real sampling CLI runs', () => {
    const previous = process.env.AIWORKER_E2E_ENGINE_TIMEOUT_MS
    const manifest = buildSamplingManifest({
      commit: 'abc1234',
      home: '/tmp/aiworker-e2e-home',
      runId: 'timeout-env',
    })

    try {
      delete process.env.AIWORKER_E2E_ENGINE_TIMEOUT_MS
      expect(buildCliEnv(manifest).AIWORKER_LOCAL_CLI_ENGINE_TIMEOUT_MS).toBe('900000')

      process.env.AIWORKER_E2E_ENGINE_TIMEOUT_MS = '1200000'
      expect(buildCliEnv(manifest).AIWORKER_LOCAL_CLI_ENGINE_TIMEOUT_MS).toBe('1200000')
    }
    finally {
      if (previous === undefined)
        delete process.env.AIWORKER_E2E_ENGINE_TIMEOUT_MS
      else
        process.env.AIWORKER_E2E_ENGINE_TIMEOUT_MS = previous
    }
  })

  it('rejects sampling run ids that escape the evidence root', () => {
    expect(() => buildSamplingManifest({
      commit: 'abc1234',
      home: '/tmp/aiworker-e2e-home',
      runId: '../escape',
    })).toThrow('Unsafe sampling runId')
  })

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
      [
        'workspace',
        'create',
        '--worker',
        'e2e-software-support',
        '--name',
        'software-support-support-agents-route',
      ],
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

  it('runs one sampling case through the AIWorker CLI adapter', async () => {
    const calls: Array<{ args: string[], env?: Record<string, string | undefined> }> = []
    const runCli = async (args: string[], env?: Record<string, string | undefined>): Promise<string> => {
      calls.push({ args, env })
      if (args[0] === 'workspace' && args[1] === 'create')
        return '{"workspace":{"id":"workspace-1"}}'
      if (args[0] === 'session' && args[1] === 'start')
        return '{"invocation":{"id":"invocation-1","status":"succeeded"},"session":{"id":"session-1"}}'
      if (args[0] === 'session' && args[1] === 'events') {
        return JSON.stringify({
          events: [
            {
              payloadJson: {
                data: { text: '请先补充商家原始描述、门店终端和涉资金状态。' },
              },
              type: 'invocation.output.snapshot',
            },
            { type: 'invocation.completed' },
          ],
        })
      }
      return '{"ok":true}'
    }

    const result = await runSamplingCaseWithCli({
      caseId: 'case-1',
      prompt: '请自然处理这个请求。',
      runCli,
      scope: { appId: 'software-support', workerId: 'e2e-software-support' },
    })

    expect(calls).toContainEqual({
      args: ['worker', 'create', 'e2e-software-support', '--app', 'software-support'],
      env: expect.objectContaining({ [INTERNAL_OFFICIAL_SOUL_CATALOG_VIEW_ENV]: 'dev-sampling' }),
    })

    const sessionStart = calls.find(call => call.args[0] === 'session' && call.args[1] === 'start')?.args
    expect(sessionStart).toEqual(expect.arrayContaining([
      '--engine',
      'codex',
      '--reasoning',
      'high',
      '--input',
      '请自然处理这个请求。',
    ]))
    expect(calls.map(call => call.args)).toContainEqual(['session', 'events', 'invocation-1', '--worker', 'e2e-software-support'])
    expect(result).toEqual({
      assistantText: '请先补充商家原始描述、门店终端和涉资金状态。',
      events: [
        {
          payloadJson: {
            data: { text: '请先补充商家原始描述、门店终端和涉资金状态。' },
          },
          type: 'invocation.output.snapshot',
        },
        { type: 'invocation.completed' },
      ],
      invocationId: 'invocation-1',
      sessionId: 'session-1',
      workspaceId: 'workspace-1',
    })
  })

  it('extracts CLI JSON objects from stdout with surrounding logs', async () => {
    const runCli = async (args: string[]): Promise<string> => {
      if (args[0] === 'workspace' && args[1] === 'create')
        return 'creating workspace\n{"workspace":{"id":"workspace-1"}}\ncreated'
      if (args[0] === 'session' && args[1] === 'start')
        return 'starting session\n{"invocation":{"id":"invocation-1","status":"succeeded"},"session":{"id":"session-1"}}\nstarted'
      if (args[0] === 'session' && args[1] === 'events')
        return 'events\n{"events":[{"payloadJson":{"data":{"text":"第一段。"}}},{"payloadJson":{"data":{"text":"第二段。"}}},{"type":"invocation.completed"}]}\ndone'
      return '{"ok":true}'
    }

    await expect(runSamplingCaseWithCli({
      caseId: 'case-1',
      prompt: '请自然处理这个请求。',
      runCli,
      scope: { appId: 'software-support', workerId: 'e2e-software-support' },
    })).resolves.toEqual({
      assistantText: '第一段。\n第二段。',
      events: [
        { payloadJson: { data: { text: '第一段。' } } },
        { payloadJson: { data: { text: '第二段。' } } },
        { type: 'invocation.completed' },
      ],
      invocationId: 'invocation-1',
      sessionId: 'session-1',
      workspaceId: 'workspace-1',
    })
  })

  it('continues when the CLI worker already exists in this sampling run', async () => {
    const calls: Array<{ args: string[], env?: Record<string, string | undefined> }> = []
    const runCli = async (args: string[], env?: Record<string, string | undefined>): Promise<string> => {
      calls.push({ args, env })
      if (args[0] === 'worker' && args[1] === 'create')
        throw new Error('fleet worker already exists: e2e-software-support')
      if (args[0] === 'workspace' && args[1] === 'create')
        return '{"workspace":{"id":"workspace-1"}}'
      if (args[0] === 'session' && args[1] === 'start')
        return '{"invocation":{"id":"invocation-1","status":"succeeded"},"session":{"id":"session-1"}}'
      if (args[0] === 'session' && args[1] === 'events')
        return '{"events":[{"type":"invocation.completed"}]}'
      return '{"ok":true}'
    }

    const result = await runSamplingCaseWithCli({
      caseId: 'case-1',
      prompt: '请自然处理这个请求。',
      runCli,
      scope: { appId: 'software-support', workerId: 'e2e-software-support' },
    })

    expect(calls).toContainEqual({
      args: ['worker', 'create', 'e2e-software-support', '--app', 'software-support'],
      env: expect.objectContaining({ [INTERNAL_OFFICIAL_SOUL_CATALOG_VIEW_ENV]: 'dev-sampling' }),
    })
    expect(calls.map(call => call.args)).toContainEqual([
      'workspace',
      'create',
      '--worker',
      'e2e-software-support',
      '--name',
      'software-support-case-1',
    ])
    expect(result).toEqual({
      assistantText: '',
      events: [{ type: 'invocation.completed' }],
      invocationId: 'invocation-1',
      sessionId: 'session-1',
      workspaceId: 'workspace-1',
    })
  })

  it('rejects failed invocations after fetching events for evidence', async () => {
    const calls: string[][] = []
    const runCli = async (args: string[]): Promise<string> => {
      calls.push(args)
      if (args[0] === 'workspace' && args[1] === 'create')
        return '{"workspace":{"id":"workspace-1"}}'
      if (args[0] === 'session' && args[1] === 'start')
        return '{"invocation":{"id":"invocation-1","status":"failed","error":"codex exited"},"session":{"id":"session-1"}}'
      if (args[0] === 'session' && args[1] === 'events')
        return '{"events":[{"type":"invocation.error"}]}'
      return '{"ok":true}'
    }

    await expect(runSamplingCaseWithCli({
      caseId: 'case-1',
      prompt: '请自然处理这个请求。',
      runCli,
      scope: { appId: 'software-support', workerId: 'e2e-software-support' },
    })).rejects.toThrow('invocation invocation-1 failed')

    expect(calls).toContainEqual(['session', 'events', 'invocation-1', '--worker', 'e2e-software-support'])
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
    expect(text).not.toContain('+66812345678')
    expect(text).not.toContain('MERCHANT-1234567890')
  })

  it('prefers assistant text over id-only summaries for scorecard output snippets', () => {
    expect(samplingOutputSnippet({
      assistantText: 'token=sk-test-secret\n请先补充商家原始描述。',
      events: [{ type: 'invocation.output.snapshot' }],
      invocationId: 'invocation-1',
      sessionId: 'session-1',
      workspaceId: 'workspace-1',
    })).toBe('token=sk-test-secret\n请先补充商家原始描述。')

    expect(samplingOutputSnippet({
      assistantText: '',
      events: [{ type: 'invocation.completed' }],
      invocationId: 'invocation-1',
      sessionId: 'session-1',
      workspaceId: 'workspace-1',
    })).toBe('workspaceId=workspace-1 sessionId=session-1 invocationId=invocation-1 events=fetched')
  })

  it('writes parsed events for a sampling case under a safe evidence path', () => {
    const dir = mkdtempSync(join(tmpdir(), 'aiworker-events-'))

    writeCaseEvents({
      caseId: 'case-1',
      events: [
        {
          payloadJson: { data: { text: '真实 assistant 输出' } },
          type: 'invocation.output.snapshot',
        },
      ],
      root: dir,
    })

    expect(readFileSync(join(dir, 'events', 'case-1.json'), 'utf8')).toBe(`${JSON.stringify({
      caseId: 'case-1',
      events: [
        {
          payloadJson: { data: { text: '真实 assistant 输出' } },
          type: 'invocation.output.snapshot',
        },
      ],
    }, null, 2)}\n`)
  })

  it('rejects event case ids that escape the events directory', () => {
    const dir = mkdtempSync(join(tmpdir(), 'aiworker-events-'))

    expect(() => writeCaseEvents({
      caseId: '../escape',
      events: [],
      root: dir,
    })).toThrow('Unsafe sampling caseId')

    expect(existsSync(join(dir, 'escape.json'))).toBe(false)
  })

  it('rejects scorecard case ids that escape the scorecards directory', () => {
    const dir = mkdtempSync(join(tmpdir(), 'aiworker-scorecard-'))

    expect(() => writeScorecard({
      caseId: '../escape',
      dimensions: [{ id: 'boundary-and-compliance', score: 2 }],
      findingKinds: ['platform'],
      outputSnippet: 'safe output',
      prompt: 'safe prompt',
      root: dir,
      status: 'fail',
    })).toThrow('Unsafe sampling caseId')

    expect(existsSync(join(dir, 'escape.json'))).toBe(false)
  })
})
