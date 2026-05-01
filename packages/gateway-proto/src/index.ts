/**
 * @zonease/aiworker-gateway-proto
 *
 * aiworker operator CLI ↔ gateway ↔ worker-node 之间 WS 协议的纯类型 + 运行时解析层。
 * 本包只负责帧结构、方法/事件 schema 与 parse/encode，不包含任何 server
 * 框架、socket 客户端或网络 API 的引用。
 */

export {
  agentDonePayloadSchema,
  agentThinkingPayloadSchema,
  agentToolCallPayloadSchema,
  approvalRequestedPayloadSchema,
  chatMessagePayloadSchema,
  configChangedPayloadSchema,
  enrollmentApprovedPayloadSchema,
  enrollmentOtpPayloadSchema,
  enrollmentPendingPayloadSchema,
  EVENT_PAYLOADS,
  EVENTS,
  isKnownEvent,
  logsLinePayloadSchema,
  workerOfflinePayloadSchema,
  workerOnlinePayloadSchema,
} from './events'
export type {
  AgentDonePayload,
  AgentThinkingPayload,
  AgentToolCallPayload,
  ApprovalRequestedPayload,
  ChatMessagePayload,
  ConfigChangedPayload,
  EnrollmentApprovedPayload,
  EnrollmentOtpPayload,
  EnrollmentPendingPayload,
  EventName,
  LogsLinePayload,
  WorkerOfflinePayload,
  WorkerOnlinePayload,
} from './events'

export {
  connectFrameSchema,
  encodeFrame,
  eventFrameSchema,
  FrameSchema,
  parseFrame,
  requestFrameSchema,
  responseErrorSchema,
  responseFrameSchema,
} from './messages'
export type {
  ConnectFrame,
  EventFrame,
  Frame,
  ParseResult,
  RequestFrame,
  ResponseError,
  ResponseFrame,
} from './messages'

export {
  approvalDecisionSchema,
  auditEventSchema,
  cronJobInputSchema,
  cronJobPatchSchema,
  cronJobRecordSchema,
  getMethodDef,
  isKnownMethod,
  METHODS,
  pairRequestSchema,
  pairResultSchema,
  pendingApprovalSchema,
  pendingEnrollmentSchema,
  workerSummarySchema,
} from './methods'
export type {
  ApprovalDecision,
  AuditEventRecord,
  CronJobRecordProto,
  MethodDef,
  MethodName,
  MethodRouting,
  PairRequest,
  PairResult,
  PendingApprovalDescriptor,
  PendingEnrollment,
  WorkerSummary,
} from './methods'

export { ROLES, roleSchema } from './roles'
export type { Role } from './roles'
