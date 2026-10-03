import type { KeyPath } from '../keyscan.ts'

export type FormatId = 'json' | 'arb' | 'ini' | 'properties' | 'lang' | 'csv' | 'tsv' | 'csv-nh' | 'tsv-nh'

/** 1つの値 (翻訳対象の候補)。位置は Monaco と同じ列 (1始まり、endCol は含まない) */
export interface Entry {
  key: string
  path: KeyPath
  /** 出現位置の識別子 (pathId と同じ形式。行マーカー用) */
  id: string
  line: number
  startCol: number
  endCol: number
  /** デコード済みの値 */
  text: string
  /** 元が引用符付き (CSV) */
  quoted?: boolean
  /** 翻訳しない (複数行のセルなど) */
  skip?: boolean
}

/** 1行 = 1キーの形式 (ini / properties / lang) */
export interface SegmentFormat {
  id: FormatId
  scan(text: string): Entry[]
  /** 翻訳結果を、原文に埋め込む文字列にする */
  encode(s: string, e?: Entry): string
}
