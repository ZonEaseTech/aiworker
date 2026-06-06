import { redactProvisionToken } from '@zonease/aiworker-host-control'

import type { ProvisioningAdapterType, ProvisioningTargetMaturity } from './host-options'
import { assertRemoteAisshCallbackReachable, resolveAdapterRuntimeControlBaseUrl } from './host-url-contract'

export interface ProvisioningDeliveryInput {
  adapterRuntimeControlBaseUrl?: string
  adapterType: ProvisioningAdapterType
  assignedEmail: string
  assignmentId: string
  hostBrowserBaseUrl: string
  hostControlBaseUrl: string
  maturity: ProvisioningTargetMaturity
  provisionToken: string
  soulReleaseRef: string
  targetRef: string
}

export interface ProvisioningDeliveryResult {
  deliveryReceipt: {
    adapterType: ProvisioningAdapterType
    command: string
    targetRef: string
  }
  deliveryStatus: 'delivered'
  expectedCheckInDeadline: string
  operatorHint: string
  provisionCommand: string
}

export function deliverProvisioningTarget(input: ProvisioningDeliveryInput): ProvisioningDeliveryResult {
  const adapterRuntimeControlBaseUrl = resolveAdapterRuntimeControlBaseUrl({
    adapterRuntimeControlBaseUrl: input.adapterRuntimeControlBaseUrl,
    adapterType: input.adapterType,
    hostControlBaseUrl: input.hostControlBaseUrl,
  })
  const provisionCommand = buildProvisionCommand(adapterRuntimeControlBaseUrl, redactProvisionTokenValue(input.provisionToken))
  const targetRef = scrubProvisionSecret(input.targetRef, input.provisionToken)
  const assignedEmail = scrubProvisionSecret(input.assignedEmail, input.provisionToken)

  if (input.adapterType === 'aissh') {
    assertRemoteAisshCallbackReachable({ adapterRuntimeControlBaseUrl, targetRef })
    return result(input, buildAisshCommand(targetRef, assignedEmail, provisionCommand), provisionCommand, '等待远程 Worker 回连 Host。')
  }
  if (input.adapterType === 'docker') {
    return result(input, buildDockerCommand(input.assignmentId, provisionCommand), provisionCommand, '等待 Docker container 内 Worker 回连 Host。')
  }
  return result(input, buildLocalCommand(input.assignmentId, provisionCommand), provisionCommand, '等待本机 Worker 回连 Host。')
}

function result(
  input: ProvisioningDeliveryInput,
  command: string,
  provisionCommand: string,
  operatorHint: string,
): ProvisioningDeliveryResult {
  return {
    deliveryReceipt: {
      adapterType: input.adapterType,
      command: scrubProvisionSecret(command, input.provisionToken),
      targetRef: scrubProvisionSecret(input.targetRef, input.provisionToken),
    },
    deliveryStatus: 'delivered',
    expectedCheckInDeadline: new Date(Date.now() + 5 * 60 * 1000).toISOString(),
    operatorHint: scrubProvisionSecret(operatorHint, input.provisionToken),
    provisionCommand: scrubProvisionSecret(provisionCommand, input.provisionToken),
  }
}

function buildProvisionCommand(callbackBaseUrl: string, provisionToken: string): string {
  return `bun apps/worker-cli/src/aiworker.ts provision --host ${shellQuote(callbackBaseUrl)} --token ${shellQuote(provisionToken)}`
}

function buildAisshCommand(targetRef: string, assignedEmail: string, provisionCommand: string): string {
  return `aissh exec ${shellQuote(targetRef)} ${shellQuote(provisionCommand)} --reason=${shellQuote(`Provision AIWorker for ${assignedEmail}`)}`
}

function buildDockerCommand(assignmentId: string, provisionCommand: string): string {
  const volume = `aiworker-worker-${assignmentId}`
  return `docker run --name ${shellQuote(volume)} --volume ${shellQuote(`${volume}:/home/aiworker/.aiworker`)} --env AIWORKER_HOME=/home/aiworker/.aiworker aiworker/worker:dev ${shellQuote(provisionCommand)}`
}

function buildLocalCommand(assignmentId: string, provisionCommand: string): string {
  return `AIWORKER_HOME=${shellQuote(`${process.env.HOME ?? '.'}/.aiworker-dev/provisioned/${assignmentId}`)} ${provisionCommand}`
}

function shellQuote(value: string): string {
  if (/^[\w/:=.,@%+-]+$/.test(value))
    return value
  return `'${value.replaceAll('\'', String.raw`'\''`)}'`
}

function scrubProvisionSecret(value: string, provisionToken: string): string {
  if (provisionToken.length === 0)
    return value
  const redactedProvisionToken = redactProvisionTokenValue(provisionToken)
  return value
    .replaceAll(shellQuote(provisionToken), shellQuote(redactedProvisionToken))
    .replaceAll(provisionToken, redactedProvisionToken)
}

function redactProvisionTokenValue(provisionToken: string): string {
  const redactedProvisionToken = redactProvisionToken(provisionToken)
  return redactedProvisionToken === provisionToken ? '[REDACTED]' : redactedProvisionToken
}
