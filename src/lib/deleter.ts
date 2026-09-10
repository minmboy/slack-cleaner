/**
 * Runs the delete queue. There is no bulk endpoint — `chat.delete` is one call
 * per message and `files.delete` one per file — so this is a paced loop with
 * per-item outcomes.
 *
 * Messages go first, in an order that matters: thread replies before roots.
 * Deleting a root strands its replies under a "message deleted" placeholder, so
 * clearing my replies first produces a tidier result.
 *
 * Files come afterwards, because they have no ordering constraints and because
 * an aborted run should leave messages gone rather than leave live messages
 * pointing at deleted attachments.
 */
import { deleteFile } from './api'
import { SlackApiError, slackCall, type CallContext } from './slack'
import type { DeleteOutcome, DeleteResult, TargetFile, TargetMessage } from './types'

/** Slack said no, and retrying will not change that. */
const PERMANENT: Record<string, DeleteOutcome> = {
  message_not_found: 'already_gone',
  file_not_found: 'already_gone',
  file_deleted: 'already_gone',
  cant_delete_message: 'not_allowed',
  cant_delete_file: 'not_allowed',
  compliance_exports_prevent_deletion: 'not_allowed',
  channel_not_found: 'failed',
}

/** Errors that mean the whole run should stop rather than log N identical failures. */
const FATAL = new Set(['invalid_auth', 'not_authed', 'token_revoked', 'account_inactive'])

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

/** One entry per file id: a file shared twice is still a single object to delete. */
export function collectFiles(targets: TargetMessage[]): TargetFile[] {
  const byId = new Map<string, TargetFile>()
  for (const target of targets) {
    for (const file of target.files) if (!byId.has(file.id)) byId.set(file.id, file)
  }
  return [...byId.values()]
}

export interface DeleteRunOptions {
  dryRun: boolean
  /** Empty unless the user opted into removing attachments as well. */
  files: TargetFile[]
  onResult: (result: DeleteResult, index: number) => void
}

function classify(error: unknown, base: Omit<DeleteResult, 'outcome'>): DeleteResult {
  if (error instanceof SlackApiError) {
    return { ...base, outcome: PERMANENT[error.code] ?? 'failed', errorCode: error.code }
  }
  return {
    ...base,
    outcome: 'failed',
    errorCode: error instanceof Error ? error.message : 'unknown_error',
  }
}

export async function runDeletion(
  targets: TargetMessage[],
  options: DeleteRunOptions,
  ctx: CallContext,
): Promise<DeleteResult[]> {
  const results: DeleteResult[] = []
  const emit = (result: DeleteResult) => {
    results.push(result)
    options.onResult(result, results.length - 1)
  }

  for (const target of orderForDeletion(targets)) {
    const base = { kind: 'message' as const, channelId: target.channelId, id: target.ts }

    if (options.dryRun) {
      emit({ ...base, outcome: 'skipped' })
      continue
    }

    try {
      await slackCall('chat.delete', 3, { channel: target.channelId, ts: target.ts }, ctx)
      emit({ ...base, outcome: 'deleted' })
    } catch (error) {
      if (error instanceof DOMException && error.name === 'AbortError') throw error
      if (error instanceof SlackApiError && (FATAL.has(error.code) || error.code === 'missing_scope')) {
        throw new DeleteRunAborted(error.code)
      }
      emit(classify(error, base))
    }
  }

  for (const [position, file] of options.files.entries()) {
    const base = { kind: 'file' as const, channelId: file.channelId, id: file.id, label: file.name }

    if (options.dryRun) {
      emit({ ...base, outcome: 'skipped' })
      continue
    }

    try {
      await deleteFile(file.id, ctx)
      emit({ ...base, outcome: 'deleted' })
    } catch (error) {
      if (error instanceof DOMException && error.name === 'AbortError') throw error
      if (error instanceof SlackApiError && FATAL.has(error.code)) throw new DeleteRunAborted(error.code)

      // A missing files:write scope will reject every remaining file too. Record
      // them all rather than making N identical calls, and keep the message
      // results — those already succeeded and are the primary work.
      if (error instanceof SlackApiError && error.code === 'missing_scope') {
        for (const remaining of options.files.slice(position)) {
          emit({
            kind: 'file',
            channelId: remaining.channelId,
            id: remaining.id,
            label: remaining.name,
            outcome: 'failed',
            errorCode: 'missing_scope',
          })
        }
        break
      }
      emit(classify(error, base))
    }
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
