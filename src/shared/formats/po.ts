import { pathId } from '../keyscan.ts'
import type { Entry, SegmentFormat } from './types.ts'

const unq = (s: string): string =>
  s.replace(/\\([\s\S])/g, (_m, c: string) => (c === 'n' ? '\n' : c === 't' ? '\t' : c === 'r' ? '\r' : c))

const esc = (s: string): string =>
  '"' +
  s.replace(/\\/g, '\\\\').replace(/"/g, '\\"').replace(/\n/g, '\\n').replace(/\t/g, '\\t').replace(/\r/g, '\\r') +
  '"'

interface Slot {
  n: number
  line: number
  startCol: number
  endCol: number
  value: string
  multi: boolean
}

/**
 * PO / POT。msgstr ごとに1件 (範囲は引用符を含む)。
 * 空の msgstr だけが翻訳対象で、text は原文 (msgid / msgid_plural)。値が入っている・複数行の msgstr は skip。ヘッダー (msgid "") は出さない
 */
function scanPo(text: string): Entry[] {
  const out: Entry[] = []
  let ctxt = ''
  let id = ''
  let plural = ''
  let hasId = false
  let slots: Slot[] = []
  let cur: { kind: 'ctxt' | 'id' | 'plural' | 'str'; slot?: Slot } | null = null

  const flush = (): void => {
    if (slots.length && hasId && id !== '') {
      for (const s of slots) {
        const path = [ctxt ? `${ctxt}\u0004${id}` : id, s.n]
        const filled = s.value !== '' || s.multi
        out.push({
          key: id,
          path,
          id: pathId(path),
          line: s.line,
          startCol: s.startCol,
          endCol: s.endCol,
          text: filled ? s.value : s.n >= 1 && plural ? plural : id,
          skip: filled
        })
      }
    }
    ctxt = ''
    id = ''
    plural = ''
    hasId = false
    slots = []
    cur = null
  }

  text.split('\n').forEach((raw, li) => {
    const line = raw.endsWith('\r') ? raw.slice(0, -1) : raw
    const off = li === 0 && line.charCodeAt(0) === 0xfeff ? 1 : 0
    const t = line.slice(off)
    if (t.trim() === '') {
      flush()
      return
    }
    if (t[0] === '#') {
      if (slots.length) flush()
      return
    }
    const q1 = t.indexOf('"')
    const q2 = t.lastIndexOf('"')
    if (q2 <= q1) return
    const val = unq(t.slice(q1 + 1, q2))
    const m = /^(msgctxt|msgid_plural|msgid|msgstr)(?:\[(\d+)\])?\s+"/.exec(t)
    if (!m) {
      if (!/^\s*"/.test(t) || !cur) return
      if (cur.kind === 'ctxt') ctxt += val
      else if (cur.kind === 'id') id += val
      else if (cur.kind === 'plural') plural += val
      else if (cur.slot) {
        cur.slot.value += val
        cur.slot.multi = true
      }
      return
    }
    const kw = m[1]
    if ((kw === 'msgctxt' || kw === 'msgid') && slots.length) flush()
    if (kw === 'msgctxt') {
      ctxt = val
      cur = { kind: 'ctxt' }
    } else if (kw === 'msgid') {
      id = val
      hasId = true
      cur = { kind: 'id' }
    } else if (kw === 'msgid_plural') {
      plural = val
      cur = { kind: 'plural' }
    } else {
      const slot: Slot = {
        n: m[2] ? Number(m[2]) : 0,
        line: li + 1,
        startCol: off + q1 + 1,
        endCol: off + q2 + 2,
        value: val,
        multi: false
      }
      slots.push(slot)
      cur = { kind: 'str', slot }
    }
  })
  flush()
  return out
}

export const PO: SegmentFormat = { id: 'po', scan: scanPo, encode: esc }

/** ヘッダーの Language: を翻訳先のコードにする */
export function finalizePo(text: string, to: string): string {
  return text.replace(/^("Language:[ \t]*)[^\\"\n]*(\\n")/m, (_m, a: string, b: string) => a + to.replace(/-/g, '_') + b)
}
