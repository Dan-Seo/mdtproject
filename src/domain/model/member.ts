/** BAR_SIZES と同じく、実行時に検められるよう配列から型を起こす。 */
export const MEMBER_KINDS = ['柱', '大梁', '耐震壁', '床板'] as const

export type MemberKind = (typeof MEMBER_KINDS)[number]

export type MemberClass = '躯体'

/** 허용 철근 경의 단일 출처 — UI 셀렉트·断面リスト 파서가 여기서 파생한다. */
export const BAR_SIZES = [
  'D10',
  'D13',
  'D16',
  'D19',
  'D22',
  'D25',
  'D29',
  'D32',
] as const

export type BarSize = (typeof BAR_SIZES)[number]

/**
 * 高強度せん断補強筋の呼び名。フープ・スタラップ専用である。
 *
 * 両原文に一度も現れない — 「高強度」「大臣認定」ともに標準仕様書 R7 全330頁・
 * 数量積算基準 全54頁で 0 件だ。規準が定める鉄筋ではなく大臣認定品だからである。
 * それでも数量を出せるのは、フープ・スタラップの設計長さを 1通則2) が断面周長と
 * 定めていて、径で引くルールパック行が一つもないからだ (ADR-026)。
 *
 * 主筋には使えない。主筋は定着 (表5.3.4)・重ね継手 (表5.3.2) を径と鉄筋の種類で
 * 引くが、その表に高強度せん断補強筋の行はない — 型がそれを禁じる。
 *
 * 一覧は収集した実図面が書いた呼び名そのものであって、製品カタログの網羅では
 * ない。K13 は沖縄県住宅供給公社、S13 は横浜市の図面にある (どちらも KSS785)。
 * 未知の呼び名は値を作らず空欄に落ちる — 断面リスト파서と同じ扱いだ (R10)。
 */
export const HIGH_STRENGTH_SHEAR_BAR_SIZES = ['K13', 'S13'] as const

export type HighStrengthShearBarSize =
  (typeof HIGH_STRENGTH_SHEAR_BAR_SIZES)[number]

/** せん断補強筋 (帯筋・あばら筋) に入れられる呼び名の全体。 */
export const SHEAR_BAR_SIZES = [
  ...BAR_SIZES,
  ...HIGH_STRENGTH_SHEAR_BAR_SIZES,
] as const

export type ShearBarSize = BarSize | HighStrengthShearBarSize

export type SteelGrade = 'SD295' | 'SD345' | 'SD390'

/**
 * 主筋の継手方式。断面一覧の入力であって製品が決めない (ADR-012)。
 *
 * 数量積算基準 1通則4)・5) が名指すのは重ね継手とガス圧接継手だけなので、
 * 機械式・溶接の扱いはルールパック側で `inferred` の行になる — 選べるが
 * 未確認として警告が付く (ADR-015)。
 */
export const SPLICE_METHODS = [
  '重ね継手',
  'ガス圧接',
  '機械式',
  '溶接',
] as const

export type SpliceMethod = (typeof SPLICE_METHODS)[number]

/** 表5.3.6 のかぶり厚さセルを特定する入力 (屋内・屋外 × 仕上げの有無)。 */
export type Exposure = '屋内' | '屋外'

export type Finish = '仕上げあり' | '仕上げなし'

/**
 * 柱の断面形状。
 *
 * 円形柱は b・d をともに直径にする。大梁の内法長さも 3D の柱面も b・d から
 * 決まるので、外接寸法として同じ値を置けば形状の追加が計測規則を揺らさない。
 * 数量で形状を見るのは 1通則2)「断面の設計寸法による周長」ただ一箇所で、
 * 円形断面ではその周長が円周になる — 製品が新しい値を作るわけではない (ADR-027)。
 *
 * スパイラル筋は扱わない。標準仕様書 5.3.4(6)(ｲ) が「スパイラル筋の継手及び定着は
 * 図5.3.5 による」と図に委ねており、その図は原文で画像だ (表5.3.3 と同じ)。
 * 断面リストが「HOOP D13@100」と書いていればそれはフープであって、製品が
 * スパイラルと読み替えることはしない (ADR-012)。
 */
export type ColumnShape = '矩形' | '円形'

export interface ColumnSection {
  id: string
  kind: '柱'
  mark: string
  /**
   * 断面リスト에서 취입할 때 어느 階 행에서 왔는지. 符号(mark)에 붙이면 도면에 없는
   * 符号이 内訳書에 그대로 나가고 内訳書는 이미 階별로 묶여 있어 階가 두 번 표시된다.
   * 제품의 Story와는 아직 연결되지 않는다 — 표시·취입 매칭용이다.
   */
  storyLabel?: string
  /** 断面形状。'円形' のとき b・d はともに直径である。 */
  shape: ColumnShape
  b: number
  d: number
  fc: number
  grade: SteelGrade
  exposure: Exposure
  finish: Finish
  /** 主筋の継手方式 — 継手箇所数と設計長さへの算入を決める (積算基準 1通則4)・5)) */
  spliceMethod: SpliceMethod
  main: {
    size: BarSize
    count: number
  }
  hoop: {
    size: ShearBarSize
    pitch: number
    /**
     * 配置区間의 양 끝면에서 第1·最終帯筋을 얼마나 띄우는지. 規準에 값이 없고
     * 本数를 좌우하므로 제품이 정하지 않는다 — 断面一覧의 입력이다 (ADR-012).
     */
    startOffsetMm: number
  }
}

/** 大梁 主筋 1段（上端または下端）の位置別本数。断面リストの端部・中央行に対応する。 */
export interface GirderMainRow {
  /** 端部（支点側）の本数 */
  endCount: number
  /** 中央の本数 */
  centerCount: number
  /**
   * 始端側の本数 — 左右で違うときだけ持つ。無ければ endCount と同じ（対称）。
   * 始端はランローカル（GirderRun.memberOffsetsMm の 0 側）。
   */
  startCount?: number
}

/**
 * 位置別本数を「梁の全長にわたる主筋」と「そうでない主筋」に分けた結果。
 *
 * 数量積算基準 2（３）梁1) が長さを定めるのは全長にわたる主筋だけで、トップ筋・
 * 補強筋等は設計図書に委ねられる。両位置に共通して立つ本数（少ない方）が通し筋、
 * 差がカットオフ筋である。
 */
export interface GirderMainSplit {
  throughCount: number
  cutoffCount: number
  /** カットオフ筋が立つ側。cutoffCount が 0 なら意味を持たない */
  cutoffAt: '端部' | '中央'
}

export function splitGirderMainRow(row: GirderMainRow): GirderMainSplit {
  return {
    throughCount: Math.min(row.endCount, row.centerCount),
    cutoffCount: Math.abs(row.endCount - row.centerCount),
    cutoffAt: row.endCount >= row.centerCount ? '端部' : '中央',
  }
}

/**
 * 大梁主筋の位置別本数を、重なりを保つグループへ分解する。
 *
 * 本数は累積集合として解釈する。通し筋・始端/終端 stub・中央筋に加えて、
 * 一方の支点だけで定着する 편측근を返す。始端と終端の両方に定着する 편측근は
 * 同時に成立しないため、`oneSidedAnchor` は一方だけを持つ (ADR-032)。
 */
export interface GirderMainDecomposition {
  throughCount: number
  startStubCount: number
  endStubCount: number
  centerOnlyCount: number
  oneSidedCount: number
  oneSidedAnchor?: '始端' | '終端'
}

export function decomposeGirderMainRow(
  row: GirderMainRow,
): GirderMainDecomposition {
  const startCount = row.startCount ?? row.endCount
  const throughCount = Math.min(startCount, row.centerCount, row.endCount)
  const startStubCount = Math.max(0, startCount - row.centerCount)
  const endStubCount = Math.max(0, row.endCount - row.centerCount)
  const centerOnlyCount = Math.max(
    0,
    row.centerCount - Math.max(startCount, row.endCount),
  )
  const oneSidedStartCount = Math.max(
    0,
    Math.min(startCount, row.centerCount) - row.endCount,
  )
  const oneSidedEndCount = Math.max(
    0,
    Math.min(row.centerCount, row.endCount) - startCount,
  )

  if (oneSidedStartCount > 0) {
    return {
      throughCount,
      startStubCount,
      endStubCount,
      centerOnlyCount,
      oneSidedCount: oneSidedStartCount,
      oneSidedAnchor: '始端',
    }
  }

  if (oneSidedEndCount > 0) {
    return {
      throughCount,
      startStubCount,
      endStubCount,
      centerOnlyCount,
      oneSidedCount: oneSidedEndCount,
      oneSidedAnchor: '終端',
    }
  }

  return {
    throughCount,
    startStubCount,
    endStubCount,
    centerOnlyCount,
    oneSidedCount: 0,
  }
}

export interface GirderSection {
  id: string
  kind: '大梁'
  mark: string
  /** ColumnSection.storyLabel과 같다. */
  storyLabel?: string
  b: number
  depth: number
  fc: number
  grade: SteelGrade
  exposure: Exposure
  finish: Finish
  /** ColumnSection.spliceMethod と同じ。通し筋の継手箇所数に効く */
  spliceMethod: SpliceMethod
  main: {
    size: BarSize
    /** 上端筋の位置別本数 — 断面リストの端部・中央行がそのまま入る */
    top: GirderMainRow
    /** 下端筋の位置別本数 */
    bottom: GirderMainRow
    /**
     * カットオフ筋を柱面から梁の内側へ何 mm で切り止めるか。
     *
     * 数量積算基準 2（３）梁1) が「トップ筋、ハンチ部分の主筋、補強筋等は設計図書
     * による」と委ねるので規準側に値がない — 断面一覧の入力である (ADR-012)。
     * 端部と中央が同数（カットオフ筋がない）断面では使われない。
     */
    cutoffFromSupportFaceMm: number
  }
  stirrup: {
    size: ShearBarSize
    pitch: number
    /** 両端の柱面から第1・最終あばら筋をどれだけ離すか。規準に値はない — 断面一覧の入力である (ADR-012) */
    startOffsetMm: number
  }
  /**
   * 幅止め筋。断面一覧に記載のない梁には無い配筋なので任意項目とし、
   * `undefined` は「配筋なし」を意味する — 製品が勝手に足さない (ADR-012)。
   * 設計長さは数量積算基準 1通則3) が断面の設計幅と定めるので入力は径とピッチだけ。
   */
  widthTie?: {
    size: BarSize
    pitch: number
  }
  /**
   * 腹筋。`undefined` は「配筋なし」。本数は図面が「2-D10」と記載する数そのもの
   * なので 1通則7) の割付ではない。
   */
  sideBar?: {
    size: BarSize
    count: number
    /**
     * 梁の両端で内法を越えて伸びる余長 (mm)。数量積算基準 2（３）梁3) は
     * これを 1通則6) に委ね、同項は設計図書に記載がなければ JASS 5 準用と
     * する。JASS 5 は有料規格で未確保、標準仕様書5章には腹筋の記述が一切
     * ないため規準値を取れない — 設計図書の値を入力として受け取る (R9②)。
     */
    extraLengthMm: number
  }
}

/**
 * 耐震壁 — ラーメン構造の壁である。壁式構造の壁ではない。
 *
 * 数量積算基準 2（５）壁 は 1)「壁式構造以外」と 2)「壁式構造」を別条文で扱い、
 * 後者は端部筋・縦筋・壁梁筋・横筋・補強筋の5区分に分かれて条文の量がまるで違う。
 * ここが実装するのは 1) だけで、壁式構造は扱わない。
 *
 * 幅止筋を持たないのは意図的だ。1通則3) は長さ（＝壁厚）を壁にも与えるが、
 * 本数を定める条文は 2（３）梁3) で梁しか名指しておらず、2（５）壁 に幅止筋の
 * 記述は一切ない。本数を製品が作らないと計上できない — 作らない (ADR-022 の腹筋と同じ判断)。
 */
export interface WallSection {
  id: string
  kind: '耐震壁'
  mark: string
  /** ColumnSection.storyLabel と同じ。 */
  storyLabel?: string
  /** 壁厚 (mm) */
  thickness: number
  fc: number
  grade: SteelGrade
  exposure: Exposure
  finish: Finish
  /** 縦筋・横筋の継手方式。継手箇所数と設計長さへの算入を決める */
  spliceMethod: SpliceMethod
  /**
   * 配筋の層数 — シングル(1) か ダブル(2) か。本数がそのまま倍違うが、
   * これを決める条文は規準にない。壁リストの「D13@200 ダブル」という記載
   * そのものであり、断面一覧の入力である (ADR-012)。
   */
  layers: 1 | 2
  /** 縦筋 — 上下の梁・床板へ定着する */
  vertical: {
    size: BarSize
    pitch: number
    /**
     * 内法端から第1・最終の縦筋をどれだけ離すか。柱の hoop・大梁の stirrup と
     * 同じ理由で規準に値がなく、断面一覧の入力である (ADR-012)。1通則7) は
     * 初期オフセットを見ないので数量には効かない — 3D 形状だけの値である。
     */
    startOffsetMm: number
  }
  /** 横筋 — 両側の柱へ定着する */
  horizontal: {
    size: BarSize
    pitch: number
    /** 縦筋の startOffsetMm と同じ。こちらは内法高さの下端からの距離である。 */
    startOffsetMm: number
  }
}

/**
 * 床板（スラブ）の1方向・1面の主筋。
 *
 * 径もピッチも断面リストの入力である。数量積算基準 2（４）床板1) が「トップ筋、
 * ハンチ部分の主筋、補強筋等は設計図書による」と委ね、規準側に本数を定める
 * 条文がない (ADR-012)。ここが規準から引くのは定着長さだけだ。
 */
export interface SlabBarRow {
  size: BarSize
  pitch: number
  /**
   * 内法端から第1・最終の鉄筋をどれだけ離すか。柱の帯筋・大梁のあばら筋と
   * 同じ理由で規準に値がなく、断面一覧の入力である (ADR-012)。1通則7) は
   * 初期オフセットを見ないので数量には効かない — 3D 形状だけの値である。
   */
  startOffsetMm: number
}

/**
 * 床板（スラブ）— 数量積算基準 2（４）床板 で測る。
 *
 * 測る対象は内法だ。躯体の区分（第4編第1章第2節（４））が床板を「柱、梁等に
 * 接する水平材の内法部分」と定めるので、長さは通り芯間ではなく両側の大梁の
 * 内側面の間である。柱・大梁と二重に計上しないのはこの定義による (ADR-028)。
 *
 * `exposure` を持たないのは表5.3.6 の構造そのものだ。同表の「スラブ、耐力壁
 * 以外の壁」行は仕上げの有無だけで分かれ、屋内・屋外の区別を**持たない** —
 * 「柱、梁、耐力壁」行と違う。入力に置くと画面に効かないつまみが並ぶ。
 *
 * 幅止筋を持たないのは耐震壁と同じ理由である。1通則3) が長さを与える部材の
 * 列挙は「基礎梁、梁、壁梁、壁」で床板がなく、本数を定める条文もない。
 */
export interface SlabSection {
  id: string
  kind: '床板'
  mark: string
  /** ColumnSection.storyLabel と同じ。 */
  storyLabel?: string
  /** 板厚 (mm) */
  thickness: number
  fc: number
  grade: SteelGrade
  finish: Finish
  /** 主筋の継手方式。継手箇所数と設計長さへの算入を決める */
  spliceMethod: SpliceMethod
  /** X通り方向（X軸に沿って伸びる）の主筋 */
  x: { top: SlabBarRow; bottom: SlabBarRow }
  /** Y通り方向の主筋 */
  y: { top: SlabBarRow; bottom: SlabBarRow }
}

export type Section =
  | ColumnSection
  | GirderSection
  | WallSection
  | SlabSection

/**
 * 화면 표시·aria-label용 이름. 같은 符号이 階별로 여러 断面이 될 수 있으므로
 * 階를 여기서 붙인다 — 저장되는 `mark`는 도면의 符号 그대로 둔다.
 */
export function sectionMarkLabel(section: Section): string {
  return section.storyLabel
    ? `${section.mark}(${section.storyLabel})`
    : section.mark
}

export interface ColumnPosition {
  ix: number
  iy: number
}

export interface GirderPosition {
  axis: 'X' | 'Y'
  ix: number
  iy: number
}

/**
 * 耐震壁の位置。大梁と同じく通り芯の1スパン分の辺を占めるので形も同じである。
 *
 * TypeScript は構造的型付けなので、別名を作っても型としては GirderPosition と
 * 区別されない — どちらであるかを決めるのは常に `Member.kind` の方だ。位置だけを
 * 見て部材種別を判定するコードを書かないこと。
 */
export type WallPosition = GirderPosition

/**
 * 床板の位置 — 通り芯で囲まれた1ベイを占める。(ix, iy) はそのベイの原点側
 * （X・Y とも小さい側）の格子点で、ベイは (ix, iy)〜(ix+1, iy+1) である。
 *
 * 柱の ColumnPosition と形は同じだが指すものが違う（格子点かベイか）。
 * TypeScript は構造的型付けなので型では区別されない — どちらであるかを
 * 決めるのは常に `Member.kind` の方だ。
 */
export type SlabPosition = ColumnPosition

/**
 * 開口部 1か所 (数量積算基準 1通則8))。
 *
 * 断面ではなく **部材** に付く。同じ符号の壁が何枚も建つのに、窓はその1枚に
 * 開いているからだ — 断面に持たせると図面にない開口を製品が他の壁にも作る
 * ことになる (ADR-004)。
 *
 * 座標は部材の局所系で、原点は**内法域の原点**である。耐震壁なら始端の柱の
 * 内側面・上部大梁の下面から測った下端、床板ならランの始端の大梁内側面。
 * 局所 x・y の向きは配筋（`Rebar.points`）と同じなので、壁では x が壁の長さ、
 * y が壁の高さ、床板では x・y がそれぞれ X通り・Y通り方向になる。
 *
 * 寸法は「建具類等開口部の**内法寸法**」— 同項がそう定める。
 */
export interface Opening {
  id: string
  /** 内法域の原点から開口までの局所 x (mm) */
  xMm: number
  /** 同じく局所 y (mm) */
  yMm: number
  /** 局所 x 方向の内法寸法 (mm) */
  widthMm: number
  /** 局所 y 方向の内法寸法 (mm) */
  heightMm: number
}

export interface Member {
  id: string
  kind: MemberKind
  memberClass: MemberClass
  sectionId: string
  storyId: string
  position: ColumnPosition | GirderPosition | WallPosition | SlabPosition
  /**
   * この部材に開いている開口部 (1通則8))。未指定は「開口なし」であって
   * 「未入力」ではない — 製品は開口の有無を推定しないので、内訳書は開口補強筋を
   * 計上していないことを常時告知する (R14)。柱・大梁は受け取らない：同項が
   * 挙げるのは窓・出入口等で、それが開くのは壁と床板だからである。
   */
  openings?: Opening[]
}
