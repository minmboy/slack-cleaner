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
}

export type ClampReason = 'ok' | 'not-restorable'

export function resolveStep(asked: Step, facts: RouteFacts): { step: Step; reason: ClampReason } {
  if (!facts.identity) return { step: 'connect', reason: asked === 'connect' ? 'ok' : 'not-restorable' }
  // A delete run is irreversible and must stay visible while it is happening.
  if (facts.running) return { step: 'run', reason: 'ok' }
  if (asked === 'connect') return { step: 'select', reason: 'ok' }
  if (asked === 'scan') {
    return facts.scanning ? { step: 'scan', reason: 'ok' } : { step: 'select', reason: 'not-restorable' }
  }
  if (asked === 'review') {
    return facts.scanCompleted
      ? { step: 'review', reason: 'ok' }
      : { step: 'select', reason: 'not-restorable' }
  }
  if (asked === 'run') {
    return facts.runStarted ? { step: 'run', reason: 'ok' } : { step: 'select', reason: 'not-restorable' }
  }
  return { step: 'select', reason: 'ok' }
}
