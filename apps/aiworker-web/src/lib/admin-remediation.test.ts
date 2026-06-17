import { describe, expect, test } from 'bun:test'
import { adminApiErrorPayload, classifyAdminError, classifyApplyOutput, redactUnsafeAdminDetail } from './admin-remediation'

describe('admin remediation taxonomy', () => {
  test('classifies Web API precondition failures into stable remediation codes', () => {
    expect(classifyAdminError(new Error('control plane snapshot is required'))).toBe('control_plane_snapshot_required')
    expect(classifyAdminError(new Error('assignment asn-1 must be approved before apply'))).toBe('approval_required')
    expect(classifyAdminError(new Error('assignment asn-1 must be applied and handoff-ready before pairing'))).toBe('handoff_not_ready')
    expect(classifyAdminError(new Error('unknown assignment asn-missing'))).toBe('assignment_not_found')
    expect(classifyAdminError(new Error('soul descriptor is missing: /tmp/missing.json'))).toBe('soul_descriptor_missing')
    expect(classifyAdminError(new Error('pair command failed; run apply first'))).toBe('pair_command_failed')
  })

  test('classifies apply output without exposing raw command output', () => {
    expect(classifyApplyOutput(1, '', 'AISSH_TOKEN is required')).toBe('aissh_token_missing')
    expect(classifyApplyOutput(1, '', 'aissh: command not found')).toBe('aissh_unavailable')
    expect(classifyApplyOutput(1, '', 'paseo: command not found')).toBe('paseo_unavailable')
    expect(classifyApplyOutput(1, '', 'Paseo daemon not reachable')).toBe('paseo_daemon_unavailable')
    expect(classifyApplyOutput(42, 'AIWORKER_PROVIDER_WARNING: provider needs login', 'Paseo daemon not reachable')).toBe('paseo_daemon_unavailable')
    expect(classifyApplyOutput(0, 'AIWORKER_PROVIDER_WARNING: provider needs login', '')).toBe('provider_auth_required')
    expect(classifyApplyOutput(0, 'AIWORKER_HANDOFF_READY', '')).toBeNull()
  })

  test('redacts unsafe details and never embeds literal token values in payloads', () => {
    const detail = redactUnsafeAdminDetail('Bearer abcdefghijklmnopqrstuvwxyz sk-test-secret https://relay.paseo.example/#offer=raw-token data:image/png;base64,abc')

    expect(detail).not.toContain('Bearer abc')
    expect(detail).not.toContain('sk-test')
    expect(detail).not.toContain('offer=raw-token')
    expect(detail).not.toContain('data:image')

    const payload = adminApiErrorPayload('admin_token_required', 'Bearer abcdefghijklmnopqrstuvwxyz was rejected')
    expect(payload.error).toBe('admin_token_required')
    expect(JSON.stringify(payload)).not.toContain('abcdefghijklmnopqrstuvwxyz')
    expect(payload.remediation.nextSteps.length).toBeGreaterThan(0)
  })
})
