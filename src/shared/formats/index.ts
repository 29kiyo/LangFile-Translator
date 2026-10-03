import type { KeyEntry, Marks } from '../keyscan.ts'
import { isIgnoredId, scanKeys, scanStrings } from '../keyscan.ts'
import type { Mode } from '../translate-core.ts'
import { isTranslatable } from '../translate-core.ts'
import { applyReplacements } from '../textedit.ts'
import type { Untranslated } from '../untranslated.ts'
import { findUntranslated, needsTranslation } from '../untranslated.ts'
import type { Entry, FormatId, SegmentFormat } from './types.ts'
import { INI, LANG, PROPERTIES } from './line.ts'
import { CSV, CSV_NH, TSV, TSV_NH, csvColumns, detectDelim } from './csv.ts'

export type { Entry, FormatId, SegmentFormat }

const SEGMENT: Partial<Record<FormatId, SegmentFormat>> = {
  ini: INI,
  properties: PROPERTIES,
  lang: LANG,
  csv: CSV,
  tsv: TSV,
  'csv-nh': CSV_NH,
  'tsv-nh': TSV_NH
}
const EXT: Record<string, FormatId> = {
  json: 'json',
  arb: 'arb',
  ini: 'ini',
  properties: 'properties',
  lang: 'lang',
  csv: 'csv',
  tsv: 'tsv'
}

/** 拡張子が無いとき (直接入力) は内容から推定する */
export function inferFormat(text: string): FormatId {
  const t = text.replace(/^\uFEFF/, '')
  try {
    JSON.parse(t)
    return 'json'
  } catch {
    // JSON ではない
  }
  if (/^\s*\[[^\]\n]+\]\s*$/m.test(t) && /^[^=\n]+=/m.test(t)) return 'ini'
  if (/^\s*[^#!;\s][^=\n]*=/m.test(t)) return 'properties'
  return 'json'
}

/** 形式を返す。拡張子が未対応なら null (「未対応の形式」と表示する) */
export function detectFormat(name: string, text: string): FormatId | null {
  const m = /\.([^.\\/]+)$/.exec(name)
  if (!m) return inferFormat(text)
  return EXT[m[1].toLowerCase()] ?? null
}

/** 「キーも翻訳」が使える形式 */
export const supportsKeyMode = (f: FormatId): boolean => f === 'json'

/** ARB は @ で始まるキー (@@locale と @xxx のメタ情報) を無視する */
export function effectiveIgnore(format: FormatId, text: string, ignore: Set<string>): Set<string> {
  if (format !== 'arb') return ignore
  const s = new Set(ignore)
  for (const e of scanKeys(text)) if (e.key.startsWith('@')) s.add(e.key)
  return s
}

/** 行マーカー用: キーを持つ行 */
export function keyEntries(format: FormatId, text: string): KeyEntry[] {
  const seg = SEGMENT[format]
  if (!seg) return scanKeys(text)
  // CSV は列単位で選ぶ (行ごとの赤い点は出さない)
  if (isCsv(format)) return []
  return seg.scan(text).map((e) => ({ line: e.line, key: e.key, path: e.path, id: e.id }))
}

export interface Plan {
  texts: string[]
  build: (m: Map<string, string>) => string
}

/** 1行 = 1キーの形式の翻訳計画。該当しない形式 (json / arb) は null */
export function planSegments(format: FormatId, text: string, ignore: Set<string>, marks?: Marks): Plan | null {
  const fmt = SEGMENT[format]
  if (!fmt) return null
  const active = fmt.scan(text).filter((e) => !e.skip && !isIgnoredId(e.key, e.id, ignore, marks) && isTranslatable(e.text))
  return {
    texts: [...new Set(active.map((e) => e.text))],
    build: (m) =>
      applyReplacements(
        text,
        active
          .filter((e) => m.has(e.text) && m.get(e.text) !== e.text)
          .map((e) => ({
            line: e.line,
            startCol: e.startCol,
            endCol: e.endCol,
            text: fmt.encode(m.get(e.text) as string, e)
          }))
      )
  }
}

/** 再翻訳などで、翻訳結果を原文に埋め込む文字列にする (JSON / ARB は引用符付き) */
export function encodeFor(format: FormatId): (s: string) => string {
  return SEGMENT[format]?.encode ?? ((s) => JSON.stringify(s))
}

/** 翻訳後の仕上げ。ARB は @@locale を翻訳先のコードにする */
export function finalize(format: FormatId, text: string, to: string): string {
  if (format !== 'arb') return text
  const t = scanStrings(text)
  const i = t.findIndex((x) => x.kind === 'key' && x.text === '@@locale' && x.path.length === 1)
  const v = i >= 0 ? t[i + 1] : undefined
  if (!v || v.kind !== 'value') return text
  return applyReplacements(text, [
    { line: v.line, startCol: v.startCol, endCol: v.endCol, text: JSON.stringify(to.replace(/-/g, '_')) }
  ])
}

/** 形式ごとの未翻訳判定 (画面側はこれを呼ぶ) */
export function findUntranslatedFor(
  format: FormatId,
  source: string,
  output: string,
  mode: Mode,
  ignore: Set<string>,
  marks?: Marks,
  dismissed?: Set<number>
): Untranslated[] {
  const ign = effectiveIgnore(format, source, ignore)
  const fmt = SEGMENT[format]
  if (!fmt) return findUntranslated(source, output, supportsKeyMode(format) ? mode : 'structure', ign, marks, dismissed)
  const src = fmt.scan(source)
  const out = fmt.scan(output)
  if (src.length !== out.length) return []
  const res: Untranslated[] = []
  for (let i = 0; i < src.length; i++) {
    const s = src[i]
    const o = out[i]
    if (s.key !== o.key) return []
    if (s.skip || isIgnoredId(s.key, s.id, ign, marks) || dismissed?.has(i)) continue
    if (s.text !== o.text || !needsTranslation(s.text)) continue
    res.push({ line: o.line, idx: i, kind: 'value', source: s.text, startCol: o.startCol, endCol: o.endCol })
  }
  return res
}

/** CSV / TSV 系の形式 (csv-nh / tsv-nh は見出し行なし) */
export const isCsv = (f: FormatId): boolean => f === 'csv' || f === 'tsv' || f === 'csv-nh' || f === 'tsv-nh'
export const hasHeader = (f: FormatId): boolean => f === 'csv' || f === 'tsv'

/** 見出し行の有無を切り替えた形式 (CSV / TSV 以外はそのまま) */
export function withHeader(f: FormatId, header: boolean): FormatId {
  if (!isCsv(f)) return f
  const base = f.startsWith('tsv') ? 'tsv' : 'csv'
  return (header ? base : `${base}-nh`) as FormatId
}

/** CSV の列名 (左から、重複なし。見出しが無い・空の列は列番号) */
export function csvColumnNames(f: FormatId, text: string): string[] {
  if (!isCsv(f)) return []
  const delim = f.startsWith('tsv') ? '\t' : detectDelim(text)
  return [...new Set(csvColumns(text, delim, hasHeader(f)))]
}

/** 出力ファイルの既定の拡張子 */
export const extFor = (f: FormatId): string => (isCsv(f) ? f.slice(0, 3) : f)
