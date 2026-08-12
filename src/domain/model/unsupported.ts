/**
 * 부재 단위 미지원 판정 (M3a).
 *
 * 사용자 입력만으로 도달할 수 있는 성립 불가 형상 — 지점에 들어가지 않는 定着,
 * 0 이하가 되는 内法·加工寸法 — 은 프로그래밍 오류가 아니라 그 부재를
 * 산정할 수 없다는 사실이다. 그런 부재는 물량·3D에서 제외하고 UI에 고지하며,
 * 나머지 부재의 산정은 그대로 진행한다.
 *
 * 룰팩 공백(`Rule not found`)이나 타입 위반 같은 실제 결함은 이 오류로 감싸지
 * 말 것 — 조용히 「미지원 부재」로 흡수되면 결함이 화면에서 사라진다.
 */
export type UnsupportedReason = '定着不成立' | '寸法不成立'

export class MemberUnsupportedError extends Error {
  readonly reason: UnsupportedReason

  constructor(reason: UnsupportedReason, message: string) {
    super(message)
    this.name = 'MemberUnsupportedError'
    this.reason = reason
  }
}
