import { useCallback, useLayoutEffect, useMemo, useRef, useState } from 'react'
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
 * Row and head heights are fixed and applied inline from ROW_H / HEAD_H, so the
 * numbers the offsets are computed from are the numbers the boxes are drawn
 * with. There is no second copy in the stylesheet to drift out of step — which
 * matters because this is the screen where someone verifies an irreversible
 * deletion, and a drifting offset would desync the scrollbar from the content.
 *
 * Heads and rows are different heights, so offsets come from a prefix sum
 * rather than `index * ROW_H`, which would drift by (headH - rowH) per group.
 */

/**
 * Two lines of 12.5px text at line-height 1.55 take 38.75px; with 16px of
 * vertical padding and the 1px top border that is 55.75px. 56 fits the
 * two-line clamp without shaving the descenders off the second line.
 */
const ROW_H = 56
const HEAD_H = 49

/** Rows kept mounted beyond the viewport, so a fast scroll does not flash blank. */
const OVERSCAN = 8

/**
 * Below this many rows, render everything. Small scans then behave exactly as
 * they did before — and browser find-in-page keeps working on the screen where
 * the user checks what is about to be deleted.
 */
const VIRTUALIZE_ABOVE = 400

const MIN_HEIGHT = 480
/** Space left under the list for the sticky footer. */
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

/**
 * Fill the space actually left below the toolbar instead of a magic 620px.
 *
 * Seeded rather than 0 and measured before paint: the window reads this on the
 * very first render, and a 0 there would mount every row once before an effect
 * corrected it. Re-measured when the panel above changes height — the filter's
 * reset button appearing, a note wrapping, the pinned bar arriving — not only
 * when the window is resized.
 */
function useFillHeight(ref: React.RefObject<HTMLDivElement | null>, remeasureOn: unknown): number {
  const [height, setHeight] = useState(MIN_HEIGHT)

  useLayoutEffect(() => {
    const element = ref.current
    if (!element) return
    const measure = () => {
      // Document space, so a scrolled page cannot feed back into the result.
      const top = element.getBoundingClientRect().top + window.scrollY
      const next = Math.max(MIN_HEIGHT, Math.round(window.innerHeight - top - FOOTER_RESERVE))
      setHeight((prev) => (prev === next ? prev : next))
    }
    measure()
    window.addEventListener('resize', measure)
    const panel = element.closest('.panel')
    const observer = panel && typeof ResizeObserver !== 'undefined' ? new ResizeObserver(measure) : null
    if (panel && observer) observer.observe(panel)
    return () => {
      window.removeEventListener('resize', measure)
      observer?.disconnect()
    }
  }, [ref, remeasureOn])

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
  /** Whether focus was last inside the list — see the focus-keeping effect. */
  const focusWithinRef = useRef(false)
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set())
  const [scrollTop, setScrollTop] = useState(0)

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

  const totalMessages = useMemo(() => groups.reduce((sum, [, items]) => sum + items.length, 0), [groups])

  const virtualize = rows.length > VIRTUALIZE_ABOVE
  const height = useFillHeight(scrollerRef, virtualize)
  const total = offsets[rows.length]

  // The list can shrink under a deep scroll position — a filter, a collapse —
  // and the browser clamps the element without necessarily firing a scroll
  // event. Read the real position back whenever the list changes shape, so the
  // window is never computed from a position the element is not at.
  useLayoutEffect(() => {
    const element = scrollerRef.current
    if (element) setScrollTop(element.scrollTop)
  }, [rows])

  /** Scroll position, clamped to what the current list can actually reach. */
  const y = Math.min(scrollTop, Math.max(0, total - height))

  const [start, end] = useMemo(() => {
    if (!virtualize) return [0, rows.length]
    const first = Math.max(0, locate(offsets, y) - OVERSCAN)
    const last = Math.min(rows.length, locate(offsets, y + height) + 1 + OVERSCAN)
    return [first, last]
  }, [virtualize, offsets, y, height, rows.length])

  /** Rows actually on screen — distinct from [start, end), which overscans. */
  const [firstVisible, lastVisible] = useMemo(() => {
    const max = rows.length - 1
    if (max < 0) return [0, -1]
    return [Math.min(locate(offsets, y), max), Math.min(locate(offsets, y + height - 1), max)]
  }, [offsets, y, height, rows.length])

  /** The group the viewport is inside, pinned above the scroller. */
  const currentGroup = rows[firstVisible]?.channelId ?? groups[0]?.[0]

  /** Message ordinals on screen, so the readout counts content, not heads. */
  const visibleMessages = useMemo(() => {
    let first = 0
    let last = 0
    for (let i = firstVisible; i <= lastVisible; i++) {
      const row = rows[i]
      if (row?.type !== 'msg') continue
      if (!first) first = row.ordinal
      last = row.ordinal
    }
    return { first, last }
  }, [rows, firstVisible, lastVisible])

  // Rows outside the window are unmounted, so an ordinary wheel scroll can
  // destroy the focused checkbox and drop focus to <body>, sending the next Tab
  // back to the top of the page. Keep focus in the list instead.
  useLayoutEffect(() => {
    const element = scrollerRef.current
    if (!element || !focusWithinRef.current) return
    if (!element.contains(document.activeElement)) element.focus({ preventScroll: true })
  })

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

  const slice = rows.slice(start, end)

  return (
    <div className="list-shell">
      {virtualize && currentGroup && (
        <div className="list-pinned">
          <span className="title">{labels.get(currentGroup) ?? currentGroup}</span>
          <span className="count">
            {t.review.listPosition(n(visibleMessages.first), n(visibleMessages.last), n(totalMessages))}
          </span>
        </div>
      )}

      {/* Always mounted, even when empty: a recreated scroller starts at 0 while
          the remembered position does not, which would window the wrong rows. */}
      <div
        className="list"
        ref={scrollerRef}
        tabIndex={0}
        onScroll={onScroll}
        onFocus={() => {
          focusWithinRef.current = true
        }}
        onBlur={(event) => {
          if (!event.currentTarget.contains(event.relatedTarget)) focusWithinRef.current = false
        }}
        style={virtualize ? { height, maxHeight: 'none' } : undefined}
        data-virtualized={virtualize || undefined}
        role="group"
        aria-label={t.review.listLabel}
      >
        {groups.length === 0 && <div className="empty">{empty}</div>}

        {virtualize && <div style={{ height: offsets[start] }} aria-hidden="true" />}

        {slice.map((row, index) => {
          if (row.type === 'head') {
            const items = row.items
            const groupSelected = selectedPerGroup.get(row.channelId) ?? 0
            const open = !collapsed.has(row.channelId)
            return (
              <div className="msg-group-head" key={`head:${row.channelId}`} style={{ height: HEAD_H }}>
                <button
                  type="button"
                  className="head-toggle"
                  aria-expanded={open}
                  onClick={() => toggleGroup(row.channelId)}
                >
                  <span className="caret" aria-hidden="true">
                    {open ? '▾' : '▸'}
                  </span>
                  <span className="title">{labels.get(row.channelId) ?? row.channelId}</span>
                </button>
                <span className="count">
                  {n(groupSelected)} / {n(items.length)}
                </span>
                <button
                  type="button"
                  className="btn ghost sm"
                  onClick={() => onBulk(items, groupSelected !== items.length)}
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
            <label
              className="msg-row"
              key={key}
              style={{ height: ROW_H }}
              data-on={on}
              data-index={start + index}
            >
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
