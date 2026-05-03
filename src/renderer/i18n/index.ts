import type { Language, TranslationDict } from './types'
import { zhCN } from './locales/zh-CN'
import { en } from './locales/en'
import { de } from './locales/de'

const translations: Record<Language, TranslationDict> = {
  'zh-CN': zhCN,
  'en': en,
  'de': de
}

let currentLang: Language = 'zh-CN'

export function getLang(): Language {
  return currentLang
}

export function t(key: string, vars?: Record<string, string>): string {
  let text = translations[currentLang][key]
  if (text === undefined) {
    text = translations['zh-CN'][key] || key
  }
  if (vars) {
    Object.entries(vars).forEach(([k, v]) => {
      text = text.replace(new RegExp(`{{${k}}}`, 'g'), v)
    })
  }
  return text
}

export async function setLang(lang: Language): Promise<void> {
  if (!translations[lang]) return
  currentLang = lang
  await window.electronAPI.settings.set('safenest_language', lang)
  translateDOM()
  translateAttrs()
}

export async function loadLang(): Promise<void> {
  const saved = await window.electronAPI.settings.get('safenest_language')
  if (saved && (saved === 'zh-CN' || saved === 'en' || saved === 'de')) {
    currentLang = saved as Language
  }
  translateDOM()
  translateAttrs()
}

export function translateDOM(): void {
  document.querySelectorAll('[data-i18n]').forEach(el => {
    const key = el.getAttribute('data-i18n')
    if (key) el.textContent = t(key)
  })
}

export function translateAttrs(): void {
  document.querySelectorAll('[data-i18n-placeholder]').forEach(el => {
    const key = el.getAttribute('data-i18n-placeholder')
    if (key) (el as HTMLInputElement | HTMLTextAreaElement).placeholder = t(key)
  })
  document.querySelectorAll('[data-i18n-title]').forEach(el => {
    const key = el.getAttribute('data-i18n-title')
    if (key) el.setAttribute('title', t(key))
  })
}

export function refreshDynamicText(): void {
  translateDOM()
  translateAttrs()
}
