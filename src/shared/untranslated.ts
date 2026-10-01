import type { Mode } from '../main/translate/core.ts'
import { isTranslatable, protect } from '../main/translate/core.ts'
import type { KeyPath, Marks } from './keyscan.ts'
import { isIgnored, scanStrings } from './keyscan.ts'

export { parseIgnoreKeys } from '../main/translate/core.ts'

export interface Untranslated {
  /** 出力テキストの行 (1始まり) */
  line: number
  /** 原文の文字列の通し番号 (右クリックで対象外にするときの識別子) */
  idx: number
  kind: 'key' | 'value'
  /** 原文の文字列 */
  source: string
  /** 出力側の文字列の範囲 (クォートを含む、Monaco の列) */
  startCol: number
  endCol: number
}

const URL_RE = /^(?:https?:\/\/|www\.)\S+$/i
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

/** 訳す意味のある文字列か (文字を含む。プレースホルダ/タグのみ・URL・メールアドレスは除く) */
export function needsTranslation(s: string): boolean {
  if (!isTranslatable(s)) return false
  if (URL_RE.test(s) || EMAIL_RE.test(s)) return false
  return isTranslatable(protect(s).text)
}

interface Tok {
  kind: 'key' | 'value'
  text: string
  ignored: boolean
}

/** 翻訳エンジン (core.walk) と同じ順序・同じ無視規則で、原文の文字列を並べる */
function sourceTokens(
  node: unknown,
  ignore: Set<string>,
  marks: Marks | undefined,
  parentIgnored: boolean,
  path: KeyPath,
  out: Tok[]
): void {
  if (typeof node === 'string') {
    out.push({ kind: 'value', text: node, ignored: parentIgnored })
  } else if (Array.isArray(node)) {
    node.forEach((n, i) => sourceTokens(n, ignore, marks, parentIgnored, marks ? [...path, i] : path, out))
  } else if (node !== null && typeof node === 'object') {
    for (const [k, v] of Object.entries(node as Record<string, unknown>)) {
      const p = marks ? [...path, k] : path
      const ign = parentIgnored || isIgnored(k, p, ignore, marks)
      out.push({ kind: 'key', text: k, ignored: ign })
      sourceTokens(v, ignore, marks, ign, p, out)
    }
  }
}

/**
 * 出力のうち、翻訳対象なのに原文のまま残っている文字列を返す (行番号は出力側)。
 * 原文と出力は先頭から順に突き合わせる。構造が合わない (個数や種類が違う) ときは判定できないので空を返す
 */
export function findUntranslated(
  source: string,
  output: string,
  mode: Mode,
  ignore: Set<string>,
  marks?: Marks,
  dismissed?: Set<number>
): Untranslated[] {
  let json: unknown
  try {
    json = JSON.parse(source.replace(/^\uFEFF/, ''))
  } catch {
    return []
  }
  const src: Tok[] = []
  sourceTokens(json, ignore, marks, false, [], src)
  const out = scanStrings(output)
  if (src.length !== out.length) return []
  const res: Untranslated[] = []
  for (let i = 0; i < src.length; i++) {
    const s = src[i]
    const o = out[i]
    if (s.kind !== o.kind) return []
    if (s.ignored || dismissed?.has(i)) continue
    if (s.kind === 'key' && mode !== 'keys') continue
    if (s.text !== o.text || !needsTranslation(s.text)) continue
    res.push({ line: o.line, idx: i, kind: s.kind, source: s.text, startCol: o.startCol, endCol: o.endCol })
  }
  return res
}
