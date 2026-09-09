import { useMemo, useState } from 'react'
import { useI18n } from '../i18n/context'
import { keyOf } from '../lib/format'
import type { TargetMessage } from '../lib/types'

interface Props {
  targets: TargetMessage[]
  labels: Map<string, string>
  /** Everything NOT in here is staged for deletion. */
  excluded: Set<string>
  onExcludedChange: (excluded: Set<string>) => void
  onBack: () => void
  onConfirm: () => void
}

interface Filters {
  text: string
  from: string
  to: string
  onlyThreads: boolean
  onlyFiles: boolean
}

const EMPTY_FILTERS: Filters = { text: '', from: '', to: '', onlyThreads: false, onlyFiles: false }

/** How many messages to render per channel before the "show more" button. Keeps huge scans responsive. */
const PAGE = 120

export function ReviewView({ targets, labels, excluded, onExcludedChange, onBack, onConfirm }: Props) {
  const { t, n, formatTime } = useI18n()
  const [filters, setFilters] = useState<Filters>(EMPTY_FILTERS)
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set())
  const [shown, setShown] = useState<Map<string, number>>(new Map())

  const filtered = useMemo(() => {
    const needle = filters.text.trim().toLowerCase()
    const fromMs = filters.from ? new Date(`${filters.from}T00:00:00`).getTime() : -Infinity
    const toMs = filters.to ? new Date(`${filters.to}T23:59:59`).getTime() : Infinity

    return targets.filter((target) => {
      if (needle && !target.text.toLowerCase().includes(needle)) return false
      if (target.time < fromMs || target.time > toMs) return false
      if (filters.onlyThreads && !target.threadTs && !target.isThreadParent) return false
      if (filters.onlyFiles && !target.hasFiles) return false
      return true
    })
  }, [targets, filters])

  const groups = useMemo(() => {
    const map = new Map<string, TargetMessage[]>()
    for (const target of filtered) {
      let bucket = map.get(target.channelId)
      if (!bucket) {
        bucket = []
        map.set(target.channelId, bucket)
      }
      bucket.push(target)
    }
    for (const bucket of map.values()) bucket.sort((a, b) => b.time - a.time)
    return [...map.entries()].sort((a, b) => b[1].length - a[1].length)
  }, [filtered])

  const selectedCount = targets.length - excluded.size
  const filteredSelected = filtered.reduce((sum, target) => (excluded.has(keyOf(target)) ? sum : sum + 1), 0)

  function setBulk(items: TargetMessage[], select: boolean) {
    const next = new Set(excluded)
    for (const target of items) {
      if (select) next.delete(keyOf(target))
      else next.add(keyOf(target))
    }
    onExcludedChange(next)
  }

  function toggleOne(target: TargetMessage) {
    const next = new Set(excluded)
    const key = keyOf(target)
    if (next.has(key)) next.delete(key)
    else next.add(key)
    onExcludedChange(next)
  }

  const filterActive = filtered.length !== targets.length

  return (
    <>
      <section className="panel">
        <header className="panel-head">
          <h2>{t.review.title}</h2>
          <div className="spacer" />
          <span className="hint">
            {t.review.found(n(targets.length))}
            {filterActive && t.review.filtered(n(filtered.length))}
          </span>
        </header>

        <div className="panel-body">
          <p className="note">
            {t.review.intro(<kbd>{t.review.badgeReply}</kbd>, <kbd>{t.review.badgeParent}</kbd>)}
          </p>

          <div className="row" style={{ marginBottom: 10 }}>
            <input
              className="input"
              style={{ flex: 2, minWidth: 180 }}
              placeholder={t.review.textPlaceholder}
              value={filters.text}
              onChange={(event) => setFilters({ ...filters, text: event.target.value })}
            />
            <input
              className="input"
              type="date"
              style={{ width: 160 }}
              value={filters.from}
              onChange={(event) => setFilters({ ...filters, from: event.target.value })}
            />
            <span className="hint">~</span>
            <input
              className="input"
              type="date"
              style={{ width: 160 }}
              value={filters.to}
              onChange={(event) => setFilters({ ...filters, to: event.target.value })}
            />
          </div>

          <div className="row">
            <label className="check">
              <input
                type="checkbox"
                checked={filters.onlyThreads}
                onChange={(event) => setFilters({ ...filters, onlyThreads: event.target.checked })}
              />
              {t.review.onlyThreads}
            </label>
            <label className="check">
              <input
                type="checkbox"
                checked={filters.onlyFiles}
                onChange={(event) => setFilters({ ...filters, onlyFiles: event.target.checked })}
              />
              {t.review.onlyFiles}
            </label>
            {filterActive && (
              <button className="btn ghost sm" onClick={() => setFilters(EMPTY_FILTERS)}>
                {t.review.resetFilters}
              </button>
            )}
          </div>
        </div>

        <div className="toolbar">
          <span className="hint" style={{ flex: 1 }}>
            {filterActive
              ? t.review.toolbarFiltered(n(filtered.length), n(filteredSelected))
              : t.review.toolbarAll(n(selectedCount))}
          </span>
          <button className="btn ghost sm" onClick={() => setBulk(filtered, true)}>
            {filterActive ? t.review.selectFiltered : t.review.selectAll}
          </button>
          <button className="btn ghost sm" onClick={() => setBulk(filtered, false)}>
            {filterActive ? t.review.deselectFiltered : t.review.deselectAll}
          </button>
        </div>

        <div className="list" style={{ maxHeight: 620 }}>
          {groups.length === 0 && <div className="empty">{t.review.emptyNone}</div>}

          {groups.map(([channelId, items]) => {
            const isCollapsed = collapsed.has(channelId)
            const limit = shown.get(channelId) ?? PAGE
            const groupSelected = items.reduce((sum, item) => (excluded.has(keyOf(item)) ? sum : sum + 1), 0)

            return (
              <div className="msg-group" key={channelId}>
                <div
                  className="msg-group-head"
                  onClick={() => {
                    const next = new Set(collapsed)
                    if (next.has(channelId)) next.delete(channelId)
                    else next.add(channelId)
                    setCollapsed(next)
                  }}
                >
                  <span style={{ color: 'var(--text-faint)', fontFamily: 'var(--mono)', fontSize: 10 }}>
                    {isCollapsed ? '▸' : '▾'}
                  </span>
                  <span className="title">{labels.get(channelId) ?? channelId}</span>
                  <span className="count">
                    {n(groupSelected)} / {n(items.length)}
                  </span>
                  <button
                    className="btn ghost sm"
                    onClick={(event) => {
                      event.stopPropagation()
                      setBulk(items, groupSelected !== items.length)
                    }}
                  >
                    {groupSelected === items.length ? t.review.groupDeselect : t.review.groupSelect}
                  </button>
                </div>

                {!isCollapsed &&
                  items.slice(0, limit).map((target) => {
                    const key = keyOf(target)
                    const on = !excluded.has(key)
                    return (
                      <label className="msg-row" key={key} data-on={on}>
                        <input type="checkbox" checked={on} onChange={() => toggleOne(target)} />
                        <span className="when">{formatTime(target.time)}</span>
                        <span className="body">
                          {target.threadTs && <span className="badge">{t.review.badgeReply}</span>}
                          {target.isThreadParent && <span className="badge">{t.review.badgeParent}</span>}
                          {target.hasFiles && <span className="badge">{t.review.badgeFiles}</span>}
                          {target.text.trim() || (
                            <em style={{ color: 'var(--text-faint)' }}>{t.review.noText}</em>
                          )}
                        </span>
                      </label>
                    )
                  })}

                {!isCollapsed && items.length > limit && (
                  <div style={{ padding: '9px 18px', borderTop: '1px solid var(--line)' }}>
                    <button
                      className="btn ghost sm"
                      onClick={() => setShown(new Map(shown).set(channelId, limit + PAGE * 4))}
                    >
                      {t.review.showMore(n(items.length - limit))}
                    </button>
                  </div>
                )}
              </div>
            )
          })}
        </div>
      </section>

      <div className="sticky-foot">
        <button className="btn ghost" onClick={onBack}>
          {t.review.backToSelect}
        </button>
        <div className="summary">{t.review.pending(<b>{n(selectedCount)}</b>)}</div>
        <button className="btn danger" disabled={selectedCount === 0} onClick={onConfirm}>
          {t.review.proceed}
        </button>
      </div>
    </>
  )
}
