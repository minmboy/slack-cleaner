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

/** A file I uploaded, attached to one of my messages. */
export interface TargetFile {
  /** Slack file id; the `files.delete` key. */
  id: string
  name: string
  /** The conversation the sharing message lives in. Display only — files are global. */
  channelId: string
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
  /** Files on this message that I uploaded, so they are mine to delete. */
  files: TargetFile[]
  /** True when the message carries any attachment, mine or not. */
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
  /** Messages and files are deleted by different methods and reported separately. */
  kind: 'message' | 'file'
  channelId: string
  /** A message timestamp, or a file id when `kind` is 'file'. */
  id: string
  /** File name, for the failure table. */
  label?: string
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
