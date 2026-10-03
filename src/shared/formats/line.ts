import { pathId } from '../keyscan.ts'
import type { Entry, SegmentFormat } from './types.ts'

const isWs = (c: string | undefined): boolean => c === ' ' || c === '\t' || c === '\f'
const oddBackslashes = (s: string): boolean => ((/\\+$/.exec(s)?.[0].length ?? 0) % 2) === 1

function unescape(s: string): string {
  return s.replace(/\\(?:u([0-9a-fA-F]{4})|([\s\S]))/g, (_m: string, u: string | undefined, c: string | undefined) => {
    if (u) return String.fromCharCode(parseInt(u, 16))
    switch (c) {
      case 'n':
        return '\n'
      case 't':
        return '\t'
      case 'r':
        return '\r'
      case 'f':
        return '\f'
      default:
        return c as string
    }
  })
}

const escapeProps = (s: string): string =>
  s.replace(/\\/g, '\\\\').replace(/\n/g, '\\n').replace(/\r/g, '\\r').replace(/\t/g, '\\t')
const oneLine = (s: string): string => s.replace(/\r?\n/g, ' ')

/**
 * .properties (esc = true: \ のエスケープあり、区切りは = : 空白) と
 * .lang (esc = false: エスケープなし、区切りは = のみ)。
 * 行末が \ の継続行は、翻訳対象にしない
 */
function scanProps(text: string, esc: boolean): Entry[] {
  const out: Entry[] = []
  let cont = false
  text.split('\n').forEach((raw, li) => {
    const line = raw.endsWith('\r') ? raw.slice(0, -1) : raw
    if (cont) {
      cont = oddBackslashes(line)
      return
    }
    let i = li === 0 && line.charCodeAt(0) === 0xfeff ? 1 : 0
    while (isWs(line[i])) i++
    if (i >= line.length || line[i] === '#' || (esc && line[i] === '!')) return
    const ks = i
    while (i < line.length) {
      const c = line[i]
      if (esc && c === '\\') i += 2
      else if (c === '=' || (esc && (c === ':' || isWs(c)))) break
      else i++
    }
    const ke = Math.min(i, line.length)
    if (!esc && line[i] !== '=') return
    const rawKey = line.slice(ks, ke)
    const key = esc ? unescape(rawKey) : rawKey.trimEnd()
    while (isWs(line[i])) i++
    if (line[i] === '=' || (esc && line[i] === ':')) i++
    while (isWs(line[i])) i++
    if (esc && oddBackslashes(line)) {
      cont = true
      return
    }
    const vs = Math.min(i, line.length)
    const ve = line.length
    const value = line.slice(vs, ve)
    const path = [key]
    out.push({
      key,
      path,
      id: pathId(path),
      line: li + 1,
      startCol: vs + 1,
      endCol: ve + 1,
      text: esc ? unescape(value) : value
    })
  })
  return out
}

/** INI: [section] と key=value。; # の行はコメント。値を "" '' で囲んでいれば引用符は範囲に含めない */
function scanIni(text: string): Entry[] {
  const out: Entry[] = []
  let section = ''
  text.split('\n').forEach((raw, li) => {
    const line = raw.endsWith('\r') ? raw.slice(0, -1) : raw
    const bom = li === 0 && line.charCodeAt(0) === 0xfeff ? 1 : 0
    const t = line.slice(bom)
    const trimmed = t.trim()
    if (!trimmed || trimmed[0] === ';' || trimmed[0] === '#') return
    const sec = /^\[(.*)\]$/.exec(trimmed)
    if (sec) {
      section = sec[1].trim()
      return
    }
    const eq = t.indexOf('=')
    if (eq < 0) return
    const key = t.slice(0, eq).trim()
    if (!key) return
    let vs = bom + eq + 1
    while (isWs(line[vs])) vs++
    let ve = line.length
    while (ve > vs && isWs(line[ve - 1])) ve--
    const q = line[vs]
    if (ve - vs >= 2 && (q === '"' || q === "'") && line[ve - 1] === q) {
      vs++
      ve--
    }
    const path = [section, key]
    out.push({ key, path, id: pathId(path), line: li + 1, startCol: vs + 1, endCol: ve + 1, text: line.slice(vs, ve) })
  })
  return out
}

export const PROPERTIES: SegmentFormat = { id: 'properties', scan: (t) => scanProps(t, true), encode: escapeProps }
export const LANG: SegmentFormat = { id: 'lang', scan: (t) => scanProps(t, false), encode: oneLine }
export const INI: SegmentFormat = { id: 'ini', scan: scanIni, encode: oneLine }
