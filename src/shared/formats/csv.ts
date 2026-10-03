import { pathId } from '../keyscan.ts'
import type { Entry, FormatId, SegmentFormat } from './types.ts'

interface Cell {
  text: string
  line: number
  /** 引用符を含む、セル全体の範囲 (Monaco と同じ列) */
  startCol: number
  endCol: number
  quoted: boolean
  /** 複数行のセル、または引用符の後ろに余計な文字があるセル (翻訳しない) */
  multi: boolean
}

/** 1行目 (引用符の外) の , ; タブ のうち最も多いものを区切り文字にする。同数なら , を優先 */
export function detectDelim(text: string): string {
  const n: Record<string, number> = { ',': 0, ';': 0, '\t': 0 }
  let q = false
  for (let i = text.charCodeAt(0) === 0xfeff ? 1 : 0; i < text.length; i++) {
    const c = text[i]
    if (c === '"') q = !q
    else if (!q && c === '\n') break
    else if (!q && c in n) n[c]++
  }
  let best = ','
  for (const d of [';', '\t']) if (n[d] > n[best]) best = d
  return best
}

function parseCsv(text: string, delim: string): Cell[][] {
  const rows: Cell[][] = []
  const n = text.length
  let i = text.charCodeAt(0) === 0xfeff ? 1 : 0
  let line = 1
  let lineStart = 0
  while (i < n) {
    const cells: Cell[] = []
    for (;;) {
      const s = i
      const sLine = line
      const sStart = lineStart
      let value: string
      let quoted = false
      let junk = false
      let end: number
      if (text[i] === '"') {
        quoted = true
        i++
        let v = ''
        while (i < n) {
          const c = text[i]
          if (c === '"') {
            if (text[i + 1] === '"') {
              v += '"'
              i += 2
              continue
            }
            i++
            break
          }
          if (c === '\n') {
            line++
            lineStart = i + 1
          }
          v += c
          i++
        }
        end = i
        while (i < n && text[i] !== delim && text[i] !== '\n') {
          if (text[i] !== '\r') junk = true
          i++
        }
        value = v
      } else {
        while (i < n && text[i] !== delim && text[i] !== '\n') i++
        end = i
        if (end > s && text[end - 1] === '\r') end--
        value = text.slice(s, end)
      }
      cells.push({
        text: value,
        line: sLine,
        startCol: s - sStart + 1,
        endCol: end - lineStart + 1,
        quoted,
        multi: line !== sLine || junk
      })
      if (text[i] === delim) {
        i++
        continue
      }
      if (text[i] === '\n') {
        i++
        line++
        lineStart = i
      }
      break
    }
    // 空行は行として数えない
    if (!(cells.length === 1 && cells[0].text === '' && !cells[0].quoted)) rows.push(cells)
  }
  return rows
}

const colName = (head: Cell[] | undefined, j: number): string => head?.[j]?.text.trim() || String(j + 1)

/** 列名の一覧 (列ごと。見出しが無い・空の列は列番号) */
export function csvColumns(text: string, delim: string, header: boolean): string[] {
  const rows = parseCsv(text, delim)
  const width = rows.reduce((m, r) => Math.max(m, r.length), 0)
  const head = header ? rows[0] : undefined
  return Array.from({ length: width }, (_, j) => colName(head, j))
}

function scanCsv(text: string, fixed: string | undefined, header: boolean): Entry[] {
  const rows = parseCsv(text, fixed ?? detectDelim(text))
  const head = header ? rows[0] : undefined
  const out: Entry[] = []
  for (const r of rows.slice(header ? 1 : 0)) {
    r.forEach((c, j) => {
      const key = colName(head, j)
      const path = [key]
      out.push({
        key,
        path,
        id: pathId(path),
        line: c.line,
        startCol: c.startCol,
        endCol: c.endCol,
        text: c.text,
        quoted: c.quoted,
        skip: c.multi
      })
    })
  }
  return out
}

/** CSV: 元が引用符付きなら付ける。区切り文字・引用符・改行を含むときも付ける (" は "" にする) */
export function makeCsv(id: FormatId, fixed: string | undefined, header: boolean): SegmentFormat {
  const special = fixed === '\t' ? /["\t\r\n]/ : /[",;\t\r\n]/
  return {
    id,
    scan: (t) => scanCsv(t, fixed, header),
    encode: (s, e) => (e?.quoted || special.test(s) ? `"${s.replace(/"/g, '""')}"` : s)
  }
}

export const CSV = makeCsv('csv', undefined, true)
export const TSV = makeCsv('tsv', '\t', true)
export const CSV_NH = makeCsv('csv-nh', undefined, false)
export const TSV_NH = makeCsv('tsv-nh', '\t', false)
