import { recoverRows, verticalRuns } from '@/lib/import/runs'
import type { TextItem } from '@/lib/import/types'

import type {
  AxisLabel,
  DimensionText,
  GridAxis,
  GridCandidate,
  GridIssue,
} from './types'

/**
 * 通り芯ラベルの形。X・Y に続く1〜2桁の番号だけを取る。
 * 「FC1」「G1」のような符号を拾わないよう、先頭から末尾までを縛る。
 */
const AXIS_LABEL = /^([XY])(\d{1,2})$/

/**
 * 같은 라벨이 도면 양 끝(X는 위·아래, Y는 좌·우)에 중복 인쇄될 때 「같은
 * 格子線」으로 볼 위치 오차 허용치(pt). 같은 문자열이 같은 폰트로 두 번 찍힌
 * 것이라 실제 오차는 부동소수 잔차 수준(<1pt)이고, 반대로 런 재조립이 서로
 * 다른 格子線을 같은 라벨로 잘못 묶었다면 格子 간격만큼(보통 수백 pt) 벌어진다
 * — 그 사이 어디에 둬도 판정이 갈리므로 정확한 값 자체는 중요하지 않다.
 * 規準 수치가 아니라 도면 판독 임계값이라 룰팩이 아니라 여기 상수로 둔다.
 */
const DUPLICATE_LABEL_TOLERANCE_PT = 2

/**
 * makeSegments의 인접 판정 배수 — 라벨(「X1」)과 치수(「6,000」) 둘 다에 쓴다.
 * 한 토큰 안의 글자는 사실상 붙어 있어 글자 사이 간격이 0에 가깝고, 서로 다른
 * 토큰 사이는 그보다 뚜렷하게 벌어진다는 같은 전제가 둘 다에 성립한다.
 * 섹션리스트용 기본 배수(2.2, 글자 높이 h≈14pt에서 문턱≈31pt)는 그보다 좁게
 * 찍힌 토큰 사이 간격(예: 10pt)까지 하나로 묶는다 — 라벨은 compact가 "X1X2"가
 * 되어 AXIS_LABEL(`^([XY])(\d{1,2})$`)이, 치수는 "6,0007,000"이 되어 DIMENSION이
 * 통짜 문자열을 통째로 거절한다. ADR-030③이 남긴 표기 흔들림(X1'・X1A 같은
 * 補助通り芯) 거절과 같은 계열의 실패다(지어내지 않고 조용히 빠뜨린다). 문턱을
 * 글자 높이의 절반(h≈14pt에서 ≈7pt)으로 좁혀, 토큰 내부의 거의 0인 간격은
 * 여전히 묶고 토큰 사이 간격은 계속 가른다.
 */
const TIGHT_TOKEN_GAP_RATIO = 0.5

export function axisLabels(items: TextItem[]): AxisLabel[] {
  const order: string[] = []
  const occurrencesByLabel = new Map<string, AxisLabel[]>()

  for (const row of recoverRows(items, TIGHT_TOKEN_GAP_RATIO)) {
    for (const segment of row.segments) {
      const match = AXIS_LABEL.exec(segment.compact)
      if (!match) continue

      const axis = match[1] as GridAxis
      const label = segment.compact
      const entry: AxisLabel = {
        label,
        axis,
        index: Number(match[2]),
        // X通りは図面の横位置に、Y通りは縦位置に並ぶ — 軸ごとに測る向きが違う。
        // 中心の求め方（ベースラインなので引く側）は centerX/centerY 自身の定義にある。
        positionPt: axis === 'X' ? segment.centerX : segment.centerY,
      }

      const occurrences = occurrencesByLabel.get(label)
      if (occurrences) {
        occurrences.push(entry)
      } else {
        occurrencesByLabel.set(label, [entry])
        order.push(label)
      }
    }
  }

  const labels: AxisLabel[] = []
  for (const label of order) {
    const occurrences = occurrencesByLabel.get(label) as AxisLabel[]
    const positions = occurrences.map((entry) => entry.positionPt)
    const spread = Math.max(...positions) - Math.min(...positions)

    // 실도면은 같은 通り芯을 도면 양 끝에 두 번 찍는다 — 위치가 맞으면 하나로
    // 접고, 어긋나면 지어내지 말고(평균 내거나 아무거나 고르지 말고) 그 라벨을
    // 통째로 버린다. ADR-030의 라벨수↔スパン数 대조가 그 빈자리를 잡는다.
    if (spread <= DUPLICATE_LABEL_TOLERANCE_PT) {
      labels.push(occurrences[0])
    }
  }

  return labels
}

/**
 * 寸法値の形。3桁以上で、千位にコンマが入ることがある。
 * 3桁を下限にするのは、2桁以下が階数・枝番・本数であって寸法ではないからだ。
 *
 * 上限はコンマの有無で分かれる。**コンマがあれば6桁まで開ける**（`120,000` ＝
 * 100m級の建物）— 上限を5桁で切ると合計が6桁の図面は合計そのものが候補プールに
 * 入らず、ADR-030③ の自己検算がその軸で**原理的に**成立しない（スパン値を全部
 * 読めていても候補が0本になる）。**コンマがなければ5桁で止める**: コンマなしの
 * 6桁は、隣り合う二つの寸法が一つのセグメントに癒着したときちょうど出る形
 * (「150」＋「050」→`150050`)であって、図面に書かれた値ではないからだ。
 * 「桁数」ではなく「コンマの有無」で引くのが要点で、癒着の形（`1506,000`・
 * `6,0007,000`）も同じ規則で落ちる。
 */
const DIMENSION = /^(\d{1,3},\d{3}|\d{3,5})$/

function toMillimetres(text: string): number | undefined {
  if (!DIMENSION.test(text)) return undefined
  const value = Number(text.replace(/,/g, ''))
  // 「000」「00000」「0,000」は形だけ寸法で値は 0 だ。0 を候補プールに入れると
  // ADR-030③ の合計照合が壊れる — ある部分和 S が合計と合えば S ∪ {0} も必ず
  // 合うので、「合う組み合わせは一つ」という一意性そのものが消える。
  // 机上の危険ではない: yokohama-p14 の「650x1000」を pdf.js が
  // `650`・`x`・`1`・`000` に割って出すため、実際に 0mm が4か所出ていた。
  if (value <= 0) return undefined
  return value
}

/**
 * 図面から読めた寸法値をすべて拾う。**戻り値の順序に意味はない** — 呼び出し側は
 * `axis` で絞ってから `positionPt` で自分で並べ替えること。
 *
 * 現在の並びは「X（行ごと・行内は左から）を全部、そのあとに Y（列ごと・列内は
 * 下から）」だが、これは実装の副産物であって約束ではない。並べ替えてから返さない
 * のは、そうしても呼び出し側の手間が減らないからだ: ADR-030③ の合計照合は軸ごとの
 * 部分和で順序を見ないし、位置順が要る利用者はどのみち軸で絞ったあとに並べる。
 * ここで混在配列を並べても誰も使えない保証が増えるだけになる。
 *
 * 拾うのは値と、その軸方向の位置だけだ。軸に直交する座標は落とす — 「スパン寸法線
 * の上の 6,000」と「別の場所の詳細寸法の 6,000」は区別されずに同じプールに入る。
 * ADR-030③ が設計上のふるいを合計照合に置いたので、ここで選り分けない。
 */
export function dimensionTexts(items: TextItem[]): DimensionText[] {
  const found: DimensionText[] = []

  // 横書きは X通り方向の寸法 — 通り芯の間隔が図面の横に並ぶ。gapRatio は
  // ラベルと同じ理由で狭める(TIGHT_TOKEN_GAP_RATIO 参照) — 寸法値一つ(例
  // "6,000")の字間もラベルと同様ほぼ0で、基本倍率のままだと隣の寸法値と
  // くっついて "6,0007,000" になり、DIMENSION が丸ごと拒否する。
  for (const row of recoverRows(items, TIGHT_TOKEN_GAP_RATIO)) {
    for (const segment of row.segments) {
      const valueMm = toMillimetres(segment.compact)
      if (valueMm === undefined) continue
      found.push({ valueMm, positionPt: segment.centerX, axis: 'X' })
    }
  }

  // 回転文字列は Y通り方向。verticalRuns は y 降順に読むので、図面の
  // 「下から上へ」の読み順どおりの文字列が返る — ここで反転しない。
  //
  // 배수는 넘기지 않는다. 안전한 값(1.5)이 runs.ts의 기본값 그 자체라서다 —
  // 여기서 같은 수를 다시 적으면 같은 값이 두 곳에 놓여 따로 움직일 여지만
  // 생긴다. 측정과 근거는 `VERTICAL_RUN_GAP_RATIO`에 있다.
  for (const run of verticalRuns(items)) {
    const valueMm = toMillimetres(run.text)
    if (valueMm === undefined) continue
    found.push({ valueMm, positionPt: run.y, axis: 'Y' })
  }

  return found
}

const AXES: GridAxis[] = ['X', 'Y']

/** 部分和の途中経過。`spansMm` は最初に届いた並び一つだけを持つ。 */
interface Reached {
  /** その和に届く並びの数。2 で頭打ち — 「一通りか、それ以上か」しか要らない */
  count: number
  spansMm: number[]
}

/**
 * `reachTotal` が追跡する部分和の状態数(`states.size`)の上限。`totalMm`(正規表現上
 * ≤999,999)と窓数(`AXIS_LABEL` の `\d{1,2}` で軸あたりラベル≤98→窓≤97)だけでは
 * 計算量が締まらない — 独立リビューが実測した: 30窓×40値で5.4秒/364MB、
 * 50窓×40値で15.7秒/1.50GB、98窓×50値で84秒/2.55GBがブラウザのメインスレッドで
 * 発生する。ブラウザを長時間止められる入力が存在すること自体が失敗モードだ。
 *
 * 上限は「窓が終わるのを待たず、新しい和を1つ作るたびにその場で見る」— 1窓に
 * 数千の値があると、窓一つの処理だけで状態数が上限をはるかに超えて膨らんでから
 * 気付くことになるからだ(実測: この点検が窓の終わりだけだと、値3,000本の窓が
 * 1つあるだけで状態数が90万近くまで育ってから初めて打ち切られ、750ms前後かかる)。
 * 挿入のたびに見れば、どんな窓構成でも上限を超えた瞬間に打ち切れる。
 *
 * 値は10,000。ワースト入力(上の30/50/98窓構成、および1窓に20万値)のいずれでも
 * 数ミリ秒で打ち切りが働くことを測定で確認した一方、kani-p38 の実測状態数は
 * X軸6・Y軸43(区間 [3,2,1]・[5,10])で、この上限の1,000分の1にも届かない —
 * 実図面での余裕は十分にある(計測スクリプトはスクラッチパッド行き、コミット対象外)。
 */
const MAX_REACH_STATES = 10_000

/**
 * 区間ごとに寸法を1本ずつ選び、和が `totalMm` になる並びを探す。
 *
 * 素朴な部分和(プール全体から spanCount 本を選ぶ)は規模で破綻する — C(37,3)=7,770 は
 * 通るが、スパン10本の図面なら C(50,10)≈10^10 だ。区間で絞ると「区間ごとに一つ選ぶ」
 * になり、和による DP に畳める(状態は到達した和の種類だけで、区間数に対して指数に
 * ならない)。実測 kani-p38 では X 3×4×1、Y 7×23 まで落ちる。
 *
 * 枝刈りは「和が `totalMm` を超えたら捨てる」だけでよい — 寸法値は必ず正なので
 * 和は単調に増え、一度超えたら後から何を足しても戻らない。0 を候補プールから
 * 弾くことが守る**一意性**の話はこれとは別で、`toMillimetres` のコメント参照。
 *
 * `states.size` が `MAX_REACH_STATES` を超えたら `'overflow'` を返して打ち切る —
 * 部分結果を返さない。値を出すか出さないかの二択で、途中まで調べた並びを
 * 「たぶん合っている」として返すことはしない。
 */
function reachTotal(
  windows: number[][],
  totalMm: number,
): Reached | undefined | 'overflow' {
  let states = new Map<number, Reached>([[0, { count: 1, spansMm: [] }]])

  for (const values of windows) {
    const next = new Map<number, Reached>()

    for (const [sum, state] of states) {
      for (const value of values) {
        const reached = sum + value
        if (reached > totalMm) continue

        const found = next.get(reached)
        if (found) {
          found.count = Math.min(2, found.count + state.count)
        } else {
          next.set(reached, {
            count: Math.min(2, state.count),
            spansMm: [...state.spansMm, value],
          })
          if (next.size > MAX_REACH_STATES) return 'overflow'
        }
      }
    }

    states = next
  }

  return states.get(totalMm)
}

/**
 * 通り芯ラベルと寸法を軸ごとに噛み合わせ、合計寸法で検算する (ADR-030②③)。
 * 軸ごとに必ず1つ候補を返す — 読めなかった軸も `issues` を積んで残す。
 * 何が読めなかったのかを画面に出せるのは、この候補が残っているからだ。
 *
 * 噛み合わせは**位置**で行う。スパン寸法は隣り合う2本の通り芯の**間**に書かれる
 * ので、その区間に入る寸法だけをそのスパンの候補にする。ADR-030③ は当初これを
 * 合計照合だけで担わせるつもりだったが、実測でそれでは足りないことが判った —
 * kani-p38 の X軸は寸法候補が38本あってスパンは3本で、「合計になり得ない残り」を
 * スパンと見る当初案では本数が合わず、唯一の実測図面が格子を一つも出せない。
 *
 * 位置で絞ってなお残る曖昧さを潰すのが合計照合だ。両方が要る。
 *
 * **pt↔mm の縮尺一貫性は使わない。** kani-p38 では縮尺が揃っていて(X
 * 0.02833/0.02833/0.02838、Y 0.02833/0.02838)、合計より強いふるいになり得る。
 * それでも入れないのは、(1) 位置＋合計で実測の両軸とも解が正確に1つに決まって
 * いて、いま直る失敗が一つも無い、(2) 許容誤差を決める根拠が図面1部しかなく、
 * R10(フォーマット過適合)の罠そのものだ、(3) 測っているのはラベル**文字の中心**で
 * あって通り芯そのものではないので、縮尺の一致は原理的に近似でしかない。
 * 曖昧(`寸法組合せ不定`)が実測で出てきた時に、その図面を証拠として入れる。
 */
export function parseGrid(items: TextItem[]): GridCandidate[] {
  const labels = axisLabels(items)
  const dimensions = dimensionTexts(items)

  return AXES.map((axis): GridCandidate => {
    // 位置順に並べる。ラベル番号順ではない — +y が下向きなので Y通りは
    // 位置順だと Y3・Y2・Y1 になる(kani-p38 実測)。番号で並べるとスパンが入れ替わる。
    const axisLabelsInOrder = labels
      .filter((label) => label.axis === axis)
      .sort((left, right) => left.positionPt - right.positionPt)

    const reject = (issue: GridIssue): GridCandidate => ({
      axis,
      labels: axisLabelsInOrder,
      spansMm: [],
      totalMm: null,
      issues: [issue],
    })

    if (axisLabelsInOrder.length < 2) return reject('通り芯ラベル不足')

    // ラベルがちょうど2本(＝区間が1つ)だと、「和 ＝ 合計」は証拠ではなく定義に
    // なる — その1本自身を合計と読めば常に成立してしまうからだ。データを見る前に
    // 判る話なので、プールを作る前にここで拒む。写経ミスではなく検算そのものが
    // 無力な場合であって、writtenAsTotal(下)がその区間に何本あるかとは無関係に
    // 常にこう倒れる(ADR-030③-2 の正誤参照)。
    if (axisLabelsInOrder.length === 2) return reject('区間数不足')

    const pool = dimensions.filter((dimension) => dimension.axis === axis)

    // 合計はプールの最大値だと見る(実測: kani-p38 の X 20,000 ＝ 6,000+6,000+8,000、
    // Y 16,500 ＝ 6,000+10,500 で両軸とも最大値が合計だ)。プールの最大値が
    // スパンより大きなノイズなら検算が落ちる — 拒否であって捏造ではないので、
    // 倒れる向きはこれでよい。
    let totalMm = Number.NEGATIVE_INFINITY
    for (const dimension of pool) {
      if (dimension.valueMm > totalMm) totalMm = dimension.valueMm
    }
    const writtenAsTotal = pool.filter(
      (dimension) => dimension.valueMm === totalMm,
    ).length

    const windows: number[][] = []
    for (let index = 0; index + 1 < axisLabelsInOrder.length; index += 1) {
      const from = axisLabelsInOrder[index].positionPt
      const to = axisLabelsInOrder[index + 1].positionPt
      const inside = pool.filter(
        (dimension) => dimension.positionPt > from && dimension.positionPt < to,
      )

      // 合計に使う値は、スパンとは別の一本として図面に書かれていなければならない。
      // 一本しか無いのにそれをスパンとして消費すると、検算する相手が消えて
      // 「和 ＝ 合計」が自分自身との照合になる — ラベル2本(区間1つ)の軸では
      // それが**必ず**成立してしまうが、そちらは上の `区間数不足` が先に弾く
      // (ADR-030③-2)。ここに来る時点で区間は2つ以上あるので、この除外は
      // 実質無害だ — 値は全て正なので、合計と同じ値を1区間で使っても残りの
      // 区間の和が必ず合計を超え、どのみち解にはならない。それでも残すのは、
      // 解になり得ないと分かっている候補を早めに落として状態数を抑えるためだ。
      const usable = inside
        .filter(
          (dimension) => dimension.valueMm !== totalMm || writtenAsTotal > 1,
        )
        .map((dimension) => dimension.valueMm)

      // 区間に寸法が一つも無い場合と、合計除外フィルタで使える寸法が0本になった
      // 場合は事実として別だが、`寸法本数不一致` は「この区間に使えるスパン候補が
      // 無い」という一点では共通なので同じ理由を使う — フィルタ**後**に見る:
      // フィルタ前に見ると、フィルタが窓を空にしたのに合計照合まで進んでしまい、
      // DP が失敗してようやく `合計寸法不一致`(見当違いの理由)で出る。
      if (usable.length === 0) return reject('寸法本数不一致')

      // 同じ値が同じ区間に何本あっても読みは一つだ — 値で畳まないと、同じ並びが
      // 本数だけ数えられて `寸法組合せ不定` に化ける
      windows.push([...new Set(usable)])
    }

    const reached = reachTotal(windows, totalMm)
    if (reached === 'overflow') return reject('計算量超過')
    if (reached === undefined) return reject('合計寸法不一致')
    if (reached.count > 1) return reject('寸法組合せ不定')

    return {
      axis,
      labels: axisLabelsInOrder,
      spansMm: reached.spansMm,
      totalMm,
      issues: [],
    }
  })
}
