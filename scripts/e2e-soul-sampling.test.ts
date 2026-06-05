import { describe, expect, it } from 'bun:test'

import {
  buildSamplingManifest,
  classifyFinding,
  OFFICIAL_SAMPLING_SOULS,
  redactSamplingText,
  SCORE_DIMENSIONS,
} from './e2e-soul-sampling'

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
})
