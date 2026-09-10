/** Pure URL ↔ view-state mapping. No React, no DOM. */
import type { ConversationKind } from './types'

export type Step = 'connect' | 'select' | 'scan' | 'review' | 'run'

export const STEP_IDS: Step[] = ['connect', 'select', 'scan', 'review', 'run']

const KINDS: ConversationKind[] = ['im', 'mpim', 'private_channel', 'public_channel']

export interface Route {
  step: Step
  kinds: ConversationKind[]
}

function isStep(value: string): value is Step {
  return (STEP_IDS as string[]).includes(value)
}

/**
 * Order-stable, deduped, never empty — an empty list would walk every public
 * channel and render nothing, since listConversations drops rows whose kind was
 * not asked for.
 *
 * `clamped` reports that something was *dropped or defaulted*, not that the
 * order was normalised: a reorder is not worth interrupting the user over.
 */
export function canonicalKinds(raw: string | null): { kinds: ConversationKind[]; clamped: boolean } {
  if (raw === null) return { kinds: ['im'], clamped: false }
  const asked = raw
    .split(',')
    .map((part) => part.trim())
    .filter(Boolean)
  const known = asked.filter((part): part is ConversationKind => (KINDS as string[]).includes(part))
  const kinds = KINDS.filter((kind) => known.includes(kind))
  if (kinds.length === 0) return { kinds: ['im'], clamped: true }
  const dropped = known.length !== asked.length
  const duplicated = known.length !== kinds.length
  return { kinds, clamped: dropped || duplicated }
}

export function parseRoute(hash: string): { route: Route; kindsClamped: boolean } {
  const [path, query] = hash.replace(/^\//, '').split('?')
  const params = new URLSearchParams(query ?? '')
  const { kinds, clamped } = canonicalKinds(params.get('kinds'))
  return {
    route: { step: isStep(path) ? path : 'connect', kinds },
    kindsClamped: clamped,
  }
}

export function formatRoute(route: Route): string {
  // Only the conversation kinds round-trip. Conversation ids would run to
  // thousands of characters, and review filters and the token never belong here.
  // On `connect` there is nothing to filter yet, so the parameter is noise.
  const value = route.kinds.join(',')
  const carry = route.step !== 'connect' && value !== 'im'
  // Written by hand rather than via URLSearchParams: a comma is legal unencoded
  // in a query, and `%2C` makes a URL meant to be read and shared unreadable.
  return `/${route.step}${carry ? `?kinds=${value}` : ''}`
}

/**
 * What the address bar asks for, reduced to what memory can actually support.
 *
 * Scan results are deliberately never persisted, so a reload cannot land on a
 * review screen — an empty list there would read as "nothing to delete", which
 * is the worst possible lie on this app's screens.
 */
export interface RouteFacts {
  identity: boolean
  running: boolean
  scanning: boolean
  scanCompleted: boolean
  runStarted: boolean
  /**
   * A run that was not a dry run has started. It consumed the staged set, but
   * the review list still holds the pre-run staging: re-showing it would offer
   * deleted messages as "staged for deletion", and confirming again would
   * replace the only record of what went.
   */
  runDestructive: boolean
}

export type ClampReason = 'ok' | 'not-restorable'

const ok = (step: Step): { step: Step; reason: ClampReason } => ({ step, reason: 'ok' })
const lost = (): { step: Step; reason: ClampReason } => ({ step: 'select', reason: 'not-restorable' })

export function resolveStep(asked: Step, facts: RouteFacts): { step: Step; reason: ClampReason } {
  if (!facts.identity) {
    // Only a screen that needed scan data is worth explaining; a bookmarked
    // picker simply asks for the token again.
    const neededData = asked === 'scan' || asked === 'review' || asked === 'run'
    return { step: 'connect', reason: neededData ? 'not-restorable' : 'ok' }
  }
  // A delete run is irreversible and must stay visible while it is happening.
  if (facts.running) return ok('run')
  if (asked === 'connect' || asked === 'select') return ok('select')

  // Asking for an earlier screen of a flow that has moved on lands on the
  // furthest screen that still tells the truth, never on a stale one.
  if (asked === 'scan') {
    if (facts.scanning) return ok('scan')
    if (facts.runDestructive) return ok('run')
    return facts.scanCompleted ? ok('review') : lost()
  }
  if (asked === 'review') {
    if (facts.runDestructive) return ok('run')
    return facts.scanCompleted ? ok('review') : lost()
  }
  return facts.runStarted || facts.runDestructive ? ok('run') : lost()
}
