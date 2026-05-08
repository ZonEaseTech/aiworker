import type {
  AgentRunInput,
  BrainAdmissionProposal,
  BrainProvider,
  ChannelType,
  ChatMessage,
  ConversationState,
  EngineSessionBinding,
  Envelope,
  ExecutorConfig,
  ExecutorProvider,
  OrchestratorCompactionConfig,
  ToolCall,
  WorkerConfig,
} from '@zonease/aiworker-shared'
import type { BrainJournalEventKind } from '../brain/journal'
import type { WorkerEventBus } from '../events/bus'
import type { WorkspaceHandle, WorkspaceManager } from '../executor/workspace'
import type { ApprovalDecision, ApprovalStore } from './approvals'
import type { DecisionContext, RequiredContext } from './decisions'

import type { ProcessManager } from './process-manager'

import { createHash } from 'node:crypto'
import { AppError, brainAdmissionMemoryAddPayloadSchema, DEFAULT_MAX_HISTORY_MESSAGES, redactBodySecrets } from '@zonease/aiworker-shared'

import { agentTasks, conversations, getSessionEntry, getWorkerDb, messages, recordSessionCompaction, rotateSessionConversation, sessionEntries, touchSessionEntry, updateSessionEngineBinding, upsertSessionEntry } from '@zonease/aiworker-storage-sqlite/worker'
import consola from 'consola'
import { and, asc, desc, eq, gt } from 'drizzle-orm'
import { BrainAdmissionService } from '../brain/admission'
import { recordBrainGovernanceBypassWarning } from '../brain/governance-bypass'
import { BrainJournalService, describeExecutorAuthority, recordBrainJournalEvent } from '../brain/journal'
import { reviewTaskWithBrainEngine } from '../brain/reviewer'
import { getChannelAdapter } from '../channels/registry'
import { classifyContinuation, findOpenConversation, findSessionConversation, hasSessionEntryForRoute, loadRecentMessages, resolveSessionKey } from '../conversation/router'
import { DEFAULT_APPROVAL_TIMEOUT_MS } from './approvals'
import { CapabilityRegistry, planCapabilities } from './capabilities'
import {
  DEFAULT_TOKEN_BUDGET_HISTORY_SCAN_MESSAGES,
  estimateChatMessagesTokens,
  estimateChatMessageTokens,
  resolveContextBudget,
  resolveExecutorModel,
} from './context'
import { appendLoadedBrainMemories, appendLoadedBrainSkillBodies, ContextManager, RunContextComposer } from './context-manager'
import { deadLoopDetectorFromConfig } from './dead-loop'
import { recordConversationClassifier, recordIntentDecision, recordQualityGate } from './decision-pipeline-stats'
import { buildPromptCapabilityDecision } from './decisions'
import { classifyIntentHeuristic, classifyIntentWithExecutor } from './intent-classifier'
import { evaluateToolPolicy } from './policy'
import { buildRepairPrompt, evaluateQualityGate } from './quality-gate'

interface OrchestratorDeps {
  config: WorkerConfig
  brain: BrainProvider
  executor: ExecutorProvider
  controlExecutor?: ExecutorProvider
  controlExecutorConfig?: ExecutorConfig
  controlExecutorReusesTaskExecutor?: boolean
  bus: WorkerEventBus
  workerId: string
  workspaces: WorkspaceManager
  /**
   * 进程级集中管控（FEAT-015）。`ingest` 与 `disposeWorkspace` 都走
   * `processes.run`：group=conversationId 保证同会话 FIFO；engine 取自
   * `config.executor.engine`，class=interactive（人类 envelope）或
   * background（清理）。stall 检测通过 onActivity（每个 AgentEvent 触发）
   * + cancel（AbortController.abort() → engine 内部 SIGTERM/SIGKILL）实现。
   */
  processes: ProcessManager
  /**
   * Per-tool approval store（PLAN-014 F2）。runtime 跨 reload 重建一次；
   * `runTool()` 命中 `ask` 时挂在这里等 operator 解锁，dispose 时全部 reject。
   */
  approvals: ApprovalStore
}

type ConversationRow = typeof conversations.$inferSelect
interface ResolvedConversation {
  conversation: ConversationState
  sessionAction: 'continue' | 'new_topic' | 'reset_requested' | 'isolated_task'
  sessionReason: string
  sessionKey: string
}

interface TranscriptRow {
  id: number
  role: ChatMessage['role']
  content: string
  toolCalls: ToolCall[] | null
  toolCallId: string | null
  richMetadata: string | null
}

interface CompactionCheckpoint {
  messageId: number
  compactedThroughMessageId: number
}

interface MemoryFlushResult {
  attempted: boolean
  at?: string
  status?: 'proposed' | 'already-proposed' | 'failed' | 'empty'
  proposalId?: string
  error?: string
}

interface CompactionOutcome {
  conversation: ConversationState
  compacted: boolean
}

interface ExecutorTextResult {
  ok: boolean
  text: string
  error?: string
  staleBindingCleared?: boolean
}

const DEFAULT_COMPACTION_MAX_SUMMARY_MESSAGES = 120
const MAX_PROOF_LOOP_RERUNS = 3
const TRANSCRIPT_METADATA_VERSION = 1
const TASK_ERROR_MAX_LENGTH = 1000
const WORKER_ADMIN_CONTINUATION = Symbol('worker-admin-continuation')
const NATIVE_PROJECT_SKILL_ENGINES = new Set(['claude-code', 'codex'])

function usesNativeProjectSkills(engine: string): boolean {
  return NATIVE_PROJECT_SKILL_ENGINES.has(engine)
}

function filterRequiredContextForEngine(requiredContext: RequiredContext[], engine: string): RequiredContext[] {
  if (!usesNativeProjectSkills(engine))
    return requiredContext
  return requiredContext.filter(item => item !== 'skill_load')
}

/** `runTool` 输入。`taskId` / `toolCallId` 用作 ApprovalStore 的 key。 */
export interface RunToolInput {
  taskId: string
  toolCallId: string
  toolName: string
  params: Record<string, unknown>
  /** 仅用于把 deny 短路 message 落库；缺省时不写库。 */
  conversationId?: string
  /** 覆盖默认 60s 超时；测试用。 */
  timeoutMs?: number
}

export type RunToolDecision = 'allow' | 'deny'

export interface RunToolResult {
  decision: RunToolDecision
  /** 命中的 policy action（auto / ask / deny）。 */
  policy: 'auto' | 'ask' | 'deny'
  /** 当 policy=deny 时合成的 assistant 文本；其余情况为 undefined。 */
  syntheticAssistantMessage?: string
}

export class Orchestrator {
  private readonly capabilityRegistry: CapabilityRegistry
  private readonly contextManager: ContextManager

  constructor(private readonly deps: OrchestratorDeps) {
    this.capabilityRegistry = new CapabilityRegistry({
      workerId: deps.workerId,
    })
    this.contextManager = new ContextManager({
      brain: deps.brain,
      workerId: deps.workerId,
    })
  }

  private recordJournal(input: {
    kind: BrainJournalEventKind
    taskId?: string
    conversationId?: string
    payload?: Record<string, unknown>
  }): void {
    try {
      recordBrainJournalEvent(input)
    }
    catch (err) {
      consola.warn(`[orchestrator] brain journal record failed: ${String(err)}`)
    }
  }

  private controlExecutor(): ExecutorProvider {
    return this.deps.controlExecutor ?? this.deps.executor
  }

  private controlExecutorConfig(): ExecutorConfig {
    return this.deps.controlExecutorConfig ?? this.deps.config.executor
  }

  private controlExecutorReusesTaskExecutor(): boolean {
    return this.deps.controlExecutorReusesTaskExecutor ?? true
  }

  private controlWorkspacePath(workspace: WorkspaceHandle | null): string | undefined {
    if (!this.controlExecutorReusesTaskExecutor())
      return undefined
    return workspace?.path
  }

  /** Entry point for inbound envelopes from any channel. */
  async ingest(envelope: Envelope): Promise<void> {
    const taskId = taskIdFromEnvelope(envelope)
    let taskConversationId: string | undefined
    try {
      this.deps.bus.emit('channel.inbound', { channel: envelope.channel, chatId: envelope.chatId, text: envelope.text })
      const resolved = await this.resolveConversation(envelope)
      const { conversation, sessionKey } = resolved
      taskConversationId = conversation.id
      const workspace = await this.provisionWorkspace(conversation.id)
      const userMessage = this.persistUserMessage(conversation.id, envelope, sessionKey)
      const gatewayConversationId = gatewayConversationIdFromEnvelope(envelope)
      this.deps.bus.emit('conversation.message', {
        conversationId: conversation.id,
        ...(gatewayConversationId === undefined ? {} : { gatewayConversationId }),
        messageId: userMessage.id,
        role: 'user',
      })

      // ProcessManager controls cancellation via an AbortController; its `cancel`
      // hook flips this controller, which propagates through `input.signal` to
      // the engine and triggers SIGTERM/SIGKILL on any spawned child process.
      const controller = new AbortController()
      let activityCb: (() => void) | null = null
      await this.deps.processes.run({
        group: conversation.id,
        engine: this.deps.config.executor.engine,
        class: 'interactive',
        meta: { conversationId: conversation.id, channel: envelope.channel },
        onSpawn: async () => {
          this.markTaskRunning(taskId, conversation.id)
          return {
            cancel: async () => controller.abort(),
            onActivity: (cb) => {
              activityCb = cb
              return () => {
                if (activityCb === cb)
                  activityCb = null
              }
            },
          }
        },
        job: () => this.run(conversation, envelope, workspace, controller.signal, () => activityCb?.(), resolved),
      })
    }
    catch (err) {
      this.markTaskFailed(taskId, taskConversationId, taskErrorMessage(err), isCancellationError(err))
      throw err
    }
  }

  private async run(
    conversation: ConversationState,
    envelope: Envelope,
    workspace: WorkspaceHandle | null,
    signal: AbortSignal,
    notifyActivity: () => void,
    resolved: ResolvedConversation,
  ): Promise<void> {
    const { sessionKey } = resolved
    const db = getWorkerDb()
    let activeConversation = (await this.maybeCompactConversation({
      conversation,
      sessionKey,
      workspace,
      signal,
      notifyActivity,
    })).conversation
    const model = resolveExecutorModel(this.deps.config.executor)
    const taskId = taskIdFromEnvelope(envelope)
    const gatewayConversationId = gatewayConversationIdFromEnvelope(envelope)
    const engine = this.deps.config.executor.engine
    const includeFallbackBrainSkills = !usesNativeProjectSkills(engine)
    const decisionContext = {
      channel: envelope.channel,
      conversationId: activeConversation.id,
      engine,
      ...(gatewayConversationId === undefined ? {} : { gatewayConversationId }),
      ...(model === undefined ? {} : { model }),
      sessionKey,
      ...(taskId === undefined ? {} : { taskId }),
    }
    const recentRows = this.loadPromptTranscriptRowsNewestFirst(activeConversation.id, undefined, 12).reverse()
    // TODO-013: run intent classifier in parallel with system-prompt build +
    // capability registry snapshot. Intent is the only blocking input for
    // capability planning, but `buildSystemPrompt` and `capabilityRegistry
    // .snapshot` are pure I/O reads that can pre-warm while the LLM-mode
    // classifier is still talking to the executor. Saves ~30% wall-clock on
    // `evaluator=llm` paths and is a no-op on heuristic.
    const [intentDecision, systemContext] = await Promise.all([
      this.classifyIntentDecision({
        decisionContext,
        envelope,
        model,
        notifyActivity,
        recentMessages: recentRows.map(row => ({ role: row.role, content: row.content })),
        resolved,
        signal,
        workspace,
      }),
      this.contextManager.buildSystemPrompt({
        includeBrainSkills: includeFallbackBrainSkills,
        priorSummary: activeConversation.summary ?? null,
      }),
    ])
    this.deps.bus.emit('orchestrator.intent_decision', intentDecision)
    recordIntentDecision(intentDecision)
    this.recordJournal({
      conversationId: activeConversation.id,
      kind: 'decision.intent',
      ...(taskId === undefined ? {} : { taskId }),
      payload: intentDecision as unknown as Record<string, unknown>,
    })
    const registry = await this.capabilityRegistry.snapshot({ skills: systemContext.availableSkills })
    const capabilityPlan = planCapabilities({
      intent: intentDecision.intent,
      promptSkillLimit: systemContext.promptSkillLimit,
      registry,
      requiredContext: filterRequiredContextForEngine(intentDecision.requiredContext, engine),
    })
    const loadedSkillContext = capabilityPlan.selectedBuiltins.includes('load_skill')
      ? await this.contextManager.loadSkillBodies({
          skillIds: capabilityPlan.selectedSkills.map(skill => skill.id),
        })
      : { errors: [], loaded: [] }
    const loadedMemoryContext = capabilityPlan.selectedBuiltins.includes('memory_search')
      ? await this.contextManager.searchMemories({ query: envelope.text })
      : { errors: [], loaded: [] }
    const capabilityDecision = buildPromptCapabilityDecision({
      ...decisionContext,
      ...capabilityPlan,
      loadedMemoryCount: loadedMemoryContext.loaded.length,
      loadedMemoryIds: loadedMemoryContext.loaded.map(memory => memory.id),
      loadedSkillCount: loadedSkillContext.loaded.length,
      loadedSkillIds: loadedSkillContext.loaded.map(skill => skill.id),
      memorySearchErrors: loadedMemoryContext.errors,
      mode: loadedSkillContext.loaded.length > 0 || loadedMemoryContext.loaded.length > 0 ? 'enforced' : 'observe_only',
      skillLoadErrors: loadedSkillContext.errors,
    })
    this.deps.bus.emit('orchestrator.capability_decision', capabilityDecision)
    this.recordJournal({
      conversationId: activeConversation.id,
      kind: 'decision.capability',
      ...(taskId === undefined ? {} : { taskId }),
      payload: capabilityDecision as unknown as Record<string, unknown>,
    })
    let systemPrompt = appendLoadedBrainMemories(
      appendLoadedBrainSkillBodies(systemContext.systemPrompt, loadedSkillContext.loaded),
      loadedMemoryContext.loaded,
    )
    let chatMessages = await this.buildRunContext(activeConversation.id, systemPrompt)
    touchSessionEntry(sessionKey, { contextTokens: estimateChatMessagesTokens(chatMessages) })
    const admissionCountBefore = this.countAdmissionProposals()

    let runInput = this.buildAgentRunInput({
      messages: chatMessages,
      model,
      workspace,
      signal,
      sessionKey,
      engine,
    })
    let result = await this.collectAssistantText(runInput, activeConversation.id, taskId, notifyActivity, sessionKey, gatewayConversationId)
    if (!result.ok && result.staleBindingCleared === true && runInput.engineBinding !== undefined && result.text.length === 0) {
      runInput = this.buildAgentRunInput({
        messages: chatMessages,
        model,
        workspace,
        signal,
        sessionKey,
        engine,
      })
      result = await this.collectAssistantText(runInput, activeConversation.id, taskId, notifyActivity, sessionKey, gatewayConversationId)
    }
    if (!result.ok && this.isContextOverflowError(result.error)) {
      const retryCompaction = await this.maybeCompactConversation({
        conversation: activeConversation,
        sessionKey,
        workspace,
        signal,
        notifyActivity,
        force: true,
      })
      if (retryCompaction.compacted) {
        activeConversation = retryCompaction.conversation
        systemPrompt = appendLoadedBrainSkillBodies(
          (await this.contextManager.buildSystemPrompt({
            includeBrainSkills: includeFallbackBrainSkills,
            priorSummary: activeConversation.summary ?? null,
          })).systemPrompt,
          loadedSkillContext.loaded,
        )
        systemPrompt = appendLoadedBrainMemories(systemPrompt, loadedMemoryContext.loaded)
        chatMessages = await this.buildRunContext(activeConversation.id, systemPrompt)
        touchSessionEntry(sessionKey, { contextTokens: estimateChatMessagesTokens(chatMessages) })
        runInput = this.buildAgentRunInput({
          messages: chatMessages,
          model,
          workspace,
          signal,
          sessionKey,
          engine,
        })
        result = await this.collectAssistantText(runInput, activeConversation.id, taskId, notifyActivity, sessionKey, gatewayConversationId)
        if (!result.ok && result.staleBindingCleared === true && runInput.engineBinding !== undefined && result.text.length === 0) {
          runInput = this.buildAgentRunInput({
            messages: chatMessages,
            model,
            workspace,
            signal,
            sessionKey,
            engine,
          })
          result = await this.collectAssistantText(runInput, activeConversation.id, taskId, notifyActivity, sessionKey, gatewayConversationId)
        }
      }
    }
    if (!result.ok) {
      const error = result.error ?? 'executor error'
      consola.warn(`[orchestrator] executor error: ${error}`)
      this.markTaskFailed(taskId, activeConversation.id, error, signal.aborted)
      this.deps.bus.emit('orchestrator.error', {
        conversationId: activeConversation.id,
        ...(gatewayConversationId === undefined ? {} : { gatewayConversationId }),
        ...(taskId === undefined ? {} : { taskId }),
        error,
      })
      return
    }

    let assistantText = result.text
    this.detectAdmissionBypass({
      admissionCountBefore,
      assistantText,
      conversationId: activeConversation.id,
      engine,
      gatewayConversationId,
      sessionKey,
      taskId,
    })
    const gateConfig = this.deps.config.orchestrator?.decisionPipeline?.qualityGate
    const qualityGate = await evaluateQualityGate({
      assistantText,
      capabilityDecision,
      context: {
        ...decisionContext,
        conversationId: activeConversation.id,
      },
      evaluator: gateConfig?.evaluator ?? 'heuristic',
      executor: this.controlExecutor(),
      intentDecision,
      mode: gateConfig?.mode ?? 'observe',
      model: resolveExecutorModel(this.controlExecutorConfig()),
      notifyActivity,
      requestText: envelope.text,
      signal,
      threshold: gateConfig?.threshold,
      workspacePath: this.controlWorkspacePath(workspace),
      ...(gateConfig?.budgetMs === undefined ? {} : { budgetMs: gateConfig.budgetMs }),
    })
    this.deps.bus.emit('orchestrator.quality_gate', qualityGate)
    recordQualityGate(qualityGate)
    this.recordJournal({
      conversationId: activeConversation.id,
      kind: 'gate.quality',
      ...(taskId === undefined ? {} : { taskId }),
      payload: qualityGate as unknown as Record<string, unknown>,
    })
    if (gateConfig?.evaluator === 'llm') {
      const review = await reviewTaskWithBrainEngine({
        authorityMode: describeExecutorAuthority(this.deps.config).authorityMode,
        evidenceRefs: [
          `conversations:${activeConversation.id}`,
          ...(taskId === undefined ? [] : [`agent_tasks:${taskId}`]),
        ],
        executor: this.controlExecutor(),
        finalOutput: assistantText,
        hardInvariantSignals: describeExecutorAuthority(this.deps.config).authorityMode === 'unmanaged_ambient'
          ? ['executor authority is unmanaged ambient']
          : [],
        journalSummary: [
          `intent=${intentDecision.intent}; risk=${intentDecision.risk}; profile=${intentDecision.qualityProfile}`,
          `qualityGate action=${qualityGate.action}; score=${qualityGate.score ?? 'n/a'}; mode=${qualityGate.mode}; reason=${qualityGate.reason}`,
          `capability selectedSkills=${capabilityDecision.selectedSkills.length}; selectedMcpTools=${capabilityDecision.selectedMcpTools.length}`,
        ],
        model: resolveExecutorModel(this.controlExecutorConfig()),
        notifyActivity,
        scopeRubric: `${intentDecision.qualityProfile} / ${intentDecision.risk}`,
        signal,
        taskGoal: envelope.text,
        workspacePath: this.controlWorkspacePath(workspace),
        ...(gateConfig.budgetMs === undefined ? {} : { budgetMs: gateConfig.budgetMs }),
      })
      this.recordJournal({
        conversationId: activeConversation.id,
        kind: 'brain_engine.review',
        ...(taskId === undefined ? {} : { taskId }),
        payload: review as unknown as Record<string, unknown>,
      })
    }
    if (qualityGate.action === 'repair' && gateConfig?.mode === 'retry') {
      const repaired = await this.runSuppressedExecutor({
        messages: buildRepairPrompt({ assistantText, gate: qualityGate, requestText: envelope.text }),
        workspace,
        signal,
        notifyActivity,
      }).catch(err => `Quality repair failed: ${String(err)}`)
      this.deps.bus.emit('orchestrator.repair_attempted', {
        conversationId: activeConversation.id,
        ...(gatewayConversationId === undefined ? {} : { gatewayConversationId }),
        ...(taskId === undefined ? {} : { taskId }),
        originalLength: assistantText.length,
        repairedLength: repaired.length,
        status: repaired.startsWith('Quality repair failed:') ? 'failed' : 'succeeded',
      })
      this.recordJournal({
        conversationId: activeConversation.id,
        kind: 'repair.attempted',
        ...(taskId === undefined ? {} : { taskId }),
        payload: {
          originalLength: assistantText.length,
          repairedLength: repaired.length,
          status: repaired.startsWith('Quality repair failed:') ? 'failed' : 'succeeded',
        },
      })
      if (!repaired.startsWith('Quality repair failed:') && repaired.trim().length > 0)
        assistantText = repaired.trim()
    }
    else if (qualityGate.action === 'block' && gateConfig?.mode === 'block') {
      this.recordJournal({
        conversationId: activeConversation.id,
        kind: 'task.held',
        ...(taskId === undefined ? {} : { taskId }),
        payload: {
          action: 'hold',
          reason: qualityGate.reason,
          source: 'quality-gate',
        },
      })
      assistantText = 'The response was blocked by the worker quality gate.'
    }
    else if (qualityGate.action === 'warn' && gateConfig?.mode === 'warn') {
      assistantText = [
        assistantText,
        '',
        `Quality gate warning: ${qualityGate.reason}`,
      ].join('\n')
    }
    const now = new Date().toISOString()
    const inserted = db.insert(messages).values({
      conversationId: activeConversation.id,
      role: 'assistant',
      content: assistantText,
      createdAt: now,
    }).returning({ id: messages.id }).all()
    db.update(conversations).set({ lastActiveAt: now }).where(eq(conversations.id, activeConversation.id)).run()
    touchSessionEntry(sessionKey, { at: now })
    const assistantMessageId = inserted[0]?.id
    this.recordJournal({
      conversationId: activeConversation.id,
      kind: 'assistant.message',
      ...(taskId === undefined ? {} : { taskId }),
      payload: {
        assistantTextLength: assistantText.length,
        ...(assistantMessageId === undefined ? {} : { assistantMessageId }),
      },
    })
    this.markTaskSucceeded(taskId, activeConversation.id, {
      conversationId: activeConversation.id,
      assistantTextLength: assistantText.length,
      ...(assistantMessageId === undefined ? {} : { assistantMessageId }),
    })
    this.deps.bus.emit('orchestrator.finished', {
      conversationId: activeConversation.id,
      ...(gatewayConversationId === undefined ? {} : { gatewayConversationId }),
      ...(taskId === undefined ? {} : { taskId }),
    })

    await this.deliver(envelope.channel, activeConversation, assistantText)
  }

  private async collectAssistantText(
    runInput: Parameters<ExecutorProvider['run']>[0],
    conversationId: string,
    taskId: string | undefined,
    notifyActivity: () => void,
    sessionKey: string,
    gatewayConversationId: string | undefined,
  ): Promise<ExecutorTextResult> {
    let assistantText = ''
    let staleBindingCleared = false
    // BUG-063: dead-loop detector. Reads `orchestrator.deadLoop` worker
    // config; defaults enabled with threshold 8. Aborts the iteration when
    // the LLM emits >threshold sequential tool_calls without any text
    // delta — the brute-force-explore signature observed in the
    // qa-2026-05-04-v0.7.0 dev-Soul finding.
    const deadLoop = deadLoopDetectorFromConfig(this.deps.config.orchestrator?.deadLoop)
    try {
      for await (const event of this.deps.executor.run(runInput)) {
        // Each AgentEvent counts as a stdout heartbeat for ProcessManager
        // stall detection — keeps a chatty agent alive and lets a silent one
        // get reaped after stallTimeoutMs.
        notifyActivity()
        if (event.type === 'assistant_message_delta') {
          assistantText += event.delta
          deadLoop.recordTextDelta()
          this.deps.bus.emit('orchestrator.text', {
            conversationId,
            ...(gatewayConversationId === undefined ? {} : { gatewayConversationId }),
            ...(taskId === undefined ? {} : { taskId }),
            delta: event.delta,
          })
        }
        else if (event.type === 'tool_use') {
          this.deps.bus.emit('orchestrator.tool_call', {
            conversationId,
            ...(gatewayConversationId === undefined ? {} : { gatewayConversationId }),
            ...(taskId === undefined ? {} : { taskId }),
            call: { id: event.id, name: event.name, arguments: event.arguments },
          })
          this.recordJournal({
            conversationId,
            kind: 'tool.use',
            ...(taskId === undefined ? {} : { taskId }),
            payload: {
              action: event.action,
              arguments: event.arguments,
              id: event.id,
              name: event.name,
              ...(event.status === undefined ? {} : { status: event.status }),
            },
          })
          if (isTerminalToolStatus(event.status)) {
            deadLoop.recordToolProgress()
          }
          else if (deadLoop.recordToolCall()) {
            const reason = `dead-loop-suspected:tool_call=${deadLoop.count()},no_text_delta`
            this.deps.bus.emit('orchestrator.aborted', {
              conversationId,
              ...(gatewayConversationId === undefined ? {} : { gatewayConversationId }),
              ...(taskId === undefined ? {} : { taskId }),
              reason,
            })
            consola.warn(`[orchestrator] aborted run: ${reason}`)
            return { ok: false, text: assistantText, error: reason, staleBindingCleared }
          }
        }
        else if (event.type === 'tool_result') {
          deadLoop.recordToolProgress()
          this.deps.bus.emit('orchestrator.tool_result', {
            conversationId,
            ...(gatewayConversationId === undefined ? {} : { gatewayConversationId }),
            ...(taskId === undefined ? {} : { taskId }),
            result: {
              id: event.id,
              name: event.name,
              isError: event.isError === true,
            },
          })
          this.recordJournal({
            conversationId,
            kind: 'tool.result',
            ...(taskId === undefined ? {} : { taskId }),
            payload: {
              contentLength: event.content.length,
              id: event.id,
              isError: event.isError === true,
              name: event.name,
            },
          })
        }
        else if (event.type === 'engine_binding') {
          if (event.engine === this.deps.config.executor.engine) {
            updateSessionEngineBinding(sessionKey, event.engine, event.binding)
            if (event.binding === null)
              staleBindingCleared = true
          }
          this.recordJournal({
            conversationId,
            kind: 'executor.binding',
            ...(taskId === undefined ? {} : { taskId }),
            payload: {
              bindingPresent: event.binding !== null,
              engine: event.engine,
            },
          })
        }
        else if (event.type === 'permission_request') {
          this.recordJournal({
            conversationId,
            kind: 'executor.permission_request',
            ...(taskId === undefined ? {} : { taskId }),
            payload: {
              id: event.id,
              reason: event.reason,
              ...(event.toolUseId === undefined ? {} : { toolUseId: event.toolUseId }),
            },
          })
        }
        else if (event.type === 'token_usage') {
          this.recordJournal({
            conversationId,
            kind: 'executor.token_usage',
            ...(taskId === undefined ? {} : { taskId }),
            payload: { usage: event.usage },
          })
        }
        else if (event.type === 'finish') {
          this.recordJournal({
            conversationId,
            kind: 'executor.finish',
            ...(taskId === undefined ? {} : { taskId }),
            payload: {
              reason: event.reason,
              ...(event.usage === undefined ? {} : { usage: event.usage }),
            },
          })
        }
        else if (event.type === 'error') {
          this.recordJournal({
            conversationId,
            kind: 'executor.error',
            ...(taskId === undefined ? {} : { taskId }),
            payload: { error: event.error },
          })
          return { ok: false, text: assistantText, error: event.error, staleBindingCleared }
        }
      }
      return { ok: true, text: assistantText }
    }
    catch (err) {
      consola.error(`[orchestrator] run failed: ${String(err)}`)
      return { ok: false, text: assistantText, error: String(err), staleBindingCleared }
    }
  }

  private countAdmissionProposals(): number {
    try {
      return new BrainAdmissionService().count()
    }
    catch {
      return -1
    }
  }

  private detectAdmissionBypass(input: {
    admissionCountBefore: number
    assistantText: string
    conversationId: string
    engine: string
    gatewayConversationId: string | undefined
    sessionKey: string
    taskId: string | undefined
  }): void {
    if (input.admissionCountBefore < 0)
      return
    const admissionCountAfter = this.countAdmissionProposals()
    if (admissionCountAfter > input.admissionCountBefore)
      return
    const claim = detectAdmissionSuccessClaimDetails(input.assistantText)
    if (claim === null)
      return
    const at = new Date().toISOString()
    recordBrainGovernanceBypassWarning({
      at,
      conversationId: input.conversationId,
      engine: input.engine,
      claimExcerpt: claim.claimExcerpt,
      reason: claim.reason,
      sessionKey: input.sessionKey,
    })
    this.deps.bus.emit('brain.governance.bypass_suspected', {
      at,
      conversationId: input.conversationId,
      engine: input.engine,
      ...(input.gatewayConversationId === undefined ? {} : { gatewayConversationId: input.gatewayConversationId }),
      claimExcerpt: claim.claimExcerpt,
      heuristic: true,
      ...(input.taskId === undefined ? {} : { taskId: input.taskId }),
      reason: claim.reason,
    })
    this.recordJournal({
      conversationId: input.conversationId,
      kind: 'admission.bypass_suspected',
      ...(input.taskId === undefined ? {} : { taskId: input.taskId }),
      payload: {
        at,
        claimExcerpt: claim.claimExcerpt,
        engine: input.engine,
        heuristic: true,
        reason: claim.reason,
      },
    })
  }

  private async classifyIntentDecision(input: {
    decisionContext: DecisionContext
    envelope: Envelope
    model: string | undefined
    notifyActivity: () => void
    recentMessages: Array<{ role: string, content: string }>
    resolved: ResolvedConversation
    signal: AbortSignal
    workspace: WorkspaceHandle | null
  }) {
    const classification = {
      envelopeText: input.envelope.text,
      priorSummary: input.resolved.conversation.summary ?? null,
      recentMessages: input.recentMessages,
      sessionAction: input.resolved.sessionAction,
      sessionReason: input.resolved.sessionReason,
    }
    const evaluator = this.deps.config.orchestrator?.decisionPipeline?.intentClassifier?.evaluator ?? 'heuristic'
    if (evaluator === 'llm') {
      return classifyIntentWithExecutor({
        classification,
        context: input.decisionContext,
        executor: this.controlExecutor(),
        model: resolveExecutorModel(this.controlExecutorConfig()),
        notifyActivity: input.notifyActivity,
        signal: input.signal,
        workspacePath: this.controlWorkspacePath(input.workspace),
      })
    }
    return classifyIntentHeuristic(input.decisionContext, classification)
  }

  private buildAgentRunInput(input: {
    messages: ChatMessage[]
    model: string | undefined
    workspace: WorkspaceHandle | null
    signal: AbortSignal
    sessionKey: string
    engine: string
  }): AgentRunInput {
    const binding = this.loadEngineBinding(input.sessionKey, input.engine)
    return {
      messages: input.messages,
      ...(input.model ? { model: input.model } : {}),
      ...(input.workspace ? { workspacePath: input.workspace.path } : {}),
      signal: input.signal,
      ...(binding === undefined ? {} : { engineBinding: binding }),
    }
  }

  private loadEngineBinding(sessionKey: string, engine: string): EngineSessionBinding | undefined {
    const binding = getSessionEntry(sessionKey)?.engineBindings[engine]
    return isEngineSessionBinding(binding) ? binding : undefined
  }

  private async deliver(channel: ChannelType, conversation: ConversationState, text: string) {
    const binding = this.deps.config.channels.find(c => c.channel === channel && c.enabled)
    if (!binding)
      return
    const adapter = getChannelAdapter(channel)
    try {
      await adapter.send(binding, {
        channel,
        chatId: conversation.chatId,
        ...(conversation.threadId === undefined ? {} : { threadId: conversation.threadId }),
        text,
      })
    }
    catch (err) {
      consola.warn(`[orchestrator] deliver to ${channel} failed: ${String(err)}`)
    }
  }

  private async resolveConversation(envelope: Envelope): Promise<ResolvedConversation> {
    const sessionKey = resolveSessionKey(envelope)
    const sessionConversation = await findSessionConversation(sessionKey)
    const routeHasSessionEntry = sessionConversation ? true : await hasSessionEntryForRoute(envelope)
    const legacyConversation = routeHasSessionEntry ? null : await findOpenConversation(envelope)
    const existing = sessionConversation ?? legacyConversation
    if (!existing) {
      const conversation = this.createConversation(envelope)
      this.upsertSession(sessionKey, envelope, conversation.id)
      return { conversation, sessionAction: 'new_topic', sessionReason: 'no-existing-conversation', sessionKey }
    }

    if (legacyConversation)
      this.upsertSession(sessionKey, envelope, existing.id)

    if (isGatewaySessionReset(envelope)) {
      this.closeConversation(existing)
      const conversation = this.createConversation(envelope)
      this.rotateSession(sessionKey, envelope, conversation.id, gatewayResetReason(envelope))
      return { conversation, sessionAction: 'reset_requested', sessionReason: 'gateway-reset', sessionKey }
    }

    if (isWorkerAdminContinuation(envelope, existing.id))
      return { conversation: rowToState(existing), sessionAction: 'continue', sessionReason: 'worker-admin-selected-conversation', sessionKey }

    if (sessionConversation && this.deps.config.executor.engine === 'codex')
      return { conversation: rowToState(existing), sessionAction: 'continue', sessionReason: 'codex-chat-id-continuity', sessionKey }

    const existingWorkspace = await this.provisionWorkspace(existing.id)
    const recent = await loadRecentMessages(existing.id)
    const model = resolveExecutorModel(this.controlExecutorConfig())
    const decision = await classifyContinuation(
      this.controlExecutor(),
      model,
      existing.summary ?? null,
      recent,
      envelope.text,
      this.controlWorkspacePath(existingWorkspace),
      this.deps.config.executor.engine,
    )
    this.deps.bus.emit('conversation.classifier', { conversationId: existing.id, decision })
    recordConversationClassifier(decision)
    if (decision.continue)
      return { conversation: rowToState(existing), sessionAction: 'continue', sessionReason: decision.reason, sessionKey }

    this.closeConversation(existing)
    const conversation = this.createConversation(envelope)
    this.rotateSession(sessionKey, envelope, conversation.id, 'classifier:new-topic')
    return { conversation, sessionAction: 'new_topic', sessionReason: decision.reason || 'classifier:new-topic', sessionKey }
  }

  private closeConversation(existing: ConversationRow): void {
    const db = getWorkerDb()
    const closedAt = new Date().toISOString()
    db.update(conversations).set({ status: 'closed', closedAt }).where(eq(conversations.id, existing.id)).run()
    // Defer workspace dispose behind the same group key so any in-flight run
    // for the closed conversation completes before the directory (or git
    // worktree) goes away. ProcessManager guarantees per-group FIFO, so
    // background-class dispose still queues after pending interactive runs.
    const closedId = existing.id
    void this.deps.processes.run({
      group: closedId,
      engine: this.deps.config.executor.engine,
      class: 'background',
      meta: { conversationId: closedId, kind: 'workspace.dispose' },
      onSpawn: async () => ({
        cancel: async () => {},
        onActivity: () => () => {},
      }),
      job: () => this.disposeWorkspace(closedId),
    }).catch(err => consola.warn(`[orchestrator] dispose workspace job failed: ${String(err)}`))
  }

  /**
   * Create (or return existing) workspace for a conversation. `null` is
   * returned when provisioning fails so the caller can still proceed with
   * executors that don't require a workspace (http / mcp).
   */
  private async provisionWorkspace(conversationId: string): Promise<WorkspaceHandle | null> {
    try {
      return await this.deps.workspaces.createWorkspace(conversationId)
    }
    catch (err) {
      consola.warn(`[orchestrator] workspace create failed for ${conversationId}: ${String(err)}`)
      return null
    }
  }

  private async disposeWorkspace(conversationId: string): Promise<void> {
    try {
      await this.deps.workspaces.disposeWorkspace(conversationId)
    }
    catch (err) {
      consola.warn(`[orchestrator] workspace dispose failed for ${conversationId}: ${String(err)}`)
    }
  }

  private createConversation(envelope: Envelope): ConversationState {
    const db = getWorkerDb()
    const id = crypto.randomUUID()
    const now = new Date().toISOString()
    const taskId = taskIdFromEnvelope(envelope)
    const persistedTaskId = this.persistedAgentTaskId(taskId)
    db.insert(conversations).values({
      id,
      ...(persistedTaskId === undefined ? {} : { taskId: persistedTaskId }),
      channel: envelope.channel,
      chatId: envelope.chatId,
      ...(envelope.threadId === undefined ? {} : { threadId: envelope.threadId }),
      status: 'open',
      startedAt: now,
      lastActiveAt: now,
    }).run()
    const rowRaw = db.select().from(conversations).where(eq(conversations.id, id)).get()!
    this.deps.bus.emit('conversation.created', {
      conversationId: id,
      channel: envelope.channel,
      chatId: envelope.chatId,
      ...(taskId === undefined ? {} : { taskId }),
    })
    this.recordJournal({
      conversationId: id,
      kind: 'conversation.created',
      ...(taskId === undefined ? {} : { taskId }),
      payload: {
        channel: envelope.channel,
        chatId: envelope.chatId,
        ...(envelope.threadId === undefined ? {} : { threadId: envelope.threadId }),
      },
    })
    return rowToState(rowRaw)
  }

  private persistedAgentTaskId(taskId: string | undefined): string | undefined {
    if (taskId === undefined)
      return undefined
    const row = getWorkerDb().select({ id: agentTasks.id }).from(agentTasks).where(eq(agentTasks.id, taskId)).get()
    return row?.id
  }

  private markTaskRunning(taskId: string | undefined, conversationId: string): void {
    if (taskId === undefined)
      return
    getWorkerDb().update(agentTasks).set({
      status: 'running',
      conversationId,
      finishedAt: null,
      result: null,
      error: null,
    }).where(eq(agentTasks.id, taskId)).run()
    this.recordJournal({
      conversationId,
      kind: 'task.running',
      taskId,
      payload: {
        executorEngine: this.deps.config.executor.engine,
        executorVariant: this.deps.config.executor.variant,
      },
    })
  }

  private markTaskSucceeded(taskId: string | undefined, conversationId: string, result: Record<string, unknown>): void {
    if (taskId === undefined)
      return
    getWorkerDb().update(agentTasks).set({
      status: 'succeeded',
      conversationId,
      finishedAt: new Date().toISOString(),
      result,
      error: null,
    }).where(eq(agentTasks.id, taskId)).run()
    this.recordJournal({
      conversationId,
      kind: 'task.succeeded',
      taskId,
      payload: result,
    })
  }

  private markTaskFailed(taskId: string | undefined, conversationId: string | undefined, error: string, cancelled = false): void {
    if (taskId === undefined)
      return
    const status: 'failed' | 'cancelled' = cancelled ? 'cancelled' : 'failed'
    getWorkerDb().update(agentTasks).set({
      status,
      ...(conversationId === undefined ? {} : { conversationId }),
      finishedAt: new Date().toISOString(),
      result: null,
      error: redactTaskError(error),
    }).where(eq(agentTasks.id, taskId)).run()
    this.recordJournal({
      ...(conversationId === undefined ? {} : { conversationId }),
      kind: 'task.failed',
      taskId,
      payload: {
        cancelled,
        error: redactTaskError(error),
        status,
      },
    })
  }

  private upsertSession(sessionKey: string, envelope: Envelope, conversationId: string): void {
    upsertSessionEntry({
      sessionKey,
      currentConversationId: conversationId,
      channel: envelope.channel,
      chatId: envelope.chatId,
      ...(envelope.threadId === undefined ? {} : { threadId: envelope.threadId }),
      accountId: envelope.accountId,
    })
  }

  private rotateSession(sessionKey: string, envelope: Envelope, conversationId: string, resetReason: string): void {
    const rotated = rotateSessionConversation({
      sessionKey,
      currentConversationId: conversationId,
      resetReason,
    })
    if (!rotated)
      this.upsertSession(sessionKey, envelope, conversationId)
  }

  private persistUserMessage(conversationId: string, envelope: Envelope, sessionKey: string) {
    const db = getWorkerDb()
    const now = new Date().toISOString()
    const richMetadata = envelope.richMetadata ? JSON.stringify(envelope.richMetadata) : null
    const res = db.insert(messages).values({
      conversationId,
      role: 'user',
      content: envelope.text,
      ...(richMetadata === null ? {} : { richMetadata }),
      createdAt: now,
    }).returning({ id: messages.id }).all()
    db.update(conversations).set({ lastActiveAt: now }).where(eq(conversations.id, conversationId)).run()
    touchSessionEntry(sessionKey, { at: now })
    this.recordJournal({
      conversationId,
      kind: 'user.message',
      ...(taskIdFromEnvelope(envelope) === undefined ? {} : { taskId: taskIdFromEnvelope(envelope) }),
      payload: {
        channel: envelope.channel,
        contentLength: envelope.text.length,
        messageId: res[0]?.id ?? -1,
      },
    })
    return { id: res[0]?.id ?? -1 }
  }

  private async maybeCompactConversation(input: {
    conversation: ConversationState
    sessionKey: string
    workspace: WorkspaceHandle | null
    signal: AbortSignal
    notifyActivity: () => void
    force?: boolean
  }): Promise<CompactionOutcome> {
    const compaction = this.deps.config.orchestrator?.compaction
    if (compaction?.enabled !== true)
      return { conversation: input.conversation, compacted: false }

    const budget = resolveContextBudget(this.deps.config.orchestrator, this.deps.config.executor)
    if (!budget)
      return { conversation: input.conversation, compacted: false }

    const checkpoint = this.loadLatestCompactionCheckpoint(input.conversation.id)
    const rows = this.loadPromptTranscriptRows(input.conversation.id, checkpoint?.compactedThroughMessageId)
    if (rows.length <= 1)
      return { conversation: input.conversation, compacted: false }

    const systemPrompt = (await this.contextManager.buildSystemPrompt({
      includeBrainSkills: !usesNativeProjectSkills(this.deps.config.executor.engine),
      priorSummary: input.conversation.summary ?? null,
    })).systemPrompt
    const systemTokens = estimateChatMessageTokens({ role: 'system', content: systemPrompt })
    const currentTokens = systemTokens
      + rows.reduce((sum, row) => sum + estimateChatMessageTokens(rowToChatMessage(row)), 0)
    const triggerTokens = compaction.triggerTokens ?? Math.max(0, budget.contextWindowTokens - budget.reserveTokens)
    if (!input.force && currentTokens <= triggerTokens)
      return { conversation: input.conversation, compacted: false }

    const recentTokenBudget = Math.min(budget.keepRecentTokens, Math.max(0, triggerTokens - systemTokens))
    const { candidateRows } = splitRowsForCompaction(rows, recentTokenBudget)
    if (candidateRows.length === 0)
      return { conversation: input.conversation, compacted: false }

    const fromId = candidateRows[0]!.id
    const throughId = candidateRows[candidateRows.length - 1]!.id
    const memoryFlush = await this.runPreCompactionMemoryFlush({
      conversationId: input.conversation.id,
      previousSummary: input.conversation.summary ?? null,
      rows: candidateRows,
      compaction,
      workspace: input.workspace,
      signal: input.signal,
      notifyActivity: input.notifyActivity,
      fromId,
      throughId,
    })

    let summary: string
    try {
      summary = await this.generateCompactionSummary({
        previousSummary: input.conversation.summary ?? null,
        rows: candidateRows,
        compaction,
        workspace: input.workspace,
        signal: input.signal,
        notifyActivity: input.notifyActivity,
      })
    }
    catch (err) {
      consola.warn(`[orchestrator] compaction summary failed: ${String(err)}`)
      return { conversation: input.conversation, compacted: false }
    }

    const now = new Date().toISOString()
    const db = getWorkerDb()
    db.insert(messages).values({
      conversationId: input.conversation.id,
      role: 'system',
      content: summary,
      richMetadata: JSON.stringify({
        kind: 'compaction',
        version: TRANSCRIPT_METADATA_VERSION,
        compactedFromMessageId: fromId,
        compactedThroughMessageId: throughId,
        sourceMessageCount: candidateRows.length,
        previousCompactionMessageId: checkpoint?.messageId ?? null,
        memoryFlush: memoryFlush.attempted
          ? {
              status: memoryFlush.status,
              at: memoryFlush.at,
              ...(memoryFlush.proposalId === undefined ? {} : { proposalId: memoryFlush.proposalId }),
              ...(memoryFlush.error === undefined ? {} : { error: memoryFlush.error }),
            }
          : { status: 'disabled' },
      }),
      createdAt: now,
    }).run()
    db.update(conversations).set({
      summary,
      lastActiveAt: now,
    }).where(eq(conversations.id, input.conversation.id)).run()
    recordSessionCompaction(input.sessionKey, {
      at: now,
      ...(memoryFlush.attempted && memoryFlush.at !== undefined ? { memoryFlushAt: memoryFlush.at } : {}),
    })

    const row = db.select().from(conversations).where(eq(conversations.id, input.conversation.id)).get()
    return {
      conversation: row ? rowToState(row) : { ...input.conversation, summary, lastActiveAt: now },
      compacted: true,
    }
  }

  private async runPreCompactionMemoryFlush(input: {
    conversationId: string
    previousSummary: string | null
    rows: TranscriptRow[]
    compaction: OrchestratorCompactionConfig
    workspace: WorkspaceHandle | null
    signal: AbortSignal
    notifyActivity: () => void
    fromId: number
    throughId: number
  }): Promise<MemoryFlushResult> {
    if (input.compaction.memoryFlush?.enabled !== true)
      return { attempted: false }

    const at = new Date().toISOString()
    const baseMetadata = {
      kind: 'memory-flush',
      version: TRANSCRIPT_METADATA_VERSION,
      compactedFromMessageId: input.fromId,
      compactedThroughMessageId: input.throughId,
    }

    try {
      const content = await this.runSuppressedExecutor({
        messages: buildMemoryFlushPrompt(input.previousSummary, input.rows, input.compaction),
        workspace: input.workspace,
        signal: input.signal,
        notifyActivity: input.notifyActivity,
      })
      const trimmed = content.trim()
      if (trimmed.length === 0 || /^none\.?$/i.test(trimmed)) {
        this.persistAuditMessage(input.conversationId, 'No durable memory changes requested by pre-compaction flush.', {
          ...baseMetadata,
          status: 'empty',
        }, at)
        return { attempted: true, at, status: 'empty' }
      }

      const proposal = this.proposePreCompactionMemory({
        at,
        content: trimmed,
        conversationId: input.conversationId,
        fromId: input.fromId,
        throughId: input.throughId,
      })
      this.persistAuditMessage(input.conversationId, `Pending Brain admission proposal created: ${proposal.id}`, {
        ...baseMetadata,
        proposalId: proposal.id,
        status: 'proposed',
      }, at)
      return { attempted: true, at, proposalId: proposal.id, status: 'proposed' }
    }
    catch (err) {
      if ((err as { code?: string }).code === 'duplicate-id') {
        const proposalId = preCompactionAdmissionId(input.conversationId, input.throughId)
        this.persistAuditMessage(input.conversationId, `Pending Brain admission proposal already exists: ${proposalId}`, {
          ...baseMetadata,
          proposalId,
          status: 'already-proposed',
        }, at)
        return { attempted: true, at, proposalId, status: 'already-proposed' }
      }
      const error = String(err)
      consola.warn(`[orchestrator] pre-compaction memory flush failed: ${error}`)
      this.persistAuditMessage(input.conversationId, error, {
        ...baseMetadata,
        status: 'failed',
        error,
      }, at)
      return { attempted: true, at, status: 'failed', error }
    }
  }

  private proposePreCompactionMemory(input: {
    at: string
    content: string
    conversationId: string
    fromId: number
    throughId: number
  }): BrainAdmissionProposal {
    const proposalId = preCompactionAdmissionId(input.conversationId, input.throughId)
    const topic = proposalId
    const payload = brainAdmissionMemoryAddPayloadSchema.parse({
      body: input.content,
      indexEntry: `- [Pre-compaction memory ${input.throughId}](${topic}.md) - Proposed by AIWorker compaction admission.`,
      topic,
    })
    return new BrainAdmissionService().propose({
      confidence: 0.6,
      evidence: [
        {
          at: input.at,
          kind: 'conversation',
          ref: input.conversationId,
          summary: 'Pre-compaction memory flush source conversation.',
        },
        {
          at: input.at,
          kind: 'message',
          ref: `${input.conversationId}:${input.fromId}-${input.throughId}`,
          summary: 'Transcript range compacted before this memory proposal.',
        },
      ],
      id: proposalId,
      kind: 'memory-add',
      payload,
      risk: 'medium',
      rollback: `Reject ${proposalId} before apply, or remove memories/${topic}.md and its MEMORY.md index entry after apply.`,
      soulId: 'general-assistant',
      summary: `Pre-compaction memory proposal for conversation ${input.conversationId}.`,
      target: `memories/${topic}`,
    }, input.at)
  }

  private async generateCompactionSummary(input: {
    previousSummary: string | null
    rows: TranscriptRow[]
    compaction: OrchestratorCompactionConfig
    workspace: WorkspaceHandle | null
    signal: AbortSignal
    notifyActivity: () => void
  }): Promise<string> {
    const generated = await this.runSuppressedExecutor({
      messages: buildCompactionPrompt(input.previousSummary, input.rows, input.compaction),
      workspace: input.workspace,
      signal: input.signal,
      notifyActivity: input.notifyActivity,
    })
    const trimmed = generated.trim()
    if (trimmed.length > 0)
      return trimmed

    return fallbackCompactionSummary(input.previousSummary, input.rows)
  }

  private async runSuppressedExecutor(input: {
    messages: ChatMessage[]
    workspace: WorkspaceHandle | null
    signal: AbortSignal
    notifyActivity: () => void
  }): Promise<string> {
    const model = resolveExecutorModel(this.controlExecutorConfig())
    const workspacePath = this.controlWorkspacePath(input.workspace)
    let text = ''
    for await (const event of this.controlExecutor().run({
      messages: input.messages,
      ...(model ? { model } : {}),
      ...(workspacePath ? { workspacePath } : {}),
      signal: input.signal,
      temperature: 0,
      tools: [],
    })) {
      input.notifyActivity()
      if (event.type === 'assistant_message_delta')
        text += event.delta
      else if (event.type === 'error')
        throw new Error(event.error)
    }
    return text
  }

  private persistAuditMessage(conversationId: string, content: string, metadata: Record<string, unknown>, at: string): void {
    getWorkerDb().insert(messages).values({
      conversationId,
      role: 'system',
      content,
      richMetadata: JSON.stringify(metadata),
      createdAt: at,
    }).run()
  }

  private loadLatestCompactionCheckpoint(conversationId: string): CompactionCheckpoint | null {
    const db = getWorkerDb()
    const rows = db.select({
      id: messages.id,
      role: messages.role,
      richMetadata: messages.richMetadata,
    }).from(messages).where(and(eq(messages.conversationId, conversationId), eq(messages.role, 'system'))).orderBy(desc(messages.id)).all()

    for (const row of rows) {
      const metadata = parseTranscriptMetadata(row)
      if (metadata?.kind !== 'compaction')
        continue
      const compactedThroughMessageId = positiveNumber(metadata.compactedThroughMessageId)
      if (compactedThroughMessageId !== null)
        return { messageId: row.id, compactedThroughMessageId }
    }
    return null
  }

  private loadPromptTranscriptRows(conversationId: string, afterMessageId: number | undefined): TranscriptRow[] {
    const where = afterMessageId === undefined
      ? eq(messages.conversationId, conversationId)
      : and(eq(messages.conversationId, conversationId), gt(messages.id, afterMessageId))
    const db = getWorkerDb()
    return db.select({
      id: messages.id,
      role: messages.role,
      content: messages.content,
      toolCalls: messages.toolCalls,
      toolCallId: messages.toolCallId,
      richMetadata: messages.richMetadata,
    }).from(messages).where(where).orderBy(asc(messages.id)).all().filter(row => !isTranscriptAuditEntry(row))
  }

  private loadPromptTranscriptRowsNewestFirst(conversationId: string, afterMessageId: number | undefined, limit: number): TranscriptRow[] {
    const where = afterMessageId === undefined
      ? eq(messages.conversationId, conversationId)
      : and(eq(messages.conversationId, conversationId), gt(messages.id, afterMessageId))
    const db = getWorkerDb()
    return db.select({
      id: messages.id,
      role: messages.role,
      content: messages.content,
      toolCalls: messages.toolCalls,
      toolCallId: messages.toolCallId,
      richMetadata: messages.richMetadata,
    }).from(messages).where(where).orderBy(desc(messages.id)).limit(limit * 3).all().filter(row => !isTranscriptAuditEntry(row)).slice(0, limit)
  }

  private isContextOverflowError(error: string | undefined): boolean {
    if (error === undefined)
      return false
    return /context|token|too large|maximum length|maximum prompt|prompt is too long/i.test(error)
  }

  private async buildRunContext(conversationId: string, systemPrompt: string): Promise<ChatMessage[]> {
    return new RunContextComposer({
      config: this.deps.config,
      loadBudgetHistory: (id, maxHistoryMessages) => this.loadBudgetHistory(id, maxHistoryMessages),
      loadHistoryWindow: id => this.loadHistoryWindow(id),
    }).compose({ conversationId, systemPrompt })
  }

  /**
   * Backward-compatible recent-message window. Used when no token budget field
   * is configured; preserves the REFACTOR-006 `maxHistoryMessages` behavior.
   */
  private async loadHistoryWindow(conversationId: string): Promise<ChatMessage[]> {
    const limit = this.deps.config.orchestrator?.maxHistoryMessages ?? DEFAULT_MAX_HISTORY_MESSAGES
    const checkpoint = this.loadLatestCompactionCheckpoint(conversationId)
    if (!checkpoint) {
      const rows = await loadRecentMessages(conversationId, limit)
      return rows.map(r => ({ role: r.role, content: r.content }))
    }
    return this.loadPromptTranscriptRowsNewestFirst(conversationId, checkpoint.compactedThroughMessageId, limit).reverse().map(rowToChatMessage)
  }

  private async loadBudgetHistory(conversationId: string, maxHistoryMessages: number | undefined): Promise<ChatMessage[]> {
    const checkpoint = this.loadLatestCompactionCheckpoint(conversationId)
    const rows = this.loadPromptTranscriptRowsNewestFirst(
      conversationId,
      checkpoint?.compactedThroughMessageId,
      maxHistoryMessages ?? DEFAULT_TOKEN_BUDGET_HISTORY_SCAN_MESSAGES,
    )
    return rows.map(rowToChatMessage)
  }

  /**
   * Per-tool approval gate（PLAN-014 F2）。在 executor 真正执行 tool 前调用：
   *
   * - `auto` → 立即返回 `allow`，调用方可直接进 executor。
   * - `ask`  → 在 bus 上发 `approval.requested` 事件，挂起 promise 等
   *            `approval.grant`；超时（默认 60s）按 deny 处理。
   * - `deny` → 短路：合成一条 `tool {name} blocked by policy` 助手消息；
   *            如果传了 `conversationId` 也会写入 `messages` 表。
   */
  async runTool(input: RunToolInput): Promise<RunToolResult> {
    const policy = evaluateToolPolicy(input.toolName, this.deps.config.toolPolicy)
    if (policy === 'auto')
      return { decision: 'allow', policy: 'auto' }

    if (policy === 'deny') {
      const text = `tool ${input.toolName} blocked by policy`
      if (input.conversationId !== undefined)
        this.persistAssistantMessage(input.conversationId, text)
      this.deps.bus.emit('approval.denied', {
        taskId: input.taskId,
        toolCallId: input.toolCallId,
        toolName: input.toolName,
        reason: 'policy',
      })
      return { decision: 'deny', policy: 'deny', syntheticAssistantMessage: text }
    }

    // policy === 'ask'：发事件后挂起，等 grant；超时视作 deny。
    const timeoutMs = input.timeoutMs ?? DEFAULT_APPROVAL_TIMEOUT_MS
    const expiresAt = Date.now() + timeoutMs
    this.deps.bus.emit('approval.requested', {
      workerId: this.deps.workerId,
      taskId: input.taskId,
      toolCallId: input.toolCallId,
      toolName: input.toolName,
      params: input.params,
      expiresAt,
    })

    let decision: ApprovalDecision
    try {
      decision = await this.deps.approvals.wait({
        taskId: input.taskId,
        toolCallId: input.toolCallId,
        toolName: input.toolName,
        params: input.params,
        timeoutMs,
      })
    }
    catch {
      // dispose 期间 reject —— 当成 deny 处理，调用方走短路分支。
      decision = 'deny'
    }

    if (decision === 'allow')
      return { decision: 'allow', policy: 'ask' }

    const text = `tool ${input.toolName} blocked by policy`
    if (input.conversationId !== undefined)
      this.persistAssistantMessage(input.conversationId, text)
    return { decision: 'deny', policy: 'ask', syntheticAssistantMessage: text }
  }

  private persistAssistantMessage(conversationId: string, text: string): void {
    const db = getWorkerDb()
    const now = new Date().toISOString()
    db.insert(messages).values({
      conversationId,
      role: 'assistant',
      content: text,
      createdAt: now,
    }).run()
    db.update(conversations).set({ lastActiveAt: now }).where(eq(conversations.id, conversationId)).run()
  }

  // Convenience: submit a free-form task not tied to a channel.
  async submitTask(prompt: string): Promise<{ id: string }> {
    const db = getWorkerDb()
    const id = crypto.randomUUID()
    const now = new Date().toISOString()
    db.insert(agentTasks).values({
      id,
      prompt,
      status: 'queued',
      createdAt: now,
    }).run()
    this.recordJournal({
      kind: 'task.queued',
      taskId: id,
      payload: {
        channel: 'web',
        executorEngine: this.deps.config.executor.engine,
        executorVariant: this.deps.config.executor.variant,
        promptLength: prompt.length,
        source: 'worker-admin-task',
      },
    })

    const envelope: Envelope = {
      workerId: this.deps.workerId,
      channel: 'web',
      // 系统派发的任务流不来自任何 web binding，使用保留前缀 `sys:` 避免与
      // 用户配置的 binding.id 冲突。
      accountId: 'sys:task',
      chatId: `task:${id}`,
      text: prompt,
      receivedAt: now,
      raw: { taskId: id },
    }
    void this.ingest(envelope).catch(err => consola.error(`[orchestrator] submitTask ingest failed: ${String(err)}`))

    return { id }
  }

  async continueConversation(conversationId: string, prompt: string): Promise<{ id: string }> {
    const db = getWorkerDb()
    const conversation = db.select()
      .from(conversations)
      .where(and(eq(conversations.id, conversationId), eq(conversations.status, 'open')))
      .get()
    if (!conversation)
      throw AppError.notFound('conversation not found', 'not-found')

    const entry = db.select()
      .from(sessionEntries)
      .where(and(eq(sessionEntries.currentConversationId, conversation.id), eq(sessionEntries.status, 'active')))
      .orderBy(desc(sessionEntries.lastInteractionAt))
      .get()
    if (!entry || entry.accountId === null)
      throw AppError.notFound('active conversation session not found', 'not-found')

    const id = crypto.randomUUID()
    const now = new Date().toISOString()
    db.insert(agentTasks).values({
      id,
      prompt,
      status: 'queued',
      createdAt: now,
    }).run()
    this.recordJournal({
      conversationId: conversation.id,
      kind: 'task.queued',
      taskId: id,
      payload: {
        channel: entry.channel,
        executorEngine: this.deps.config.executor.engine,
        executorVariant: this.deps.config.executor.variant,
        promptLength: prompt.length,
        source: 'worker-admin-continuation',
      },
    })

    const raw = {
      taskId: id,
      source: 'worker-admin',
      conversationId: conversation.id,
      [WORKER_ADMIN_CONTINUATION]: conversation.id,
    }
    const envelope: Envelope = {
      workerId: this.deps.workerId,
      channel: entry.channel,
      accountId: entry.accountId,
      chatId: entry.chatId,
      ...(entry.threadId === null ? {} : { threadId: entry.threadId }),
      text: prompt,
      receivedAt: now,
      raw,
    }
    void this.ingest(envelope).catch(err => consola.error(`[orchestrator] continueConversation ingest failed: ${String(err)}`))

    return { id }
  }

  async rerunTask(taskId: string, options: { prompt?: string } = {}): Promise<{ id: string }> {
    const journal = new BrainJournalService({
      config: this.deps.config,
      workerId: this.deps.workerId,
    }).getTaskTrace(taskId)
    if (journal === null)
      throw AppError.notFound('task not found', 'not-found')

    const existingReruns = journal.lineage.childTaskIds.length
    if (existingReruns >= MAX_PROOF_LOOP_RERUNS) {
      throw AppError.badRequest(
        `task rerun cap exceeded (${MAX_PROOF_LOOP_RERUNS})`,
        'rerun-cap-exceeded',
      )
    }

    const db = getWorkerDb()
    const id = crypto.randomUUID()
    const now = new Date().toISOString()
    const prompt = options.prompt?.trim() || buildProofLoopRerunPrompt({
      gateAction: journal.gateVerdict.action,
      gateReasons: journal.gateVerdict.reasons.map(reason => reason.reason),
      originalPrompt: journal.task.prompt,
      parentTaskId: taskId,
    })
    db.insert(agentTasks).values({
      id,
      prompt,
      status: 'queued',
      createdAt: now,
    }).run()

    this.recordJournal({
      ...(journal.task.conversationId === undefined ? {} : { conversationId: journal.task.conversationId }),
      kind: 'rerun.requested',
      taskId,
      payload: {
        action: 'rerun',
        attempt: existingReruns + 1,
        childTaskId: id,
        evidenceRefs: journal.gateVerdict.evidenceRefs,
        gateAction: journal.gateVerdict.action,
        maxAttempts: MAX_PROOF_LOOP_RERUNS,
        promptOverride: options.prompt !== undefined,
        reasons: journal.gateVerdict.reasons.map(reason => ({
          mode: reason.mode,
          reason: reason.reason,
          source: reason.source,
          ...(reason.evidenceRef === undefined ? {} : { evidenceRef: reason.evidenceRef }),
        })),
      },
    })
    this.recordJournal({
      kind: 'task.queued',
      taskId: id,
      payload: {
        channel: 'web',
        executorEngine: this.deps.config.executor.engine,
        executorVariant: this.deps.config.executor.variant,
        gateAction: journal.gateVerdict.action,
        parentTaskId: taskId,
        promptLength: prompt.length,
        rerunOfTaskId: taskId,
        source: 'proof-loop-rerun',
      },
    })

    const envelope: Envelope = {
      workerId: this.deps.workerId,
      channel: 'web',
      accountId: 'sys:task',
      chatId: `task:${id}`,
      text: prompt,
      receivedAt: now,
      raw: {
        parentTaskId: taskId,
        rerunOfTaskId: taskId,
        source: 'proof-loop-rerun',
        taskId: id,
      },
    }
    void this.ingest(envelope).catch(err => consola.error(`[orchestrator] rerunTask ingest failed: ${String(err)}`))

    return { id }
  }
}

function buildProofLoopRerunPrompt(input: {
  gateAction: string
  gateReasons: string[]
  originalPrompt: string
  parentTaskId: string
}): string {
  return [
    `Rerun AIWorker task ${input.parentTaskId} after Gate action: ${input.gateAction}.`,
    '',
    'Original task goal:',
    input.originalPrompt,
    '',
    'Gate reasons to address:',
    input.gateReasons.length > 0 ? input.gateReasons.map(reason => `- ${reason}`).join('\n') : '- no gate reason recorded',
    '',
    'Return a corrected result with concrete evidence. Do not claim durable Brain memory changes unless they are submitted through Brain admission.',
  ].join('\n')
}

export function detectAdmissionSuccessClaim(text: string): string | null {
  return detectAdmissionSuccessClaimDetails(text)?.reason ?? null
}

export function detectAdmissionSuccessClaimDetails(text: string): { reason: string, claimExcerpt: string } | null {
  const admissionClaim = firstMatchingExcerpt(text, [
    /(?:admission\s+proposal|proposal)[\s\S]{0,120}(?:submitted|created|queued|filed|opened|approved|accepted|applied|persisted|saved|recorded)/i,
    /(?:submitted|created|queued|filed|opened|approved|accepted|applied|persisted|saved|recorded)[\s\S]{0,120}(?:admission\s+proposal|proposal)/i,
    /(?:admission|proposal|提案|申请|审批)[\s\S]{0,120}(?:已提交|已创建|已加入|已落盘|已持久化|已记录|已采纳|已批准|已应用)/i,
    /(?:已提交|已创建|已加入|已落盘|已持久化|已记录|已采纳|已批准|已应用)[\s\S]{0,120}(?:admission|proposal|提案|申请|审批)/i,
  ])
  if (admissionClaim !== null) {
    return {
      claimExcerpt: admissionClaim,
      reason: 'assistant-claimed-admission-without-db-delta',
    }
  }

  const memoryClaim = firstMatchingExcerpt(text, [
    /(?:长期记忆|brain memory|project brain|canonical brain|记忆)[\s\S]{0,120}(?:已写入|已保存|已落盘|已持久化|已记录|remembered|saved|persisted)/i,
    /(?:已写入|已保存|已落盘|已持久化|已记录|remembered|saved|persisted)[\s\S]{0,120}(?:长期记忆|brain memory|project brain|canonical brain|记忆)/i,
  ])
  if (memoryClaim !== null) {
    return {
      claimExcerpt: memoryClaim,
      reason: 'assistant-claimed-memory-without-admission-delta',
    }
  }

  return null
}

function firstMatchingExcerpt(text: string, patterns: readonly RegExp[]): string | null {
  for (const pattern of patterns) {
    const match = pattern.exec(text)
    if (!match)
      continue
    const raw = match[0]?.replace(/\s+/g, ' ').trim() ?? ''
    if (raw.length === 0)
      continue
    const redacted = redactBodySecrets(raw).body
    return redacted.length <= 180 ? redacted : `${redacted.slice(0, 180)}...`
  }
  return null
}

function isTerminalToolStatus(status: string | undefined): boolean {
  return status === 'success' || status === 'failed' || status === 'denied'
}

function taskIdFromEnvelope(envelope: Envelope): string | undefined {
  if (!envelope.raw || typeof envelope.raw !== 'object' || Array.isArray(envelope.raw))
    return undefined
  const taskId = (envelope.raw as Record<string, unknown>).taskId
  return typeof taskId === 'string' && taskId.length > 0 ? taskId : undefined
}

function taskErrorMessage(err: unknown): string {
  if (err instanceof Error && err.message.length > 0)
    return err.message
  return String(err)
}

function isCancellationError(err: unknown): boolean {
  return err instanceof Error && err.message === 'cancelled'
}

function redactTaskError(error: string): string {
  const redacted = error
    .replace(/\b([\w.-]*(?:api[_-]?key|token|secret|password|authorization)[\w.-]*)\b(\s*[:=]\s*)(?:"[^"]*"|'[^']*'|[^\s,;]+)/gi, '$1$2[redacted]')
    .replace(/\bBearer\s+[^\s,;]+/gi, 'Bearer [redacted]')
    .replace(/\s+/g, ' ')
    .trim()
  if (redacted.length <= TASK_ERROR_MAX_LENGTH)
    return redacted
  return `${redacted.slice(0, TASK_ERROR_MAX_LENGTH - 3)}...`
}

function isWorkerAdminContinuation(envelope: Envelope, conversationId: string): boolean {
  if (!envelope.raw || typeof envelope.raw !== 'object' || Array.isArray(envelope.raw))
    return false
  return (envelope.raw as { [WORKER_ADMIN_CONTINUATION]?: string })[WORKER_ADMIN_CONTINUATION] === conversationId
}

function rowToChatMessage(row: Pick<TranscriptRow, 'role' | 'content' | 'toolCalls' | 'toolCallId'>): ChatMessage {
  return {
    role: row.role,
    content: row.content,
    ...(row.toolCalls === null ? {} : { toolCalls: row.toolCalls }),
    ...(row.toolCallId === null ? {} : { toolCallId: row.toolCallId }),
  }
}

function splitRowsForCompaction(rows: TranscriptRow[], keepRecentTokens: number): { candidateRows: TranscriptRow[], recentRows: TranscriptRow[] } {
  const recentNewestFirst: TranscriptRow[] = []
  let recentTokens = 0
  for (let index = rows.length - 1; index >= 0; index -= 1) {
    const row = rows[index]!
    const rowTokens = estimateChatMessageTokens(rowToChatMessage(row))
    if (recentNewestFirst.length > 0 && recentTokens + rowTokens > keepRecentTokens)
      break
    recentNewestFirst.push(row)
    recentTokens += rowTokens
  }

  const recentRows = expandRecentRowsForToolPairs(rows, recentNewestFirst.reverse())
  const firstRecentId = recentRows[0]?.id
  if (firstRecentId === undefined)
    return { candidateRows: rows, recentRows: [] }
  return {
    candidateRows: rows.filter(row => row.id < firstRecentId),
    recentRows,
  }
}

function expandRecentRowsForToolPairs(rows: TranscriptRow[], recentRows: TranscriptRow[]): TranscriptRow[] {
  const firstRecentId = recentRows[0]?.id
  if (firstRecentId === undefined)
    return recentRows

  let startIndex = rows.findIndex(row => row.id === firstRecentId)
  if (startIndex < 0)
    return recentRows

  while (startIndex > 0) {
    const missingAssistantIndex = findMissingToolCallAssistantIndex(rows, startIndex)
    if (missingAssistantIndex === null || missingAssistantIndex >= startIndex)
      break
    startIndex = missingAssistantIndex
  }
  return rows.slice(startIndex)
}

function findMissingToolCallAssistantIndex(rows: TranscriptRow[], startIndex: number): number | null {
  const availableToolCallIds = new Set<string>()
  for (let index = startIndex; index < rows.length; index += 1) {
    const row = rows[index]!
    for (const toolCall of row.toolCalls ?? [])
      availableToolCallIds.add(toolCall.id)
    if (row.role !== 'tool' || row.toolCallId === null || availableToolCallIds.has(row.toolCallId))
      continue
    for (let candidateIndex = startIndex - 1; candidateIndex >= 0; candidateIndex -= 1) {
      const candidate = rows[candidateIndex]!
      if (candidate.toolCalls?.some(toolCall => toolCall.id === row.toolCallId) === true)
        return candidateIndex
    }
  }
  return null
}

function buildCompactionPrompt(previousSummary: string | null, rows: TranscriptRow[], config: OrchestratorCompactionConfig): ChatMessage[] {
  return [
    {
      role: 'system',
      content: [
        'You compact an AIWorker conversation transcript for future prompt context.',
        'Return a concise durable summary only.',
        'Merge the previous durable summary with the new transcript rows.',
        'Preserve user preferences, decisions, open tasks, constraints, named entities, and tool outcomes.',
        'Do not invent facts. Do not mention that this is a summary unless needed for clarity.',
      ].join('\n'),
    },
    {
      role: 'user',
      content: [
        'Previous durable summary:',
        previousSummary?.trim() || '(none)',
        '',
        'Transcript rows to compact. Raw rows remain stored for audit:',
        formatTranscriptExcerpt(rows, config.maxSummaryMessages ?? DEFAULT_COMPACTION_MAX_SUMMARY_MESSAGES),
      ].join('\n'),
    },
  ]
}

function buildMemoryFlushPrompt(previousSummary: string | null, rows: TranscriptRow[], config: OrchestratorCompactionConfig): ChatMessage[] {
  return [
    {
      role: 'system',
      content: [
        'You are drafting a pre-compaction long-term memory proposal for AIWorker.',
        'This turn is not delivered to the user.',
        'Return only durable facts, preferences, decisions, or todos that should be proposed through Brain admission.',
        'If there is nothing durable to write, return NONE.',
      ].join('\n'),
    },
    {
      role: 'user',
      content: [
        'Previous durable summary:',
        previousSummary?.trim() || '(none)',
        '',
        'Transcript rows about to be compacted:',
        formatTranscriptExcerpt(rows, config.maxSummaryMessages ?? DEFAULT_COMPACTION_MAX_SUMMARY_MESSAGES),
      ].join('\n'),
    },
  ]
}

function preCompactionAdmissionId(conversationId: string, throughId: number): string {
  const hash = createHash('sha256')
    .update(`${conversationId}:${throughId}`)
    .digest('hex')
    .slice(0, 12)
  return `pre-compaction-${throughId}-${hash}`
}

function formatTranscriptExcerpt(rows: TranscriptRow[], limit: number): string {
  if (rows.length <= limit)
    return rows.map(formatTranscriptRow).join('\n')

  const headCount = Math.ceil(limit / 2)
  const tailCount = Math.floor(limit / 2)
  const omitted = rows.length - headCount - tailCount
  return [
    ...rows.slice(0, headCount).map(formatTranscriptRow),
    `... ${omitted} transcript rows omitted from summarizer prompt ...`,
    ...rows.slice(rows.length - tailCount).map(formatTranscriptRow),
  ].join('\n')
}

function formatTranscriptRow(row: TranscriptRow): string {
  const toolCallIds = row.toolCalls?.map(toolCall => toolCall.id).join(', ')
  const suffix = [
    toolCallIds ? ` toolCalls=${toolCallIds}` : '',
    row.toolCallId ? ` toolCallId=${row.toolCallId}` : '',
  ].join('')
  return `#${row.id} ${row.role}${suffix}: ${row.content.slice(0, 1_500)}`
}

function fallbackCompactionSummary(previousSummary: string | null, rows: TranscriptRow[]): string {
  const range = rows.length === 0 ? 'no rows' : `rows #${rows[0]!.id}-#${rows[rows.length - 1]!.id}`
  return [
    previousSummary?.trim() || '',
    `Compacted ${range}.`,
    formatTranscriptExcerpt(rows, Math.min(12, DEFAULT_COMPACTION_MAX_SUMMARY_MESSAGES)),
  ].filter(part => part.length > 0).join('\n\n')
}

function isTranscriptAuditEntry(row: { role: ChatMessage['role'], richMetadata: string | null }): boolean {
  if (row.role !== 'system')
    return false
  const metadata = parseTranscriptMetadata(row)
  return metadata?.kind === 'compaction' || metadata?.kind === 'memory-flush'
}

function parseTranscriptMetadata(row: { role: string, richMetadata: string | null }): Record<string, unknown> | null {
  if (row.role !== 'system' || row.richMetadata === null)
    return null
  try {
    const parsed = JSON.parse(row.richMetadata) as unknown
    return parsed !== null && typeof parsed === 'object' && !Array.isArray(parsed)
      ? parsed as Record<string, unknown>
      : null
  }
  catch {
    return null
  }
}

function positiveNumber(value: unknown): number | null {
  return typeof value === 'number' && Number.isInteger(value) && value > 0 ? value : null
}

function isEngineSessionBinding(value: unknown): value is EngineSessionBinding {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
}

function isGatewaySessionReset(envelope: Envelope): boolean {
  if (!envelope.raw || typeof envelope.raw !== 'object' || Array.isArray(envelope.raw))
    return false
  const raw = envelope.raw as Record<string, unknown>
  return raw.source === 'gateway' && raw.sessionReset === true
}

function gatewayConversationIdFromEnvelope(envelope: Envelope): string | undefined {
  if (!envelope.raw || typeof envelope.raw !== 'object' || Array.isArray(envelope.raw))
    return undefined
  const raw = envelope.raw as Record<string, unknown>
  return raw.source === 'gateway' && envelope.accountId === 'sys:gateway' && envelope.chatId.startsWith('gw:')
    ? envelope.chatId
    : undefined
}

function gatewayResetReason(envelope: Envelope): string {
  if (!envelope.raw || typeof envelope.raw !== 'object' || Array.isArray(envelope.raw))
    return 'manual'
  const command = (envelope.raw as Record<string, unknown>).resetCommand
  return command === '/new' || command === '/reset' ? `manual:${command}` : 'manual'
}

function rowToState(row: typeof conversations.$inferSelect): ConversationState {
  return {
    id: row.id,
    ...(row.taskId === null ? {} : { taskId: row.taskId }),
    channel: row.channel,
    chatId: row.chatId,
    ...(row.threadId === null ? {} : { threadId: row.threadId }),
    status: row.status,
    ...(row.summary === null ? {} : { summary: row.summary }),
    startedAt: row.startedAt,
    lastActiveAt: row.lastActiveAt,
    ...(row.closedAt === null ? {} : { closedAt: row.closedAt }),
  }
}
