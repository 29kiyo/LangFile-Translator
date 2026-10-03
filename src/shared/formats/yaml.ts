import { isMap, isScalar, isSeq, parseDocument } from 'yaml'
import type { Node } from 'yaml'
import { pathId } from '../keyscan.ts'
import type { KeyPath } from '../keyscan.ts'
import type { Entry, SegmentFormat } from './types.ts'

/** 全角などは1文字、サロゲートペアは2文字 (Monaco の列は UTF-16 の単位) */
function posOf(starts: number[], off: number): { line: number; col: number } {
  let lo = 0
  let hi = starts.length - 1
  while (lo < hi) {
    const mid = (lo + hi + 1) >> 1
    if (starts[mid] <= off) lo = mid
    else hi = mid - 1
  }
  return { line: lo + 1, col: off - starts[lo] + 1 }
}

function scanYaml(text: string): Entry[] {
  const out: Entry[] = []
  const bom = text.charCodeAt(0) === 0xfeff ? 1 : 0
  const body = text.slice(bom)
  const doc = parseDocument(body, { keepSourceTokens: true })
  if (doc.errors.length) return []
  const starts = [0]
  for (let i = 0; i < text.length; i++) if (text[i] === '\n') starts.push(i + 1)

  const visit = (node: unknown, path: KeyPath, key: string): void => {
    if (isMap(node)) {
      for (const p of node.items) {
        const k = isScalar(p.key) ? String(p.key.value) : String(p.key)
        visit(p.value as Node | null, [...path, k], k)
      }
    } else if (isSeq(node)) {
      node.items.forEach((it, i) => visit(it, [...path, i], key))
    } else if (isScalar(node) && typeof node.value === 'string' && node.range) {
      const s = node.range[0] + bom
      const e = node.range[1] + bom
      const p0 = posOf(starts, s)
      const p1 = posOf(starts, e)
      const t = node.type
      const quoted = t === 'QUOTE_DOUBLE' || t === 'QUOTE_SINGLE'
      // 複数行 (| > や折り返し)・アンカー・タグ付きは翻訳しない
      const skip = p0.line !== p1.line || (t !== 'PLAIN' && !quoted) || !!node.anchor || !!node.tag
      out.push({
        key,
        path,
        id: pathId(path),
        line: p0.line,
        startCol: p0.col,
        endCol: p1.col,
        // 範囲は引用符を含むので、範囲全体ではなくデコード済みの値を使う
        text: node.value,
        quoted,
        raw: t === 'QUOTE_SINGLE' ? "'" : t === 'QUOTE_DOUBLE' ? '"' : undefined,
        skip
      })
    }
  }
  visit(doc.contents, [], '')
  return out
}

const needsQuote = (s: string): boolean =>
  s === '' ||
  /^[\s\-?:,[\]{}#&*!|>'"%@`]/.test(s) ||
  /:(\s|$)|\s#|\s$|[\n\r\t]/.test(s) ||
  /^(?:true|false|yes|no|on|off|null|~|[-+]?[\d.]+(?:e[-+]?\d+)?|0x[0-9a-f]+)$/i.test(s)

const dq = (s: string): string =>
  '"' +
  s
    .replace(/\\/g, '\\\\')
    .replace(/"/g, '\\"')
    .replace(/\n/g, '\\n')
    .replace(/\r/g, '\\r')
    .replace(/\t/g, '\\t') +
  '"'

export const YAML: SegmentFormat = {
  id: 'yaml',
  scan: scanYaml,
  encode: (s, e) => {
    if (s.includes('\n') || s.includes('\r')) return dq(s)
    if (e?.quoted) {
      // 元の引用符の種類を保つ ('…' は '' で ' を表す)。元が ' でも、翻訳文が単純なら ' のまま
      return e.raw === "'" ? `'${s.replace(/'/g, "''")}'` : dq(s)
    }
    return needsQuote(s) ? dq(s) : s
  }
}
