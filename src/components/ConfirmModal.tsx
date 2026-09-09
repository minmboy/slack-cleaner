import { useState } from 'react'
import { useI18n } from '../i18n/context'

interface Props {
  total: number
  perChannel: { label: string; count: number }[]
  dryRun: boolean
  onDryRunChange: (value: boolean) => void
  onCancel: () => void
  onStart: () => void
}

export function ConfirmModal({ total, perChannel, dryRun, onDryRunChange, onCancel, onStart }: Props) {
  const { t, n } = useI18n()
  const [typed, setTyped] = useState('')
  const armed = dryRun || typed.trim().toLowerCase() === t.confirm.phrase.toLowerCase()
  const estimateMin = Math.ceil((total * 1.3) / 60)

  return (
    <div className="scrim" onClick={onCancel}>
      <div className="modal" onClick={(event) => event.stopPropagation()}>
        <header className="modal-head">
          <h2>{t.confirm.title}</h2>
        </header>
        <div className="modal-body">
          <p className="note danger">{t.confirm.warning(<b>{n(total)}</b>)}</p>

          <div style={{ maxHeight: 180, overflowY: 'auto', margin: '0 0 16px' }}>
            <table className="fail-table">
              <tbody>
                {perChannel.map((item) => (
                  <tr key={item.label}>
                    <td>{item.label}</td>
                    <td style={{ textAlign: 'right', color: 'var(--accent)' }}>{n(item.count)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <p className="hint" style={{ marginBottom: 14 }}>
            {t.confirm.estimate(<b>{t.confirm.minutes(n(estimateMin))}</b>)}
          </p>

          <label className="check" style={{ marginBottom: 14 }}>
            <input type="checkbox" checked={dryRun} onChange={(event) => onDryRunChange(event.target.checked)} />
            {t.confirm.dryRun}
          </label>

          {!dryRun && (
            <label className="field" style={{ marginBottom: 0 }}>
              <span>{t.confirm.typePrompt(<code className="inline">{t.confirm.phrase}</code>)}</span>
              <input
                className="input"
                autoFocus
                value={typed}
                onChange={(event) => setTyped(event.target.value)}
                placeholder={t.confirm.phrase}
              />
            </label>
          )}
        </div>
        <footer className="modal-foot">
          <button className="btn ghost" onClick={onCancel}>
            {t.confirm.cancel}
          </button>
          <button className={dryRun ? 'btn primary' : 'btn danger'} disabled={!armed} onClick={onStart}>
            {dryRun ? t.confirm.startDryRun : t.confirm.startDelete(n(total))}
          </button>
        </footer>
      </div>
    </div>
  )
}
