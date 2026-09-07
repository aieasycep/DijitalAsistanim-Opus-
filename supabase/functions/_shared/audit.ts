import { serviceClient } from './db.ts'

/**
 * Audit log.
 *
 * Records what the assistant did on a user's behalf — which account it read,
 * which approval it executed, when credentials were rotated — so a user asking
 * "why did it send that?" can be answered from data rather than from memory.
 *
 * The metadata type is deliberately narrow. An audit row must never contain a
 * mail body, a subject, an address or a token, and the only way to guarantee
 * that is to make it impossible to pass one.
 */

export type AuditValue = string | number | boolean | null

export const AUDIT_ACTIONS = [
  'account.connected',
  'account.disconnected',
  'account.scope_granted',
  'account.token_refreshed',
  'account.token_revoked',
  'sync.started',
  'sync.completed',
  'sync.failed',
  'approval.created',
  'approval.approved',
  'approval.rejected',
  'approval.executed',
  'approval.failed',
  'approval.expired',
  'briefing.generated',
  'briefing.skipped',
  'assistant.query',
  'capture.analyzed',
  'notification.sent',
  'subscription.updated',
  'referral.redeemed',
  'referral.rejected',
  'privacy.export_requested',
  'privacy.history_deleted',
  'privacy.account_deleted',
  'retention.swept',
] as const

export type AuditAction = (typeof AUDIT_ACTIONS)[number]

export interface AuditEntry {
  userId: string | null
  action: AuditAction
  entityType?: string
  entityId?: string
  /**
   * Identifiers, counts, codes and enum values only. Anything free-text
   * belongs in the record the entity id points at, not here.
   */
  metadata?: Record<string, AuditValue>
}

/**
 * Write an audit row.
 *
 * Never throws: an audit failure must not roll back the action it describes,
 * because losing the effect is worse than losing the record of it. Failures
 * are logged so they are still visible in function logs.
 */
export async function audit(entry: AuditEntry): Promise<void> {
  try {
    const { error } = await serviceClient().from('audit_logs').insert({
      user_id: entry.userId,
      action: entry.action,
      entity_type: entry.entityType ?? null,
      entity_id: entry.entityId ?? null,
      metadata: entry.metadata ?? {},
    })
    if (error) {
      console.error(JSON.stringify({ audit_failed: entry.action, code: error.code }))
    }
  } catch (error) {
    console.error(
      JSON.stringify({
        audit_failed: entry.action,
        detail: error instanceof Error ? error.message.slice(0, 120) : 'unknown',
      }),
    )
  }
}
