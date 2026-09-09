import { useCallback, useEffect, useMemo, useState, type ReactNode } from 'react'
import { buildValue, detectLang, I18nContext, LANG_KEY, type Lang } from './context'

export function I18nProvider({ children }: { children: ReactNode }) {
  const [lang, setLangState] = useState<Lang>(detectLang)

  const setLang = useCallback((next: Lang) => {
    setLangState(next)
    try {
      localStorage.setItem(LANG_KEY, next)
    } catch {
      // Preference just will not persist; the app still works.
    }
  }, [])

  const value = useMemo(() => buildValue(lang, setLang), [lang, setLang])

  // Keep the document in sync so the browser tab and screen readers match the UI.
  useEffect(() => {
    document.documentElement.lang = lang
    document.title = value.t.app.title
  }, [lang, value.t.app.title])

  return <I18nContext.Provider value={value}>{children}</I18nContext.Provider>
}
