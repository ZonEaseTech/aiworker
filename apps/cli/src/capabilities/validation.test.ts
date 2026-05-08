import { mkdir, mkdtemp, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'

import { describe, expect, it } from 'bun:test'

import { validateCapabilityProject } from './validation'

async function writeJson(filePath: string, value: unknown): Promise<void> {
  await writeFile(filePath, `${JSON.stringify(value, null, 2)}\n`, 'utf8')
}

async function makeAiworkerRoot(prefix: string): Promise<string> {
  const root = await mkdtemp(path.join(tmpdir(), prefix))
  await mkdir(path.join(root, '.agents', 'skills', 'release-check'), { recursive: true })
  return root
}

describe('capability static validation', () => {
  it('passes canonical policy, toolset, pack, MCP and Skill metadata', async () => {
    const root = await makeAiworkerRoot('aiworker-capability-valid-')
    await writeJson(path.join(root, 'policy.json'), {
      outOfScope: { strategy: 'handoff' },
      risk: { highRiskRequiresApproval: true, policy: 'ask before risky writes' },
      schemaVersion: 1,
      soul: { label: 'Developer', preset: 'developer', source: 'flag' },
      status: 'draft',
      toolPolicy: {
        default: 'ask',
        rules: [
          { action: 'auto', pattern: 'read.*' },
          { action: 'ask', pattern: 'write.*' },
        ],
      },
    })
    await writeJson(path.join(root, 'brain-capabilities.json'), {
      defaultToolsets: ['filesystem-read', 'test'],
      packs: [
        { id: 'code', status: 'draft', validation: { issues: [], status: 'pending' } },
        { id: 'review', status: 'draft', validation: { issues: [], status: 'pending' } },
      ],
      mcp: {
        servers: {
          docs: {
            description: 'Documentation MCP',
            tools: [
              { description: 'Search docs', name: 'docs.search' },
            ],
            transport: 'streamable-http',
            url: 'http://127.0.0.1:3000/mcp',
          },
        },
      },
      schemaVersion: 1,
      soul: 'developer',
      status: 'draft',
      validation: { issues: [], status: 'pending' },
    })
    await writeFile(
      path.join(root, '.agents', 'skills', 'release-check', 'SKILL.md'),
      [
        '---',
        'name: release-check',
        'description: Verify a release candidate.',
        'version: 1.0.0',
        'capabilities:',
        '  - release-gates',
        'permissions:',
        '  - filesystem-read',
        '---',
        'Run focused release checks.',
        '',
      ].join('\n'),
      'utf8',
    )

    const report = await validateCapabilityProject(root)

    expect(report.status).toBe('pass')
    expect(report.checks.every(check => check.status === 'pass')).toBe(true)
  })

  it('ignores Markdown sidecars inside brain skill packages', async () => {
    const root = await makeAiworkerRoot('aiworker-capability-sidecar-')
    await writeJson(path.join(root, 'policy.json'), {
      outOfScope: { strategy: 'handoff' },
      risk: { highRiskRequiresApproval: true },
      schemaVersion: 1,
      status: 'draft',
    })
    await writeJson(path.join(root, 'brain-capabilities.json'), {
      defaultToolsets: ['filesystem-read'],
      packs: [
        { id: 'general', status: 'draft', validation: { issues: [], status: 'pending' } },
      ],
      mcp: { servers: {} },
      schemaVersion: 1,
      status: 'draft',
    })
    await writeFile(
      path.join(root, '.agents', 'skills', 'release-check', 'SKILL.md'),
      [
        '---',
        'name: release-check',
        'description: Verify a release candidate.',
        '---',
        'Run focused release checks.',
        '',
      ].join('\n'),
      'utf8',
    )
    await mkdir(path.join(root, '.agents', 'skills', 'release-check', 'references'), { recursive: true })
    await writeFile(
      path.join(root, '.agents', 'skills', 'release-check', 'references', 'notes.md'),
      '# Missing frontmatter but not a skill entrypoint\n',
      'utf8',
    )

    const report = await validateCapabilityProject(root)
    const skills = report.checks.find(check => check.id === 'native-skills')

    expect(skills?.status).toBe('pass')
    expect(skills?.issues).toEqual([])
  })

  it('fails unsafe and unknown capability descriptors', async () => {
    const root = await makeAiworkerRoot('aiworker-capability-invalid-')
    await writeJson(path.join(root, 'policy.json'), {
      outOfScope: { strategy: 'handoff' },
      risk: { highRiskRequiresApproval: false },
      schemaVersion: 1,
      status: 'draft',
      toolPolicy: {
        default: 'ask',
        rules: [
          { action: 'auto', pattern: 'write.*' },
        ],
      },
    })
    await writeJson(path.join(root, 'brain-capabilities.json'), {
      defaultToolsets: ['shell', 'unknown-toolset'],
      packs: [
        { id: 'unknown-pack', status: 'draft', validation: { issues: [], status: 'pending' } },
      ],
      mcp: {
        servers: {
          unsafe: {
            token: 'plain-secret',
            transport: 'streamable-http',
          },
        },
      },
      schemaVersion: 1,
      status: 'draft',
    })
    await writeFile(path.join(root, '.agents', 'skills', 'release-check', 'SKILL.md'), '# Missing frontmatter\n', 'utf8')

    const report = await validateCapabilityProject(root)
    const codes = report.checks.flatMap(check => check.issues.map(item => item.code))

    expect(report.status).toBe('fail')
    expect(codes).toContain('policy.high_risk_auto_rule')
    expect(codes).toContain('brain-capabilities.toolsets.high_risk_without_approval')
    expect(codes).toContain('brain-capabilities.toolsets.unknown_default')
    expect(codes).toContain('brain-capabilities.packs.unknown')
    expect(codes).toContain('mcp.http_missing_url')
    expect(codes).toContain('mcp.plaintext_secret')
    expect(codes).toContain('skills.frontmatter_missing')
  })
})
