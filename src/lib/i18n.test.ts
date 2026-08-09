import { describe, expect, it } from 'vitest'

import { t } from './i18n'

describe('t', () => {
  it('falls back from ko to ja when the Korean key is absent', () => {
    expect(t('ko', 'notice.scope')).toBe(
      '官庁施設向けの基準であり、民間工事では異なる場合があります。',
    )
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
