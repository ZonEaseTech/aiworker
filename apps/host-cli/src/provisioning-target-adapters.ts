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
  const provisionCommand = buildProvisionCommand(adapterRuntimeControlBaseUrl, input.provisionToken)

  if (input.adapterType === 'aissh') {
    assertRemoteAisshCallbackReachable({ adapterRuntimeControlBaseUrl, targetRef: input.targetRef })
    return result(input, buildAisshCommand(input.targetRef, input.assignedEmail, provisionCommand), provisionCommand, '等待远程 Worker 回连 Host。')
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
      command: redactProvisioningCommand(command, input.provisionToken),
      targetRef: input.targetRef,
    },
    deliveryStatus: 'delivered',
    expectedCheckInDeadline: new Date(Date.now() + 5 * 60 * 1000).toISOString(),
    operatorHint,
    provisionCommand: redactProvisioningCommand(provisionCommand, input.provisionToken),
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

function redactProvisioningCommand(command: string, provisionToken: string): string {
  if (provisionToken.length === 0)
    return command
  const redactedProvisionToken = redactProvisionTokenValue(provisionToken)
  return command
    .replaceAll(shellQuote(provisionToken), redactedProvisionToken)
    .replaceAll(provisionToken, redactedProvisionToken)
}

function redactProvisionTokenValue(provisionToken: string): string {
  const redactedProvisionToken = redactProvisionToken(provisionToken)
  return redactedProvisionToken === provisionToken ? '[REDACTED]' : redactedProvisionToken
}
