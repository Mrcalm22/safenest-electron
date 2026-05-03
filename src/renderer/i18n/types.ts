export type Language = 'zh-CN' | 'en' | 'de'

export interface TranslationDict {
  [key: string]: string
}

export interface TranslationMap {
  'zh-CN': TranslationDict
  'en': TranslationDict
  'de': TranslationDict
}
