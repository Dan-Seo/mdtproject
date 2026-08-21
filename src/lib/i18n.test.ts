import { describe, expect, it } from 'vitest'

import type { UnsupportedReason } from '@/domain/model/unsupported'
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

  // 未対応の理由が増えたときに翻訳を足し忘れると、画面にキー文字列が出る。
  // Record にしてあるので、UnsupportedReason が増えれば型で落ちる。
  it('names every 未対応 reason and plan in both panes', () => {
    const reasons: Record<UnsupportedReason, true> = {
      定着不成立: true,
      寸法不成立: true,
      カットオフ位置不成立: true,
    }

    for (const reason of Object.keys(reasons)) {
      for (const pane of ['takeoff', 'viewer']) {
        for (const kind of ['reason', 'plan']) {
          const key = `${pane}.unsupported.${kind}.${reason}`
          expect(t('ja', key), key).not.toBe(key)
          expect(t('ko', key), key).not.toBe(key)
        }
      }
    }
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
