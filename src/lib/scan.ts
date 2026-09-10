/**
 * Finds every message the authenticated user wrote in the selected conversations.
 *
 * `conversations.history` alone is not enough: it returns thread *roots* but not
 * their replies. So each root with `reply_count > 0` gets a `conversations.replies`
 * walk — including threads started by someone else, since my replies live there too.
 */
import { slackPaginate, type CallContext } from './slack'
import type { Conversation, ScanProgress, TargetFile, TargetMessage } from './types'

/** Page size. Slack caps history/replies at 1000, but 200 is the documented sweet spot. */
const PAGE_SIZE = 200

/**
 * Subtypes that are workspace events rather than something the user wrote, even
 * though Slack attributes them to a `user`. Everything else is let through.
 *
 * This is a denylist on purpose. An allowlist drops any subtype it has not heard
 * of — including new ones Slack adds — which would silently shrink the cleanup
 * while still reporting it complete. `chat.delete` is the real authority on what
 * may go, and a refusal is recorded as `cant_delete_message` rather than being
 * hidden.
 */
const SYSTEM_SUBTYPES = new Set([
  'channel_join',
  'channel_leave',
  'channel_topic',
  'channel_purpose',
  'channel_name',
  'channel_archive',
  'channel_unarchive',
  'group_join',
  'group_leave',
  'group_topic',
  'group_purpose',
  'group_name',
  'group_archive',
  'group_unarchive',
  'bot_message',
  'tombstone',
  'ekm_access_denied',
])

interface RawFile {
  id?: string
  name?: string
  title?: string
  /** Uploader. Only my own uploads are mine to delete. */
  user?: string
  /** 'tombstone' means the file is already gone. */
  mode?: string
}

interface RawMessage {
  type?: string
  subtype?: string
  user?: string
  bot_id?: string
  ts: string
  text?: string
  thread_ts?: string
  reply_count?: number
  files?: RawFile[]
}

export function isMine(raw: RawMessage, myUserId: string): boolean {
  if (raw.type !== 'message') return false
  if (raw.user !== myUserId) return false
  if (raw.bot_id) return false
  if (raw.subtype && SYSTEM_SUBTYPES.has(raw.subtype)) return false
  return true
}

/**
 * Files on this message that I uploaded. A file I merely re-shared belongs to
 * whoever uploaded it, and `files.delete` would refuse it anyway.
 */
function ownFiles(raw: RawMessage, channelId: string, myUserId: string): TargetFile[] {
  if (!Array.isArray(raw.files)) return []
  const out: TargetFile[] = []
  for (const file of raw.files) {
    if (!file?.id) continue
    if (file.user !== myUserId) continue
    if (file.mode === 'tombstone') continue
    out.push({ id: file.id, name: file.title || file.name || file.id, channelId })
  }
  return out
}

function toTarget(
  raw: RawMessage,
  channelId: string,
  isThreadParent: boolean,
  myUserId: string,
): TargetMessage {
  return {
    channelId,
    ts: raw.ts,
    threadTs: raw.thread_ts && raw.thread_ts !== raw.ts ? raw.thread_ts : undefined,
    isThreadParent,
    text: raw.text ?? '',
    files: ownFiles(raw, channelId, myUserId),
    hasFiles: Array.isArray(raw.files) && raw.files.length > 0,
    time: Math.floor(Number(raw.ts) * 1000),
  }
}

export interface ScanOptions {
  myUserId: string
  /**
   * Unix seconds; only messages after this are fetched. Saves API calls on long
   * histories, at a cost the UI states: `conversations.history` filters by root
   * timestamp, so a thread that started before the cutoff never surfaces and the
   * user's later replies inside it are not found.
   */
  oldest?: number
  latest?: number
  onProgress: (progress: ScanProgress) => void
  /** Fires once if Slack appears to be applying the throttled non-Marketplace app limits. */
  onThrottleSuspected?: () => void
}

export interface ScanReport {
  targets: TargetMessage[]
  /** Channels that failed outright, e.g. a missing history scope. */
  errors: { channelId: string; channelLabel: string; code: string }[]
}

export async function scanConversations(
  conversations: Conversation[],
  options: ScanOptions,
  ctx: CallContext,
): Promise<ScanReport> {
  const targets: TargetMessage[] = []
  const errors: ScanReport['errors'] = []
  let throttleReported = false

  for (const conversation of conversations) {
    const progress: ScanProgress = {
      channelId: conversation.id,
      channelLabel: conversation.label,
      messagesSeen: 0,
      threadsFound: 0,
      threadsDone: 0,
      mine: 0,
      done: false,
    }
    options.onProgress({ ...progress })

    /** Thread roots needing a `conversations.replies` walk. */
    const threadRoots: string[] = []
    /** ts values already staged, so a root seen in both walks is not double-counted. */
    const seen = new Set<string>()
    /** Consecutive history pages that came back at the throttled cap. */
    let cappedPageRun = 0

    try {
      const historyPages = slackPaginate<RawMessage>(
        'conversations.history',
        3,
        { channel: conversation.id, limit: PAGE_SIZE, oldest: options.oldest, latest: options.latest },
        'messages',
        ctx,
      )

      for await (const page of historyPages) {
        // One 15-message page just means a short conversation. Two in a row means
        // Slack is capping the page size, which is the signature of the stricter
        // limits it applies to distributed non-Marketplace apps.
        if (page.length === 15 && PAGE_SIZE > 15) cappedPageRun++
        else cappedPageRun = 0
        if (!throttleReported && cappedPageRun >= 2) {
          throttleReported = true
          options.onThrottleSuspected?.()
        }
        progress.messagesSeen += page.length

        for (const raw of page) {
          const hasThread = (raw.reply_count ?? 0) > 0
          if (hasThread) {
            threadRoots.push(raw.ts)
            progress.threadsFound++
          }
          if (isMine(raw, options.myUserId) && !seen.has(raw.ts)) {
            seen.add(raw.ts)
            targets.push(toTarget(raw, conversation.id, hasThread, options.myUserId))
            progress.mine++
          }
        }
        options.onProgress({ ...progress })
      }

      for (const rootTs of threadRoots) {
        const replyPages = slackPaginate<RawMessage>(
          'conversations.replies',
          3,
          { channel: conversation.id, ts: rootTs, limit: PAGE_SIZE },
          'messages',
          ctx,
        )
        for await (const page of replyPages) {
          for (const raw of page) {
            if (raw.ts === rootTs) continue // the root came from history already
            if (isMine(raw, options.myUserId) && !seen.has(raw.ts)) {
              seen.add(raw.ts)
              targets.push(toTarget(raw, conversation.id, false, options.myUserId))
              progress.mine++
            }
          }
        }
        progress.threadsDone++
        options.onProgress({ ...progress })
      }
    } catch (error) {
      if (error instanceof DOMException && error.name === 'AbortError') throw error
      const code = error instanceof Error && 'code' in error ? String(error.code) : 'unknown_error'
      errors.push({ channelId: conversation.id, channelLabel: conversation.label, code })
    }

    progress.done = true
    options.onProgress({ ...progress })
  }

  return { targets, errors }
}
