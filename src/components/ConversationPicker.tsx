import { useMemo, useState } from 'react'
import { useI18n } from '../i18n/context'
import { CONVERSATION_TYPES } from '../lib/api'
import type { Conversation, ConversationKind } from '../lib/types'

interface Props {
  conversations: Conversation[]
  loading: boolean
  namesPending: number
  kinds: ConversationKind[]
  selected: Set<string>
  scanFrom: string
  onKindsChange: (kinds: ConversationKind[]) => void
  onSelectedChange: (selected: Set<string>) => void
  onScanFromChange: (value: string) => void
  onScan: () => void
}

export function ConversationPicker({
  conversations,
  loading,
  namesPending,
  kinds,
  selected,
  scanFrom,
  onKindsChange,
  onSelectedChange,
  onScanFromChange,
  onScan,
}: Props) {
  const { t, n } = useI18n()
  const [query, setQuery] = useState('')

  const visible = useMemo(() => {
    const needle = query.trim().toLowerCase()
    const rows = conversations.filter(
      (item) => !needle || item.label.toLowerCase().includes(needle) || item.id.toLowerCase().includes(needle),
    )
    // Unresolved names sink to the bottom so the useful rows are reachable first.
    return rows.sort((a, b) => {
      if (a.labelResolved !== b.labelResolved) return a.labelResolved ? -1 : 1
      return a.label.localeCompare(b.label, t.locale)
    })
  }, [conversations, query, t.locale])

  function toggle(id: string) {
    const next = new Set(selected)
    if (next.has(id)) next.delete(id)
    else next.add(id)
    onSelectedChange(next)
  }

  function toggleKind(kind: ConversationKind) {
    const next = kinds.includes(kind) ? kinds.filter((item) => item !== kind) : [...kinds, kind]
    if (next.length > 0) onKindsChange(next)
  }

  const allVisibleOn = visible.length > 0 && visible.every((item) => selected.has(item.id))

  return (
    <>
      <section className="panel">
        <header className="panel-head">
          <h2>{t.picker.title}</h2>
          <div className="spacer" />
          <span className="hint">
            {loading ? t.picker.loading : t.picker.count(n(conversations.length))}
            {namesPending > 0 && t.picker.namesPending(n(namesPending))}
          </span>
        </header>

        <div className="panel-body">
          <div className="row" style={{ marginBottom: 14 }}>
            <span className="hint" style={{ minWidth: 62 }}>
              {t.picker.kindsLabel}
            </span>
            <div className="chip-group">
              {CONVERSATION_TYPES.map((type) => (
                <button
                  key={type.kind}
                  type="button"
                  className="chip"
                  data-on={kinds.includes(type.kind)}
                  onClick={() => toggleKind(type.kind)}
                  title={t.picker.scopeTip(type.scopes.join(', '))}
                >
                  {t.kind.long[type.kind]}
                </button>
              ))}
            </div>
          </div>

          <div className="row">
            <span className="hint" style={{ minWidth: 62 }}>
              {t.picker.rangeLabel}
            </span>
            <input
              className="input"
              type="date"
              style={{ width: 170 }}
              value={scanFrom}
              onChange={(event) => onScanFromChange(event.target.value)}
            />
            <span className="hint">{t.picker.rangeHint}</span>
          </div>

          {kinds.some((kind) => kind !== 'im') && (
            <p className="note warn" style={{ marginTop: 14, marginBottom: 0 }}>
              {t.picker.nonDmWarning(<code className="inline">missing_scope</code>)}
            </p>
          )}
        </div>

        <div className="toolbar">
          <input
            className="search"
            placeholder={t.picker.searchPlaceholder}
            value={query}
            onChange={(event) => setQuery(event.target.value)}
          />
          <button
            type="button"
            className="btn ghost sm"
            disabled={visible.length === 0}
            onClick={() => {
              const next = new Set(selected)
              for (const item of visible) {
                if (allVisibleOn) next.delete(item.id)
                else next.add(item.id)
              }
              onSelectedChange(next)
            }}
          >
            {allVisibleOn ? t.picker.deselectVisible : t.picker.selectVisible}
          </button>
        </div>

        <div className="list">
          {visible.length === 0 && (
            <div className="empty">{loading ? t.picker.emptyLoading : t.picker.emptyNone}</div>
          )}
          {visible.map((item) => (
            <label className="list-row" key={item.id} data-on={selected.has(item.id)}>
              <input type="checkbox" checked={selected.has(item.id)} onChange={() => toggle(item.id)} />
              <span className="name">
                {item.labelResolved ? item.label : <span style={{ color: 'var(--text-faint)' }}>{item.label}</span>}
                <span className="sub">{item.id}</span>
              </span>
              <span className="meta">{t.kind.short[item.kind]}</span>
            </label>
          ))}
        </div>
      </section>

      <div className="sticky-foot">
        <div className="summary">{t.picker.selectedSummary(<b>{n(selected.size)}</b>)}</div>
        <button className="btn primary" disabled={selected.size === 0} onClick={onScan}>
          {t.picker.scanButton}
        </button>
      </div>
    </>
  )
}
