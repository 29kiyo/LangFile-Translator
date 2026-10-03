import type { Language } from './languages.ts'
import { LANGUAGES, fileBaseName } from './languages.ts'
import type { FormatId } from './formats/types.ts'
import { extFor } from './formats/index.ts'

const KNOWN = new Set(LANGUAGES.map((l) => l.code.split('-')[0]))

interface Found {
  start: number
  end: number
  region: string
  regionSep: string
}

/** 名前を英数字の単語に分け、最初に見つかった言語コード (+ 任意の スクリプト + 地域) を返す */
function findCode(base: string): Found | null {
  const toks = [...base.matchAll(/[A-Za-z0-9]+/g)].map((m) => ({ s: m[0], i: m.index as number }))
  const sepBefore = (k: number): string => base.slice(toks[k - 1].i + toks[k - 1].s.length, toks[k].i)
  for (let k = 0; k < toks.length; k++) {
    const t = toks[k]
    if (!/^[A-Za-z]{2,3}$/.test(t.s) || !KNOWN.has(t.s.toLowerCase())) continue
    if (k > 0 && !/^[_.-]$/.test(sepBefore(k))) continue
    let end = t.i + t.s.length
    let j = k + 1
    // 任意のスクリプト (zh_Hans_CN の Hans)
    if (toks[j] && /^[_-]$/.test(sepBefore(j)) && /^[A-Za-z]{4}$/.test(toks[j].s)) {
      end = toks[j].i + toks[j].s.length
      j++
    }
    let region = ''
    let regionSep = ''
    if (toks[j] && /^[_-]$/.test(sepBefore(j)) && /^[A-Za-z]{2}$/.test(toks[j].s)) {
      region = toks[j].s
      regionSep = sepBefore(j)
      end = toks[j].i + toks[j].s.length
    }
    return { start: t.i, end, region, regionSep }
  }
  return null
}

/**
 * 翻訳結果の出力ファイル名。
 * 元の名前に言語コードがあれば、その形式 (en_US → ja_JP、en → ja、大文字小文字・区切り文字も元に合わせる) で翻訳先に置き換える。
 * 無ければ ja_jp の形にする。拡張子は元のまま (無ければ defaultExt)
 */
export function outputName(srcName: string, l: Language, defaultExt = 'json'): string {
  const dot = srcName.lastIndexOf('.')
  const hasExt = dot > 0 && dot < srcName.length - 1
  const base = hasExt ? srcName.slice(0, dot) : srcName
  const ext = (hasExt ? srcName.slice(dot) : `.${defaultExt}`).replace(/\.pot$/i, '.po')

  const f = findCode(base)
  if (!f) return `${fileBaseName(l)}${ext}`

  const [lang, codeRegion = ''] = l.code.split('-')
  // 地域付きコード (zh-CN) は常に地域付き。それ以外は、元に地域があるときだけ付ける
  const outRegion = codeRegion || (f.region ? l.region : '')
  let name = lang
  if (outRegion) {
    const upper = !!f.region && f.region === f.region.toUpperCase()
    // スクリプト (sr-Latn の Latn) は先頭だけ大文字のまま、地域 (JP) は元に合わせる
    const r = outRegion.length === 4 ? (upper ? outRegion : outRegion.toLowerCase()) : upper ? outRegion.toUpperCase() : outRegion.toLowerCase()
    name += (f.regionSep || '_') + r
  }
  return base.slice(0, f.start) + name + base.slice(f.end) + ext
}

/** Android のリソースフォルダ名 (ja → values-ja、zh-CN → values-zh-rCN) */
export function androidDir(l: Language): string {
  const [lang, region] = l.code.split('-')
  if (region && region.length === 4) return `values-b+${lang}+${region}`
  return `values-${lang}${region ? `-r${region.toUpperCase()}` : ''}`
}

/** 保存する相対パス。Android は values-ja/strings.xml、それ以外は outputName */
export function outputPath(srcName: string, l: Language, format: FormatId): string {
  if (format === 'xml') return `${androidDir(l)}/strings.xml`
  return outputName(srcName, l, extFor(format))
}
