import { createContext, useContext } from 'react'
import { makeFormatters, type Formatters } from '../lib/format'
import { en } from './en'
import { ko, type Strings } from './ko'

export type Lang = 'ko' | 'en'

export const DICTS: Record<Lang, Strings> = { ko, en }
export const LANGS = Object.keys(DICTS) as Lang[]

/** The only thing this app puts in localStorage. Not sensitive; see README. */
export const LANG_KEY = 'slack-cleaner:lang'

export interface I18nValue extends Formatters {
  lang: Lang
  setLang: (lang: Lang) => void
  t: Strings
}

export const I18nContext = createContext<I18nValue | null>(null)

function isLang(value: unknown): value is Lang {
  return value === 'ko' || value === 'en'
}

/** Stored choice wins; otherwise follow the browser and fall back to English. */
export function detectLang(): Lang {
  try {
    const saved = localStorage.getItem(LANG_KEY)
    if (isLang(saved)) return saved
  } catch {
    // Blocked storage (private mode, site-data restrictions): fall through.
  }
  return navigator.language?.toLowerCase().startsWith('ko') ? 'ko' : 'en'
}

export function buildValue(lang: Lang, setLang: (lang: Lang) => void): I18nValue {
  const t = DICTS[lang]
  return { lang, setLang, t, ...makeFormatters(t.locale) }
}

export function useI18n(): I18nValue {
  const value = useContext(I18nContext)
  if (!value) throw new Error('useI18n must be used inside <I18nProvider>')
  return value
}
