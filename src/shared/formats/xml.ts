import { pathId } from '../keyscan.ts'
import type { Entry, SegmentFormat } from './types.ts'

/** コメントを同じ長さの空白にする (位置を保つ) */
const mask = (s: string): string => s.replace(/<!--[\s\S]*?-->/g, (m) => m.replace(/[^\n]/g, ' '))

const attr = (attrs: string, name: string): string =>
  new RegExp(`\\b${name}\\s*=\\s*["']([^"']*)["']`).exec(attrs)?.[1] ?? ''

/**
 * Android の strings.xml。<string> / <string-array> の <item> / <plurals> の <item> の中身 (XML のまま) を1件にする。
 * translatable="false"・複数行・CDATA・コメント入り・全体が引用符の項目は skip
 */
function scanXml(text: string): Entry[] {
  const src = mask(text)
  const starts = [0]
  for (let i = 0; i < text.length; i++) if (text[i] === '\n') starts.push(i + 1)
  const pos = (off: number): { line: number; col: number } => {
    let lo = 0
    let hi = starts.length - 1
    while (lo < hi) {
      const mid = (lo + hi + 1) >> 1
      if (starts[mid] <= off) lo = mid
      else hi = mid - 1
    }
    return { line: lo + 1, col: off - starts[lo] + 1 }
  }

  const out: Entry[] = []
  const re = /<(\/?)(string-array|plurals|string|item)\b([^>]*)>/g
  let parent: { name: string; plurals: boolean; i: number; off: boolean } | null = null
  let m: RegExpExecArray | null
  while ((m = re.exec(src))) {
    const [whole, close, tag, attrs] = m
    if (tag === 'string-array' || tag === 'plurals') {
      parent =
        close || attrs.endsWith('/')
          ? null
          : { name: attr(attrs, 'name'), plurals: tag === 'plurals', i: 0, off: attr(attrs, 'translatable') === 'false' }
      continue
    }
    if (close || attrs.endsWith('/')) continue
    const closeTag = `</${tag}>`
    const start = m.index + whole.length
    const end = src.indexOf(closeTag, start)
    if (end < 0) break
    re.lastIndex = end + closeTag.length

    let key: string
    let path: (string | number)[]
    let off = attr(attrs, 'translatable') === 'false'
    if (tag === 'string') {
      key = attr(attrs, 'name')
      path = ['string', key]
    } else {
      if (!parent) continue
      key = parent.name
      const idx = parent.i++
      path = [key, parent.plurals ? attr(attrs, 'quantity') || idx : idx]
      off = off || parent.off
    }
    if (!key) continue
    const inner = text.slice(start, end)
    const p0 = pos(start)
    const p1 = pos(end)
    const quotedAll = inner.length >= 2 && inner.startsWith('"') && inner.endsWith('"')
    out.push({
      key,
      path,
      id: pathId(path),
      line: p0.line,
      startCol: p0.col,
      endCol: p1.col,
      text: inner,
      skip: off || p0.line !== p1.line || inner.includes('<![CDATA[') || inner.includes('<!--') || quotedAll
    })
  }
  return out
}

function fixText(s: string): string {
  return s
    .replace(/\\(['"])/g, '$1')
    .replace(/\r?\n/g, '\\n')
    .replace(/&(?!(?:[a-zA-Z]+|#\d+|#x[0-9a-fA-F]+);)/g, '&amp;')
    .replace(/<(?![a-zA-Z/!])/g, '&lt;')
    .replace(/'/g, "\\'")
    .replace(/"/g, '\\"')
}

/** 翻訳文を Android の書き方にする。タグ (<b> <a href="..."> など) の中は触らない */
export function encodeAndroid(s: string): string {
  return s
    .split(/(<\/?[a-zA-Z][^<>]*>)/)
    .map((p, i) => (i % 2 ? p : fixText(p)))
    .join('')
}

export const XML: SegmentFormat = { id: 'xml', scan: scanXml, encode: encodeAndroid }
