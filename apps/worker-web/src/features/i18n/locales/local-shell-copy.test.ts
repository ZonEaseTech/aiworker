import { describe, expect, it } from 'vitest'

import { messagesFor, supportedLocales } from '..'

type ShellCopy = ReturnType<typeof messagesFor>

function defaultShellCopy(copy: ShellCopy): string[] {
  return [
    copy.accessibility.artifactSettings,
    copy.accessibility.sessionOutputPreview,
    copy.accessibility.closeSettings,
    copy.accessibility.openSettings,
    copy.accessibility.soulProjectsAndArtifacts,
    copy.app.subtitle,
    copy.artifact.defaultHint,
    copy.artifact.empty,
    copy.artifact.label,
    copy.artifact.loading,
    copy.artifact.pending,
    copy.navigation.topTabs.artifacts,
    copy.projects.empty.detail('HR'),
    copy.projects.empty.title,
    copy.projects.searchPlaceholder,
    copy.workspace.artifactCount(2),
    copy.workspace.createSessionPlaceholder,
    copy.workspace.followUpPlaceholder,
    copy.workspace.noSelectionDetail,
    copy.settings.connectors.hint,
    copy.settings.dialog.kicker,
    copy.settings.dialog.subtitle,
    copy.settings.dialog.title,
    copy.settings.externalMcp.pending,
  ]
}

describe('local shell copy', () => {
  it('keeps deprecated platform concepts out of the default shell copy', () => {
    const forbidden = [
      /artifact/i,
      /\breview\b/i,
      /memory/i,
      /proposal/i,
      /broker/i,
      /governance/i,
      /grant/i,
      /audit/i,
      /permission/i,
      /platform connector/i,
      /project/i,
      /产物/,
      /评审/,
      /记忆/,
      /项目/,
      /提案/,
      /治理/,
      /授权/,
      /审计/,
      /权限/,
      /成果物/,
      /(?<!プ)レビュー/,
      /メモリー/,
      /プロジェクト/,
      /提案/,
      /ガバナンス/,
      /権限/,
      /監査/,
      /Artefakt/i,
      /\bReview\b/i,
      /Memory/i,
      /Projekt/i,
      /Vorschlag/i,
      /Governance/i,
      /Berechtigung/i,
      /Audit/i,
    ]

    for (const locale of supportedLocales) {
      for (const text of defaultShellCopy(messagesFor(locale))) {
        for (const pattern of forbidden)
          expect(text, `${locale}: ${text}`).not.toMatch(pattern)
      }
    }
  })

  it('describes the default path as Soul workspace sessions', () => {
    expect(messagesFor('en').app.subtitle).toBe('Souls, workspaces, sessions')
    expect(messagesFor('zh-CN').app.subtitle).toBe('Soul、工作区、会话')
    expect(messagesFor('en').projects.empty.title).toBe('No workspaces yet')
    expect(messagesFor('zh-CN').projects.empty.title).toBe('还没有工作区')
    expect(messagesFor('en').projects.searchPlaceholder).toBe('Search workspaces...')
    expect(messagesFor('zh-CN').projects.searchPlaceholder).toBe('搜索工作区...')
  })

  it('drops retired Soul App / app-owned vocabulary from worker shell copy', () => {
    const forbidden = [/Soul[- ]Apps?\b/i, /app-owned/i, /应用自有/, /App 所有/, /app-eigene/i]
    for (const locale of supportedLocales) {
      const copy = messagesFor(locale)
      const texts = [
        copy.app.subtitle,
        copy.artifact.defaultHint,
        copy.projects.empty.detail('HR'),
        copy.workspace.createSessionPlaceholder,
        copy.workspace.followUpPlaceholder,
        copy.workspace.noSelectionDetail,
        copy.settings.connectors.hint,
        copy.settings.dialog.subtitle,
        copy.settings.externalMcp.pending,
        copy.settings.nav.soulPacks,
        copy.settings.soulPacks.empty,
        copy.settings.soulPacks.hint,
        copy.settings.soulPacks.title,
      ]
      for (const text of texts) {
        for (const pattern of forbidden)
          expect(text, `${locale}: ${text}`).not.toMatch(pattern)
      }
    }

    expect(Object.keys(messagesFor('en').workspace)).not.toContain('firstRunTitle')
    expect(Object.keys(messagesFor('en').workspace)).not.toContain('firstRunDetail')
    expect(Object.keys(messagesFor('en').workspace)).not.toContain('noSoulApps')
    expect(Object.keys(messagesFor('en').workspace)).not.toContain('soulApps')
  })

  it('uses session context and invocation language for Host shell copy', () => {
    const forbidden = [
      /\bbusiness context\b/i,
      /业务上下文/,
      /業務コンテキスト/,
      /Geschäftskontext/i,
      /\bturns?\b/i,
      /ターン/,
    ]

    for (const locale of supportedLocales) {
      const copy = messagesFor(locale)
      expect(copy.workspace.invocationCount, `${locale}: invocationCount`).toBeTypeOf('function')
      const texts = [
        copy.create.sessionContext,
        copy.workspace.byokNeedsKey,
        copy.workspace.byokReady('Codex', 'gpt-5'),
        copy.workspace.engineReadyDetail('Codex'),
        copy.workspace.engineStarting,
        copy.workspace.followUpInput,
        copy.workspace.noEvents,
        copy.workspace.noInvocations,
        copy.workspace.sendInvocation,
        copy.workspace.sendingInvocation,
        typeof copy.workspace.invocationCount === 'function'
          ? copy.workspace.invocationCount(2)
          : '',
        copy.workspace.invocationHistory,
        copy.settings.engine.hint,
      ]

      for (const text of texts) {
        expect(text, `${locale}: shell copy is missing`).toBeTypeOf('string')
        for (const pattern of forbidden)
          expect(text, `${locale}: ${text}`).not.toMatch(pattern)
      }
    }

    expect(Object.keys(messagesFor('en').create)).not.toContain('businessContext')
    expect(Object.keys(messagesFor('en').workspace)).not.toContain('noTurns')
    expect(Object.keys(messagesFor('en').workspace)).not.toContain('sendTurn')
    expect(Object.keys(messagesFor('en').workspace)).not.toContain('sendingTurn')
    expect(Object.keys(messagesFor('en').workspace)).not.toContain('turnCount')
    expect(Object.keys(messagesFor('en').workspace)).not.toContain('turnHistory')
  })
})
