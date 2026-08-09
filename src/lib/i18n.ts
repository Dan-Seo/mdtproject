import ja from '@/locales/ja.json'
import ko from '@/locales/ko.json'

import type { Locale } from './store'

const resources: Record<Locale, Record<string, string>> = { ja, ko }

export function t(locale: Locale, key: string): string {
  return resources[locale][key] ?? resources.ja[key] ?? key
}
