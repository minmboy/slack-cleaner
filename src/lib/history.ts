/**
 * Per-conversation scan and deletion history, kept in this browser.
 *
 * This is the one place the app persists anything about your conversations,
 * so it stores only what the picker needs: for each conversation, its ID, when
 * it was last scanned and how many of your messages that scan found, and when
 * messages were last deleted from it and how many in total. No names — the
 * picker knows them while you are connected — and never any message text.
 *
 * Keyed by workspace and user, so two accounts in one browser never mix.
 */

export interface ConversationHistory {
  /** ms epoch of the last completed scan that covered this conversation. */
  scannedAt?: number
  /** Your messages that scan found. */
  found?: number
  /** The scan-from date that scan used (`YYYY-MM-DD`), when it was limited. */
  since?: string
  /** ms epoch of the last real run that deleted messages here. */
  deletedAt?: number
  /** Messages deleted here by this tool, summed across runs. */
  deleted?: number
}

export type HistoryMap = Record<string, ConversationHistory>

const KEY = 'slack-message-manager:history'

interface Stored {
  v: 1
  accounts: Record<string, HistoryMap>
}

export const accountKey = (identity: { teamId: string; userId: string }) => `${identity.teamId}:${identity.userId}`

function readStored(): Stored {
  try {
    const raw = localStorage.getItem(KEY)
    if (!raw) return { v: 1, accounts: {} }
    const parsed = JSON.parse(raw) as Partial<Stored> | null
    if (parsed?.v !== 1 || typeof parsed.accounts !== 'object' || parsed.accounts === null) {
      return { v: 1, accounts: {} }
    }
    return { v: 1, accounts: parsed.accounts }
  } catch {
    // Blocked storage or a corrupted value: behave as if there were no history.
    return { v: 1, accounts: {} }
  }
}

function writeStored(stored: Stored): void {
  try {
    if (Object.keys(stored.accounts).length === 0) localStorage.removeItem(KEY)
    else localStorage.setItem(KEY, JSON.stringify(stored))
  } catch {
    // History is a convenience; failing to persist it must never break a scan or a run.
  }
}

export function loadHistory(account: string): HistoryMap {
  return readStored().accounts[account] ?? {}
}

export function saveHistory(account: string, map: HistoryMap): void {
  const stored = readStored()
  if (Object.keys(map).length === 0) delete stored.accounts[account]
  else stored.accounts[account] = map
  writeStored(stored)
}

export function clearHistory(account: string): void {
  saveHistory(account, {})
}

/** A completed scan: every conversation it covered, including those where it found nothing. */
export function recordScan(map: HistoryMap, found: Record<string, number>, since: string, at: number): HistoryMap {
  const next: HistoryMap = { ...map }
  for (const [id, count] of Object.entries(found)) {
    next[id] = { ...next[id], scannedAt: at, found: count, since: since || undefined }
  }
  return next
}

/** A real run: messages it deleted, per conversation. Totals accumulate across runs. */
export function recordDeletions(map: HistoryMap, deleted: Record<string, number>, at: number): HistoryMap {
  const next: HistoryMap = { ...map }
  for (const [id, count] of Object.entries(deleted)) {
    if (count <= 0) continue
    const prev = next[id] ?? {}
    next[id] = { ...prev, deletedAt: at, deleted: (prev.deleted ?? 0) + count }
  }
  return next
}
