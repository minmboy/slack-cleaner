import { useEffect, useState } from 'react'
import { useI18n } from '../i18n/context'

interface Props {
  total: number
  /** Staged messages carrying an attachment, whoever uploaded it. */
  withFiles: number
  /** Files I uploaded, which this run can actually delete. */
  fileCount: number
  deleteFiles: boolean
  onDeleteFilesChange: (value: boolean) => void
  perChannel: { channelId: string; label: string; count: number }[]
  dryRun: boolean
  onDryRunChange: (value: boolean) => void
  onCancel: () => void
  onStart: () => void
}

export function ConfirmModal({
  total,
  withFiles,
  fileCount,
  deleteFiles,
  onDeleteFilesChange,
  perChannel,
  dryRun,
  onDryRunChange,
  onCancel,
  onStart,
}: Props) {
  const { t, n } = useI18n()
  const [typed, setTyped] = useState('')

  // A dialog guarding an irreversible action must be dismissible without a mouse.
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onCancel()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onCancel])
  const armed = dryRun || typed.trim().toLowerCase() === t.confirm.phrase.toLowerCase()
  // About one call a second — the pace the client starts at (see slack.ts).
  const estimateMin = Math.ceil((total + (deleteFiles ? fileCount : 0)) / 60)

  return (
    <div className="scrim" onClick={onCancel}>
      <div className="modal" role="dialog" aria-modal="true" onClick={(event) => event.stopPropagation()}>
        <header className="modal-head">
          <h2>{t.confirm.title}</h2>
        </header>
        <div className="modal-body">
          <p className="note danger">{t.confirm.warning(<b>{n(total)}</b>)}</p>

          <div style={{ maxHeight: 180, overflowY: 'auto', margin: '0 0 16px' }}>
            <table className="fail-table">
              <tbody>
                {perChannel.map((item) => (
                  <tr key={item.channelId}>
                    <td>{item.label}</td>
                    <td style={{ textAlign: 'right', color: 'var(--accent)' }}>{n(item.count)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {fileCount > 0 ? (
            <div className="note warn">
              <label className="check">
                <input
                  type="checkbox"
                  checked={deleteFiles}
                  onChange={(event) => onDeleteFilesChange(event.target.checked)}
                />
                {t.confirm.filesOptIn(n(fileCount))}
              </label>
              <p style={{ margin: '8px 0 0' }}>
                {deleteFiles ? t.confirm.filesScopeWarning : t.confirm.filesKept(n(fileCount))}
              </p>
            </div>
          ) : (
            withFiles > 0 && <p className="note">{t.confirm.filesNotMine(n(withFiles))}</p>
          )}

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
            {dryRun ? t.confirm.startDryRun : t.confirm.startDelete(n(total + (deleteFiles ? fileCount : 0)))}
          </button>
        </footer>
      </div>
    </div>
  )
}
