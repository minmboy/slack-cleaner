/**
 * Browser-only Slack Web API client.
 *
 * Two constraints drive the shape of this file:
 *
 * 1. CORS. `slack.com/api/*` returns `access-control-allow-origin: *`, but its
 *    `access-control-allow-headers` does NOT include `authorization`. So the token
 *    must travel in the request body, and we must never set a header that would
 *    trigger a preflight. Passing `URLSearchParams` as `body` makes fetch emit
 *    `content-type: application/x-www-form-urlencoded;charset=UTF-8`, which is
 *    CORS-safelisted -> no preflight -> the request goes through.
 *
 * 2. Rate limits. Slack paces per method tier. `retry-after` IS listed in
 *    `access-control-expose-headers`, so we can read it from JS on a 429.
 */

const API_BASE = 'https://slack.com/api/'

/** Minimum ms between request *starts* for each Slack rate-limit tier. */
const TIER_INTERVAL_MS: Record<number, number> = {
  1: 60_000, // 1+/min
  2: 3_200, // 20+/min
  3: 1_300, // 50+/min
  4: 700, // 100+/min
}

export type SlackTier = 1 | 2 | 3 | 4

export interface SlackOk {
  ok: true
  [key: string]: unknown
}

/** A Slack `{ok: false, error: "..."}` response. Not thrown for expected per-message failures. */
export class SlackApiError extends Error {
  readonly code: string
  readonly method: string
  readonly needed?: string

  constructor(code: string, method: string, needed?: string) {
    super(`${method} failed: ${code}${needed ? ` (needs scope: ${needed})` : ''}`)
    this.name = 'SlackApiError'
    this.code = code
    this.method = method
    this.needed = needed
  }
}

/** Network-level failure after all retries (offline, DNS, CORS block, 5xx). */
export class SlackTransportError extends Error {
  readonly method: string

  constructor(method: string, cause: unknown) {
    super(`${method} unreachable: ${cause instanceof Error ? cause.message : String(cause)}`)
    this.name = 'SlackTransportError'
    this.method = method
  }
}

const sleep = (ms: number, signal?: AbortSignal) =>
  new Promise<void>((resolve, reject) => {
    if (signal?.aborted) return reject(new DOMException('Aborted', 'AbortError'))
    const timer = setTimeout(() => {
      signal?.removeEventListener('abort', onAbort)
      resolve()
    }, ms)
    const onAbort = () => {
      clearTimeout(timer)
      reject(new DOMException('Aborted', 'AbortError'))
    }
    signal?.addEventListener('abort', onAbort, { once: true })
  })

/**
 * Serializes *acquisition* of a slot so request starts are spaced by `interval`.
 * Requests may still overlap in flight, which is fine — Slack meters arrivals.
 */
class TierGate {
  private nextAt = 0
  private tail: Promise<void> = Promise.resolve()
  private readonly interval: number

  constructor(interval: number) {
    this.interval = interval
  }

  async acquire(signal?: AbortSignal): Promise<void> {
    const mine = this.tail.then(async () => {
      const wait = this.nextAt - Date.now()
      if (wait > 0) await sleep(wait, signal)
      this.nextAt = Date.now() + this.interval
    })
    // Keep the chain alive even if a waiter aborts.
    this.tail = mine.catch(() => undefined)
    return mine
  }

  /** Push the next allowed start out, after Slack tells us to back off. */
  penalize(ms: number): void {
    this.nextAt = Math.max(this.nextAt, Date.now() + ms)
  }
}

/**
 * Slack applies rate limits per method, per workspace — not per tier — so each
 * method gets its own gate. That lets `conversations.history` and
 * `conversations.replies` interleave at full speed during a scan.
 */
const gates = new Map<string, TierGate>()
function gateFor(method: string, tier: SlackTier): TierGate {
  let gate = gates.get(method)
  if (!gate) {
    gate = new TierGate(TIER_INTERVAL_MS[tier])
    gates.set(method, gate)
  }
  return gate
}

export interface CallContext {
  token: string
  signal?: AbortSignal
  /** Fired when Slack rate-limits us, so the UI can show a countdown. */
  onRateLimit?: (info: { method: string; waitMs: number }) => void
}

const MAX_ATTEMPTS = 6
/** Slack errors worth retrying rather than surfacing. */
const TRANSIENT_CODES = new Set(['ratelimited', 'service_unavailable', 'internal_error', 'fatal_error'])

/**
 * Calls one Slack Web API method. Retries 429s using `Retry-After` and backs off
 * on transient failures. Resolves only on `ok: true`; anything else throws.
 */
export async function slackCall<T = SlackOk>(
  method: string,
  tier: SlackTier,
  params: Record<string, string | number | boolean | undefined>,
  ctx: CallContext,
): Promise<T> {
  const gate = gateFor(method, tier)
  let lastTransport: unknown

  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
    await gate.acquire(ctx.signal)

    const body = new URLSearchParams({ token: ctx.token })
    for (const [key, value] of Object.entries(params)) {
      if (value !== undefined) body.set(key, String(value))
    }

    let response: Response
    try {
      // No custom headers: a preflight would be rejected by Slack's CORS policy.
      response = await fetch(API_BASE + method, {
        method: 'POST',
        body,
        signal: ctx.signal,
      })
    } catch (cause) {
      if (cause instanceof DOMException && cause.name === 'AbortError') throw cause
      lastTransport = cause
      const backoff = Math.min(1_000 * 2 ** (attempt - 1), 15_000)
      await sleep(backoff, ctx.signal)
      continue
    }

    if (response.status === 429) {
      const header = Number(response.headers.get('retry-after'))
      const waitMs = (Number.isFinite(header) && header > 0 ? header : 30) * 1_000 + 500
      gate.penalize(waitMs)
      ctx.onRateLimit?.({ method, waitMs })
      await sleep(waitMs, ctx.signal)
      continue
    }

    if (response.status >= 500) {
      lastTransport = new Error(`HTTP ${response.status}`)
      await sleep(Math.min(1_000 * 2 ** (attempt - 1), 15_000), ctx.signal)
      continue
    }

    let payload: Record<string, unknown>
    try {
      payload = (await response.json()) as Record<string, unknown>
    } catch (cause) {
      lastTransport = cause
      await sleep(1_000 * attempt, ctx.signal)
      continue
    }

    if (payload.ok === true) return payload as unknown as T

    const code = typeof payload.error === 'string' ? payload.error : 'unknown_error'
    if (TRANSIENT_CODES.has(code) && attempt < MAX_ATTEMPTS) {
      const waitMs = code === 'ratelimited' ? 30_000 : 1_000 * 2 ** (attempt - 1)
      gate.penalize(waitMs)
      if (code === 'ratelimited') ctx.onRateLimit?.({ method, waitMs })
      await sleep(waitMs, ctx.signal)
      continue
    }
    throw new SlackApiError(code, method, typeof payload.needed === 'string' ? payload.needed : undefined)
  }

  throw new SlackTransportError(method, lastTransport ?? new Error('retries exhausted'))
}

/**
 * Walks a cursor-paginated method, yielding each page's array.
 * `onPage` lets callers stream progress instead of waiting for the whole walk.
 */
export async function* slackPaginate<Item>(
  method: string,
  tier: SlackTier,
  params: Record<string, string | number | boolean | undefined>,
  key: string,
  ctx: CallContext,
  maxPages = Infinity,
): AsyncGenerator<Item[]> {
  let cursor: string | undefined
  let pages = 0

  while (pages < maxPages) {
    const payload = await slackCall<Record<string, unknown>>(method, tier, { ...params, cursor }, ctx)
    const items = (payload[key] as Item[] | undefined) ?? []
    yield items
    pages++

    const meta = payload.response_metadata as { next_cursor?: string } | undefined
    cursor = meta?.next_cursor || undefined
    if (!cursor) return
  }
}
