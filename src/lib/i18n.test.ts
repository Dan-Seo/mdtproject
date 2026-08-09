import { describe, expect, it } from 'vitest'

import ja from '@/locales/ja.json'
import ko from '@/locales/ko.json'

import { t } from './i18n'

describe('t', () => {
  it('falls back from ko to ja when the Korean key is absent', () => {
    expect(t('ko', 'domain.fc24')).toBe('Fc24')
  })

  it('returns the key itself when neither locale defines it', () => {
    expect(t('ko', 'missing.key')).toBe('missing.key')
  })

  it('translates every ja key in ko so no UI string falls back silently', () => {
    expect(Object.keys(ja).filter((key) => !(key in ko))).toEqual([])
  })

  it('shows the scope notice in Korean rather than falling back to ja', () => {
    expect(t('ko', 'notice.scope')).not.toBe(t('ja', 'notice.scope'))
    expect(t('ko', 'notice.scope')).toContain('관청시설')
  })

  it('translates UI labels without translating domain terms', () => {
    expect(t('ko', 'label.length')).toBe('길이')
    expect(t('ko', 'domain.column')).toBe('柱')
    expect(t('ko', 'domain.girder')).toBe('大梁')
    expect(t('ko', 'domain.mainRebar')).toBe('主筋')
    expect(t('ko', 'domain.hoop')).toBe('帯筋')
    expect(t('ko', 'domain.stirrup')).toBe('あばら筋')
  })
})
