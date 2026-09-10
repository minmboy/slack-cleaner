import { useCallback, useMemo, useState } from 'react'
import { useI18n } from '../i18n/context'
import { reviewExport } from '../lib/export'
import { keyOf } from '../lib/format'
import type { TargetMessage } from '../lib/types'
import { ExportButtons } from './ExportButtons'
import { MessageList } from './MessageList'

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

export function ReviewView({ targets, labels, excluded, onExcludedChange, onBack, onConfirm }: Props) {
  const { t, n } = useI18n()
  const [filters, setFilters] = useState<Filters>(EMPTY_FILTERS)

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

  const setBulk = useCallback(
    (items: TargetMessage[], select: boolean) => {
      const next = new Set(excluded)
      for (const target of items) {
        if (select) next.delete(keyOf(target))
        else next.add(keyOf(target))
      }
      onExcludedChange(next)
    },
    [excluded, onExcludedChange],
  )

  const toggleOne = useCallback(
    (target: TargetMessage) => {
      const next = new Set(excluded)
      const key = keyOf(target)
      if (next.has(key)) next.delete(key)
      else next.add(key)
      onExcludedChange(next)
    },
    [excluded, onExcludedChange],
  )

  // Derived from the inputs, not from the result count: a filter that happens to
  // match everything is still active, and the reset button has to stay reachable.
  const staged = useMemo(() => targets.filter((target) => !excluded.has(keyOf(target))), [targets, excluded])

  const filterActive =
    filters.text.trim() !== '' ||
    filters.from !== '' ||
    filters.to !== '' ||
    filters.onlyThreads ||
    filters.onlyFiles

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
          <p className="note warn">{t.export.containsText}</p>

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
          <ExportButtons
            label={t.export.listLabel}
            kind="review"
            disabled={staged.length === 0}
            build={(format) => reviewExport(staged, labels, format)}
          />
        </div>

        <MessageList
          groups={groups}
          labels={labels}
          excluded={excluded}
          onToggle={toggleOne}
          onBulk={setBulk}
          empty={t.review.emptyNone}
        />
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
