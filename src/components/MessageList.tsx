import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useI18n } from '../i18n/context'
import { keyOf } from '../lib/format'
import type { TargetMessage } from '../lib/types'

/**
 * Windowed message list.
 *
 * A scan routinely returns thousands of messages. Rendering them all is slow;
 * rendering a slice with a "show more" button hides the rest behind a control
 * buried at the bottom of an inner scrollbox, which reads as "the list is
 * broken". So: every row is reachable by ordinary scrolling, and only the
 * visible ones exist in the DOM.
 *
 * Row heights are PINNED in CSS rather than measured — see `--row-h` /
 * `--head-h`. That makes every offset pure arithmetic, which matters because
 * this is the screen where someone verifies an irreversible deletion: a
 * measurement that drifts would desync the scrollbar from the content.
 *
 * Heads and rows are different heights, so offsets come from a prefix sum
 * rather than `index * ROW_H`, which would drift by (headH - rowH) per group.
 */

/** Must match `--row-h` and `--head-h` in index.css. */
const ROW_H = 54
const HEAD_H = 49

/** Rows kept mounted beyond the viewport, so a fast scroll does not flash blank. */
const OVERSCAN = 8

/**
 * Below this many rows, render everything. Small scans then behave exactly as
 * they did before — and, more importantly, browser find-in-page keeps working
 * on the screen where the user checks what is about to be deleted.
 */
const VIRTUALIZE_ABOVE = 400

const MIN_HEIGHT = 480
/** Space left under the list for the sticky footer when it cannot be measured. */
const FOOTER_RESERVE = 132

type Row =
  | { type: 'head'; channelId: string; items: TargetMessage[] }
  /** `ordinal` is the 1-based position among messages only, for the readout. */
  | { type: 'msg'; channelId: string; target: TargetMessage; ordinal: number }

/** Largest `i` with `offsets[i] <= y`. */
function locate(offsets: number[], y: number): number {
  let lo = 0
  let hi = offsets.length - 1
  while (lo < hi) {
    const mid = (lo + hi + 1) >> 1
    if (offsets[mid] <= y) lo = mid
    else hi = mid - 1
  }
  return lo
}

/** Fill the space actually left below the toolbar instead of a magic 620px. */
function useFillHeight(ref: React.RefObject<HTMLDivElement | null>): number {
  const [height, setHeight] = useState(0)

  useEffect(() => {
    const element = ref.current
    if (!element) return
    const measure = () => {
      // Document space, so a scrolled page cannot feed back into the result.
      const top = element.getBoundingClientRect().top + window.scrollY
      const next = Math.round(window.innerHeight - top - FOOTER_RESERVE)
      setHeight(Math.max(MIN_HEIGHT, next))
    }
    measure()
    window.addEventListener('resize', measure)
    return () => window.removeEventListener('resize', measure)
  }, [ref])

  return height
}

interface Props {
  /** Already filtered and sorted by the caller. */
  groups: [string, TargetMessage[]][]
  labels: Map<string, string>
  excluded: Set<string>
  onToggle: (target: TargetMessage) => void
  onBulk: (items: TargetMessage[], select: boolean) => void
  empty: string
}

export function MessageList({ groups, labels, excluded, onToggle, onBulk, empty }: Props) {
  const { t, n, formatTime } = useI18n()
  const scrollerRef = useRef<HTMLDivElement>(null)
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set())
  const [scrollTop, setScrollTop] = useState(0)

  const height = useFillHeight(scrollerRef)

  const rows = useMemo<Row[]>(() => {
    const out: Row[] = []
    let ordinal = 0
    for (const [channelId, items] of groups) {
      out.push({ type: 'head', channelId, items })
      if (!collapsed.has(channelId)) {
        for (const target of items) out.push({ type: 'msg', channelId, target, ordinal: ++ordinal })
      }
    }
    return out
  }, [groups, collapsed])

  /** offsets[i] is the y of row i; offsets[rows.length] is the total height. */
  const offsets = useMemo(() => {
    const out = new Array<number>(rows.length + 1)
    out[0] = 0
    for (let i = 0; i < rows.length; i++) {
      out[i + 1] = out[i] + (rows[i].type === 'head' ? HEAD_H : ROW_H)
    }
    return out
  }, [rows])

  /**
   * Selected counts per group, computed once per `excluded` change. The header
   * MUST report its whole group, never the rendered window — a header that
   * counted only mounted rows would misstate what the group's button acts on.
   */
  const selectedPerGroup = useMemo(() => {
    const out = new Map<string, number>()
    for (const [channelId, items] of groups) {
      let count = 0
      for (const item of items) if (!excluded.has(keyOf(item))) count++
      out.set(channelId, count)
    }
    return out
  }, [groups, excluded])

  const virtualize = rows.length > VIRTUALIZE_ABOVE && height > 0
  const total = offsets[rows.length]

  const [start, end] = useMemo(() => {
    if (!virtualize) return [0, rows.length]
    const first = Math.max(0, locate(offsets, scrollTop) - OVERSCAN)
    const last = Math.min(rows.length, locate(offsets, scrollTop + height) + 1 + OVERSCAN)
    return [first, last]
  }, [virtualize, offsets, scrollTop, height, rows.length])

  const onScroll = useCallback(() => {
    const element = scrollerRef.current
    if (element) setScrollTop(element.scrollTop)
  }, [])

  const toggleGroup = useCallback((channelId: string) => {
    setCollapsed((prev) => {
      const next = new Set(prev)
      if (next.has(channelId)) next.delete(channelId)
      else next.add(channelId)
      return next
    })
  }, [])

  /** The group the viewport is currently inside, pinned above the scroller. */
  const currentGroup = rows[start]?.channelId ?? groups[0]?.[0]

  /** Message ordinals bounding the window, so the readout counts content only. */
  const visibleMessages = useMemo(() => {
    let first = 0
    let last = 0
    for (let i = start; i < end; i++) {
      const row = rows[i]
      if (row.type !== 'msg') continue
      if (!first) first = row.ordinal
      last = row.ordinal
    }
    const totalMessages = groups.reduce((sum, [, items]) => sum + items.length, 0)
    return { first, last, totalMessages }
  }, [rows, start, end, groups])

  if (groups.length === 0) {
    return (
      <div className="list-shell">
        <div className="empty">{empty}</div>
      </div>
    )
  }

  const slice = rows.slice(start, end)

  return (
    <div className="list-shell">
      {virtualize && currentGroup && (
        <div className="list-pinned">
          <span className="title">{labels.get(currentGroup) ?? currentGroup}</span>
          <span className="count">
            {t.review.listPosition(
              n(visibleMessages.first),
              n(visibleMessages.last),
              n(visibleMessages.totalMessages),
            )}
          </span>
        </div>
      )}

      <div
        className="list"
        ref={scrollerRef}
        onScroll={onScroll}
        style={virtualize ? { height, maxHeight: 'none' } : undefined}
        role="group"
        aria-label={t.review.listLabel}
      >
        {virtualize && <div style={{ height: offsets[start] }} aria-hidden="true" />}

        {slice.map((row, index) => {
          if (row.type === 'head') {
            const items = row.items
            const groupSelected = selectedPerGroup.get(row.channelId) ?? 0
            return (
              <div
                className="msg-group-head"
                key={`head:${row.channelId}`}
                onClick={() => toggleGroup(row.channelId)}
              >
                <span className="caret">{collapsed.has(row.channelId) ? '▸' : '▾'}</span>
                <span className="title">{labels.get(row.channelId) ?? row.channelId}</span>
                <span className="count">
                  {n(groupSelected)} / {n(items.length)}
                </span>
                <button
                  className="btn ghost sm"
                  onClick={(event) => {
                    event.stopPropagation()
                    onBulk(items, groupSelected !== items.length)
                  }}
                >
                  {groupSelected === items.length ? t.review.groupDeselect : t.review.groupSelect}
                </button>
              </div>
            )
          }

          const target = row.target
          const key = keyOf(target)
          const on = !excluded.has(key)
          return (
            <label className="msg-row" key={key} data-on={on} data-index={start + index}>
              <input type="checkbox" checked={on} onChange={() => onToggle(target)} />
              <span className="when">{formatTime(target.time)}</span>
              <span className="body">
                {target.threadTs && <span className="badge">{t.review.badgeReply}</span>}
                {target.isThreadParent && <span className="badge">{t.review.badgeParent}</span>}
                {target.hasFiles && <span className="badge">{t.review.badgeFiles}</span>}
                {target.text.trim() || <em style={{ color: 'var(--text-faint)' }}>{t.review.noText}</em>}
              </span>
            </label>
          )
        })}

        {virtualize && <div style={{ height: total - offsets[end] }} aria-hidden="true" />}
      </div>
    </div>
  )
}
