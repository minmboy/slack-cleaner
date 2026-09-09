/**
 * Runs the delete queue. There is no bulk endpoint — `chat.delete` is one call
 * per message — so this is a paced loop with per-message outcomes.
 *
 * Order matters: thread replies go first, then roots. Deleting a root leaves its
 * replies stranded under a "message deleted" placeholder, so clearing my replies
 * first produces a tidier result.
 */
import { SlackApiError, slackCall, type CallContext } from './slack'
import type { DeleteOutcome, DeleteResult, TargetMessage } from './types'

/** Slack said no, and retrying will not change that. */
const PERMANENT: Record<string, DeleteOutcome> = {
  message_not_found: 'already_gone',
  cant_delete_message: 'not_allowed',
  compliance_exports_prevent_deletion: 'not_allowed',
  channel_not_found: 'failed',
}

/** Errors that mean the whole run should stop rather than log N identical failures. */
const FATAL = new Set(['invalid_auth', 'not_authed', 'token_revoked', 'account_inactive', 'missing_scope'])

export class DeleteRunAborted extends Error {
  readonly code: string

  constructor(code: string) {
    super(`delete run aborted: ${code}`)
    this.name = 'DeleteRunAborted'
    this.code = code
  }
}

/**
 * Sorts so that thread replies are deleted before thread roots, and within each
 * group newest first (so a partially-run job leaves the oldest history intact).
 */
export function orderForDeletion(targets: TargetMessage[]): TargetMessage[] {
  return [...targets].sort((a, b) => {
    const aReply = a.threadTs ? 0 : 1
    const bReply = b.threadTs ? 0 : 1
    if (aReply !== bReply) return aReply - bReply
    return Number(b.ts) - Number(a.ts)
  })
}

export interface DeleteRunOptions {
  dryRun: boolean
  onResult: (result: DeleteResult, index: number) => void
  onRateLimit?: (waitMs: number) => void
}

export async function runDeletion(
  targets: TargetMessage[],
  options: DeleteRunOptions,
  ctx: CallContext,
): Promise<DeleteResult[]> {
  const ordered = orderForDeletion(targets)
  const results: DeleteResult[] = []

  for (let index = 0; index < ordered.length; index++) {
    const target = ordered[index]

    if (options.dryRun) {
      const result: DeleteResult = { channelId: target.channelId, ts: target.ts, outcome: 'skipped' }
      results.push(result)
      options.onResult(result, index)
      continue
    }

    let result: DeleteResult
    try {
      await slackCall('chat.delete', 3, { channel: target.channelId, ts: target.ts }, ctx)
      result = { channelId: target.channelId, ts: target.ts, outcome: 'deleted' }
    } catch (error) {
      if (error instanceof DOMException && error.name === 'AbortError') throw error
      if (error instanceof SlackApiError) {
        if (FATAL.has(error.code)) throw new DeleteRunAborted(error.code)
        result = {
          channelId: target.channelId,
          ts: target.ts,
          outcome: PERMANENT[error.code] ?? 'failed',
          errorCode: error.code,
        }
      } else {
        result = {
          channelId: target.channelId,
          ts: target.ts,
          outcome: 'failed',
          errorCode: error instanceof Error ? error.message : 'unknown_error',
        }
      }
    }

    results.push(result)
    options.onResult(result, index)
  }

  return results
}

export function summarize(results: DeleteResult[]): Record<DeleteOutcome, number> {
  const tally: Record<DeleteOutcome, number> = {
    deleted: 0,
    already_gone: 0,
    not_allowed: 0,
    failed: 0,
    skipped: 0,
  }
  for (const result of results) tally[result.outcome]++
  return tally
}
