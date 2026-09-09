import { useState, type FormEvent } from 'react'
import { useI18n } from '../i18n/context'
import { CopyBlock } from './ui'

interface Props {
  onSubmit: (token: string, remember: boolean) => void
  busy: boolean
  error: string | null
}

export function TokenGate({ onSubmit, busy, error }: Props) {
  const { t } = useI18n()
  const [token, setToken] = useState('')
  const [remember, setRemember] = useState(false)

  const trimmed = token.trim()
  const looksBot = trimmed.startsWith('xoxb-')
  const looksUser = trimmed.startsWith('xoxp-')

  function submit(event: FormEvent) {
    event.preventDefault()
    if (!trimmed || busy) return
    onSubmit(trimmed, remember)
  }

  return (
    <>
      <section className="panel">
        <header className="panel-head">
          <h2>{t.gate.setupTitle}</h2>
        </header>
        <div className="panel-body">
          <p className="note">
            {t.gate.intro(
              <code className="inline">slack.com</code>,
              <code className="inline">client_secret</code>,
            )}
          </p>

          <div className="guide">
            <div className="guide-step">
              <div>
                <h3>
                  {t.gate.step1Title(
                    <a href="https://api.slack.com/apps" target="_blank" rel="noreferrer">
                      api.slack.com/apps
                    </a>,
                  )}
                </h3>
                <p>{t.gate.step1Body}</p>
                <CopyBlock code={t.gate.manifest} />
              </div>
            </div>
            <div className="guide-step">
              <div>
                <h3>{t.gate.step2Title}</h3>
                <p>{t.gate.step2Body}</p>
              </div>
            </div>
            <div className="guide-step">
              <div>
                <h3>{t.gate.step3Title(<code className="inline">xoxp-…</code>)}</h3>
                <p>{t.gate.step3Body(<code className="inline">xoxb-</code>)}</p>
              </div>
            </div>
          </div>
        </div>
      </section>

      <section className="panel">
        <header className="panel-head">
          <h2>{t.gate.pasteTitle}</h2>
        </header>
        <div className="panel-body">
          <form onSubmit={submit}>
            <label className="field">
              <span>{t.gate.tokenLabel}</span>
              <input
                className="input mono"
                type="password"
                autoComplete="off"
                spellCheck={false}
                placeholder="xoxp-..."
                value={token}
                onChange={(event) => setToken(event.target.value)}
              />
            </label>

            {looksBot && (
              <p className="note danger">
                {t.gate.botTokenError(
                  <code className="inline">xoxb-</code>,
                  <code className="inline">xoxp-</code>,
                )}
              </p>
            )}
            {trimmed && !looksUser && !looksBot && (
              <p className="note warn">{t.gate.oddPrefixWarning(<code className="inline">xoxp-</code>)}</p>
            )}
            {error && <p className="note danger">{error}</p>}

            <div className="row">
              <label className="check">
                <input type="checkbox" checked={remember} onChange={(event) => setRemember(event.target.checked)} />
                {t.gate.remember}
              </label>
              <div className="spacer" style={{ flex: 1 }} />
              <button className="btn primary" type="submit" disabled={!trimmed || busy}>
                {busy ? t.gate.connecting : t.gate.connect}
              </button>
            </div>
          </form>
        </div>
      </section>

      <section className="panel">
        <header className="panel-head">
          <h2>{t.gate.knowTitle}</h2>
        </header>
        <div className="panel-body">
          <p className="note warn">{t.gate.irreversible}</p>
          <div className="note">
            <ul>
              <li>{t.gate.bulletOwnOnly}</li>
              <li>{t.gate.bulletPolicy(<code className="inline">cant_delete_message</code>)}</li>
              <li>{t.gate.bulletRetention}</li>
              <li>{t.gate.bulletFiles(<code className="inline">files.delete</code>)}</li>
            </ul>
          </div>
        </div>
      </section>
    </>
  )
}
