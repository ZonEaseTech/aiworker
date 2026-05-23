import type { ComposerMaterial } from './types'
import { describe, expect, it } from 'bun:test'

import {
  createHrPeopleWorkbenchApi,
  createProfileUpdateDraftSessionPayload,
  namespacedCapabilityTemplateId,
} from './api'
import {
  buildAttachedMaterialsMetadata,
  buildReadableSessionContext,
  candidateMaterialsFromSessionComposerMaterials,
  materialFromFile,
  sanitizeCandidateMaterialPaths,
} from './attachments'
import { normalizeHrWorkbenchHostData } from './host-data'

describe('HR people workbench host data', () => {
  it('normalizes mounted host data and only treats explicit dark theme as dark', () => {
    expect(normalizeHrWorkbenchHostData({
      hostData: {
        appId: ' custom-hr ',
        routePrefix: '/api/local/apps/custom-hr/',
        theme: 'dark',
        workerId: ' worker-1 ',
        workspaceId: ' workspace-1 ',
      },
    })).toEqual({
      appId: 'custom-hr',
      routePrefix: '/api/local/apps/custom-hr',
      theme: 'dark',
      workerId: 'worker-1',
      workspaceId: 'workspace-1',
    })

    expect(normalizeHrWorkbenchHostData({
      hostData: {
        theme: 'system',
      },
      search: '?appId=query-hr&routePrefix=%2Fapi%2Flocal%2Fapps%2Fquery-hr&workerId=query-worker&workspaceId=query-workspace&theme=dark',
    })).toEqual({
      appId: 'query-hr',
      routePrefix: '/api/local/apps/query-hr',
      theme: 'light',
      workerId: 'query-worker',
      workspaceId: 'query-workspace',
    })

    expect(normalizeHrWorkbenchHostData()).toEqual({
      appId: 'aiworker-hr',
      routePrefix: '/api/local/apps/aiworker-hr',
      theme: 'light',
      workerId: null,
      workspaceId: null,
    })
  })
})

describe('HR people workbench attachments', () => {
  it('converts browser files into material content and deduped upload paths', async () => {
    const materials = sanitizeCandidateMaterialPaths([
      await materialFromFile(new File(['hello Ada'], '../Ada Resume.txt', { type: 'text/plain' })),
      await materialFromFile(new File(['second Ada'], 'Ada Résumé.txt', { type: 'text/plain' })),
      await materialFromFile(new File([new Uint8Array([0, 1, 2, 255])], 'portfolio.bin', { type: 'application/octet-stream' })),
    ])

    expect(materials.map(material => [material.fileName, material.path, material.encoding, material.content])).toEqual([
      ['../Ada Resume.txt', 'evidence/uploads/ada-resume.txt', 'utf8', 'hello Ada'],
      ['Ada Résumé.txt', 'evidence/uploads/ada-resume-2.txt', 'utf8', 'second Ada'],
      ['portfolio.bin', 'evidence/uploads/portfolio.bin', 'base64', 'AAEC/w=='],
    ])

    expect(buildAttachedMaterialsMetadata(materials)).toEqual({
      attachedMaterials: [
        {
          encoding: 'utf8',
          fileName: '../Ada Resume.txt',
          mimeType: 'text/plain',
          path: 'evidence/uploads/ada-resume.txt',
          size: 9,
        },
        {
          encoding: 'utf8',
          fileName: 'Ada Résumé.txt',
          mimeType: 'text/plain',
          path: 'evidence/uploads/ada-resume-2.txt',
          size: 10,
        },
        {
          encoding: 'base64',
          fileName: 'portfolio.bin',
          mimeType: 'application/octet-stream',
          path: 'evidence/uploads/portfolio.bin',
          size: 4,
        },
      ],
      materialCount: 3,
    })
  })

  it('builds readable profile draft session context from user input and attachments', () => {
    const materials: ComposerMaterial[] = [
      {
        content: 'hello',
        encoding: 'utf8',
        fileName: 'Ada Resume.txt',
        mimeType: 'text/plain',
        path: 'evidence/uploads/ada-resume.txt',
        size: 5,
      },
    ]

    expect(buildReadableSessionContext({
      attachedMaterials: materials,
      profileName: 'Ada Chen',
      userInput: '请补齐候选人背景和证据缺口。',
    })).toContain('请补齐候选人背景和证据缺口。')
    expect(buildReadableSessionContext({
      attachedMaterials: materials,
      profileName: 'Ada Chen',
      userInput: '请补齐候选人背景和证据缺口。',
    })).toContain('- evidence/uploads/ada-resume.txt (Ada Resume.txt, text/plain, utf8, 5 bytes)')
  })

  it('keeps duplicate managed composer materials and lets HR own upload path dedupe', () => {
    const materials = candidateMaterialsFromSessionComposerMaterials([
      {
        content: 'first',
        encoding: 'utf8',
        mimeType: 'text/plain',
        name: 'same.txt',
        size: 5,
      },
      {
        content: 'bravo',
        encoding: 'utf8',
        mimeType: 'text/plain',
        name: 'same.txt',
        size: 5,
      },
    ])

    expect(materials.map(material => [material.fileName, material.path, material.content])).toEqual([
      ['same.txt', 'evidence/uploads/same.txt', 'first'],
      ['same.txt', 'evidence/uploads/same-2.txt', 'bravo'],
    ])
  })
})

describe('HR people workbench API helper', () => {
  it('loads local workbench data from the Host public local routes derived from routePrefix', async () => {
    const requests: string[] = []
    await withMockFetch(async () => {
      const api = createHrPeopleWorkbenchApi({
        appId: 'aiworker-hr',
        fetch: async (input, init) => {
          const url = String(input)
          requests.push(`${init?.method ?? 'GET'} ${url}`)
          if (url.endsWith('/workspaces'))
            return Response.json({ workspaces: [{ id: 'workspace-1', workerId: 'worker-1' }, { id: 'workspace-2', workerId: 'worker-2' }] })
          if (url.endsWith('/sessions'))
            return Response.json({ sessions: [{ id: 'session-1', workspaceId: 'workspace-1' }, { id: 'session-2', workspaceId: 'workspace-2' }] })
          if (url.endsWith('/artifacts'))
            return Response.json({ artifacts: [{ id: 'artifact-1', workspaceId: 'workspace-1' }] })
          if (url.endsWith('/workspaces/workspace-1/files/raw/README.md'))
            return new Response('# Ada Chen People Profile')
          return Response.json({})
        },
        routePrefix: '/api/local/apps/aiworker-hr/',
      })

      const data = await api.loadWorkbenchData({ workerId: 'worker-1', workspaceId: 'workspace-1' })

      expect(requests).toEqual([
        'GET /api/local/workspaces',
        'GET /api/local/sessions',
        'GET /api/local/artifacts',
        'GET /api/local/workspaces/workspace-1/files/raw/README.md',
      ])
      expect(data.workspaces.map(workspace => workspace.id)).toEqual(['workspace-1'])
      expect(data.sessions.map(session => session.id)).toEqual(['session-1'])
      expect(data.artifacts.map(artifact => artifact.id)).toEqual(['artifact-1'])
      expect(data.profileReadmes['workspace-1']).toBe('# Ada Chen People Profile')
    })
  })

  it('writes candidate materials and creates profile update draft sessions through the existing local contracts', async () => {
    const requests: Array<{ body: unknown, method: string, url: string }> = []
    await withMockFetch(async () => {
      const api = createHrPeopleWorkbenchApi({
        appId: 'aiworker-hr',
        fetch: async (input, init) => {
          const url = String(input)
          const body = init?.body
          requests.push({
            body: parseRequestBody(body),
            method: init?.method ?? 'GET',
            url,
          })
          if (url.includes('/files/raw/'))
            return Response.json({ file: { id: 'file-1', path: 'evidence/uploads/ada-resume.txt', workspaceId: 'workspace-1' } })
          if (url.endsWith('/sessions'))
            return Response.json({ session: { id: 'session-1' } }, { status: 201 })
          return Response.json({})
        },
        routePrefix: '/api/local/apps/aiworker-hr',
      })
      const material: ComposerMaterial = {
        content: 'hello',
        encoding: 'utf8',
        fileName: 'Ada Resume.txt',
        mimeType: 'text/plain',
        path: 'evidence/uploads/ada-resume.txt',
        size: 5,
      }

      await api.writeCandidateMaterial('workspace-1', material)
      await api.writeProfileReadme('workspace-1', {
        artifactId: 'artifact-1',
        profileMarkdown: '# Ada Chen People Profile',
      })
      await api.createProfileUpdateDraftSession('worker-1', 'workspace-1', createProfileUpdateDraftSessionPayload({
        appId: 'aiworker-hr',
        attachedMaterials: [material],
        profileName: 'Ada Chen',
        draftType: 'profile-update-draft',
        userInput: '请生成候选人档案草案。',
      }))

      expect(requests).toEqual([
        {
          body: 'hello',
          method: 'PUT',
          url: '/api/local/workspaces/workspace-1/files/raw/evidence/uploads/ada-resume.txt',
        },
        {
          body: '# Ada Chen People Profile\n',
          method: 'PUT',
          url: '/api/local/workspaces/workspace-1/files/raw/README.md',
        },
        {
          body: {
            capabilityTemplateId: 'aiworker-hr.profile-update-draft',
            context: expect.stringContaining('请生成候选人档案草案。'),
            input: expect.stringContaining('请生成候选人档案草案。'),
            metadata: {
              attachedMaterials: [
                {
                  encoding: 'utf8',
                  fileName: 'Ada Resume.txt',
                  mimeType: 'text/plain',
                  path: 'evidence/uploads/ada-resume.txt',
                  size: 5,
                },
              ],
              materialCount: 1,
              profileName: 'Ada Chen',
              draftType: 'profile-update-draft',
              source: 'hr-profile-composer',
            },
            title: 'Ada Chen 候选人档案草案',
          },
          method: 'POST',
          url: '/api/local/workers/worker-1/workspaces/workspace-1/sessions',
        },
      ])
    })
  })

  it('namespaces local capability ids for app-owned session creation', () => {
    expect(namespacedCapabilityTemplateId('aiworker-hr', 'profile-update-draft')).toBe('aiworker-hr.profile-update-draft')
    expect(namespacedCapabilityTemplateId('aiworker-hr', 'aiworker-hr.profile-update-draft')).toBe('aiworker-hr.profile-update-draft')
  })
})

async function withMockFetch(run: () => Promise<void>) {
  const originalFetch = globalThis.fetch
  try {
    await run()
  }
  finally {
    globalThis.fetch = originalFetch
  }
}

function parseRequestBody(body: BodyInit | null | undefined): unknown {
  if (typeof body !== 'string')
    return null
  try {
    return JSON.parse(body) as unknown
  }
  catch {
    return body
  }
}
