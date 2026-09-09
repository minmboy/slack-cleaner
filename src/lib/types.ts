export interface Identity {
  userId: string
  teamId: string
  userName: string
  teamName: string
  teamUrl: string
}

export type ConversationKind = 'im' | 'mpim' | 'private_channel' | 'public_channel'

export interface Conversation {
  id: string
  kind: ConversationKind
  /** For an `im`, the other person's user ID. */
  partnerId?: string
  /** Resolved label. Falls back to the raw ID until `users.list` catches up. */
  label: string
  /** True once we have a real name rather than a placeholder ID. */
  labelResolved: boolean
  isArchived?: boolean
}

export interface SlackUser {
  id: string
  displayName: string
  realName: string
  isBot: boolean
  isDeleted: boolean
}

/** One of my own messages, staged for deletion. */
export interface TargetMessage {
  channelId: string
  /** Unique within a channel; the delete key. */
  ts: string
  /** Set when this message lives inside a thread. */
  threadTs?: string
  /** True when this message is itself a thread's root. */
  isThreadParent: boolean
  text: string
  hasFiles: boolean
  /** ms epoch, derived from `ts`. */
  time: number
}

export type DeleteOutcome =
  | 'deleted'
  /** `message_not_found` — already gone, so the end state is what we wanted. */
  | 'already_gone'
  /** `cant_delete_message` — workspace policy or message type forbids it. */
  | 'not_allowed'
  | 'failed'
  | 'skipped'

export interface DeleteResult {
  channelId: string
  ts: string
  outcome: DeleteOutcome
  errorCode?: string
}

export interface ScanProgress {
  channelId: string
  channelLabel: string
  messagesSeen: number
  threadsFound: number
  threadsDone: number
  mine: number
  done: boolean
}
