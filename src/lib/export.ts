/**
 * Export of what is about to be deleted, and of what was deleted.
 *
 * Two shapes, because the two moments answer different questions. The review
 * export is a backup of message text taken *before* an irreversible operation;
 * the run export is an audit log of what Slack actually did.
 *
 * Message text does not reach either one by widening `DeleteResult` — the run
 * export joins results back onto the scanned targets in `App`, where both are
 * already in hand and `keyOf(target) === resultKey(result)`.
 */
import { keyOf, resultKey } from './format'
import type { DeleteResult, TargetMessage } from './types'

/**
 * Quote every cell: display names and error text can hold commas and quotes.
 *
 * Quoting stops a delimiter from splitting a cell; it does not stop Excel,
 * LibreOffice or Sheets from evaluating a cell that *starts* with a formula
 * character. Message text is written by whoever DMed you, and this file is
 * built to be opened in Excel (see the BOM below), so such a value gets a
 * leading apostrophe — shown, not run. The JSON exports stay byte-exact.
 */
const FORMULA_LEADER = /^[=+\-@\t\r]/
const cell = (value: string) => {
  const inert = FORMULA_LEADER.test(value) ? `'${value}` : value
  return `"${inert.replace(/"/g, '""')}"`
}

export function toCsv(header: string[], rows: string[][]): string {
  const lines = [header, ...rows].map((row) => row.map(cell).join(','))
  // The BOM keeps Excel from mangling non-ASCII names and message text.
  return `﻿${lines.join('\r\n')}`
}

/**
 * Hands the file to the browser. The anchor is attached before the click and
 * the object URL released a turn later: a detached anchor plus a same-task
 * revoke can leave the browser with nothing to fetch.
 *
 * Call only from a click handler — a download started from an effect is
 * treated as an unrequested popup.
 */
export function downloadBlob(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob)
  const anchor = document.createElement('a')
  anchor.href = url
  anchor.download = filename
  anchor.style.display = 'none'
  document.body.appendChild(anchor)
  anchor.click()
  setTimeout(() => {
    anchor.remove()
    URL.revokeObjectURL(url)
  }, 0)
}

export type ExportFormat = 'csv' | 'json'

/** `slack-message-manager-review-20260910T053400.csv` */
export function exportFilename(kind: 'review' | 'results', format: ExportFormat, now: Date): string {
  const stamp = now.toISOString().slice(0, 19).replace(/[:-]/g, '')
  return `slack-message-manager-${kind}-${stamp}.${format}`
}

const iso = (ms: number) => new Date(ms).toISOString()
const bool = (value: boolean) => (value ? 'true' : 'false')

// ---------------------------------------------------------------- review

const REVIEW_HEADER = [
  'channel_id',
  'channel_label',
  'ts',
  'iso_time',
  'is_thread_reply',
  'is_thread_parent',
  'has_files',
  'own_file_count',
  'text',
]

function reviewRow(target: TargetMessage, labels: Map<string, string>): string[] {
  return [
    target.channelId,
    labels.get(target.channelId) ?? '',
    target.ts,
    iso(target.time),
    bool(Boolean(target.threadTs)),
    bool(target.isThreadParent),
    bool(target.hasFiles),
    String(target.files.length),
    target.text,
  ]
}

/** The staged set, exported before anything is deleted. This is the backup. */
export function reviewExport(
  staged: TargetMessage[],
  labels: Map<string, string>,
  format: ExportFormat,
): Blob {
  if (format === 'json') {
    const payload = {
      kind: 'slack-message-manager-review',
      messageCount: staged.length,
      messages: staged.map((target) => ({
        channelId: target.channelId,
        channelLabel: labels.get(target.channelId) ?? null,
        ts: target.ts,
        isoTime: iso(target.time),
        threadTs: target.threadTs ?? null,
        isThreadParent: target.isThreadParent,
        hasFiles: target.hasFiles,
        ownFiles: target.files.map((file) => ({ id: file.id, name: file.name })),
        text: target.text,
      })),
    }
    return new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json;charset=utf-8' })
  }
  const rows = staged.map((target) => reviewRow(target, labels))
  return new Blob([toCsv(REVIEW_HEADER, rows)], { type: 'text/csv;charset=utf-8' })
}

// ---------------------------------------------------------------- results

const RESULT_HEADER = [
  'kind',
  /**
   * Messages are deleted from one conversation; a file is a workspace-level
   * object that `files.delete` removes from everywhere it was shared. Without
   * this column the channel columns on a file row read as "deleted from here",
   * which understates what happened.
   */
  'scope',
  'channel_id',
  'channel_label',
  'target_id',
  'target_label',
  'iso_time',
  'is_thread_reply',
  'is_thread_parent',
  'had_files',
  'text',
  'outcome',
  'error_code',
]

function resultRow(
  result: DeleteResult,
  target: TargetMessage | undefined,
  labels: Map<string, string>,
): string[] {
  const isFile = result.kind === 'file'
  return [
    result.kind,
    isFile ? 'workspace' : 'conversation',
    result.channelId,
    labels.get(result.channelId) ?? '',
    result.id,
    result.label ?? '',
    target ? iso(target.time) : '',
    target ? bool(Boolean(target.threadTs)) : '',
    target ? bool(target.isThreadParent) : '',
    target ? bool(target.hasFiles) : '',
    target?.text ?? '',
    result.outcome,
    result.errorCode ?? '',
  ]
}

/**
 * The audit log. `targets` is joined in so the export carries the text of every
 * message that was removed — the results themselves never hold it.
 */
export function resultsExport(
  results: DeleteResult[],
  targets: TargetMessage[],
  labels: Map<string, string>,
  format: ExportFormat,
): Blob {
  const byKey = new Map(targets.map((target) => [keyOf(target), target]))
  const lookup = (result: DeleteResult) =>
    result.kind === 'message' ? byKey.get(resultKey(result)) : undefined

  if (format === 'json') {
    const payload = {
      kind: 'slack-message-manager-results',
      total: results.length,
      results: results.map((result) => {
        const target = lookup(result)
        return {
          kind: result.kind,
          scope: result.kind === 'file' ? 'workspace' : 'conversation',
          channelId: result.channelId,
          channelLabel: labels.get(result.channelId) ?? null,
          targetId: result.id,
          targetLabel: result.label ?? null,
          isoTime: target ? iso(target.time) : null,
          threadTs: target?.threadTs ?? null,
          isThreadParent: target?.isThreadParent ?? null,
          hadFiles: target?.hasFiles ?? null,
          text: target?.text ?? null,
          outcome: result.outcome,
          errorCode: result.errorCode ?? null,
        }
      }),
    }
    return new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json;charset=utf-8' })
  }
  const rows = results.map((result) => resultRow(result, lookup(result), labels))
  return new Blob([toCsv(RESULT_HEADER, rows)], { type: 'text/csv;charset=utf-8' })
}
