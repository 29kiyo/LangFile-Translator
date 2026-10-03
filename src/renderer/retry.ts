import type { Untranslated } from '@shared/untranslated'
import type { FormatId } from '@shared/formats/types'
import { encodeFor } from '@shared/formats/index'

export interface RetryEdit {
  line: number
  startCol: number
  endCol: number
  /** 差し替える文字列 (形式に合わせたもの。JSON / ARB はクォート付き) */
  text: string
}

/**
 * 未翻訳の文字列だけを再翻訳し、差し替える範囲と新しい文字列を返す (既存の翻訳IPCを使う)。
 * 翻訳には時間がかかるので、差し替える位置は、翻訳後に currentList() で最新の内容から求め直す。
 * 同じ文字列が返った項目は差し替えない
 */
export async function retranslate(
  items: Untranslated[],
  to: string,
  currentList: () => Untranslated[],
  format: FormatId = 'json'
): Promise<{ ok: boolean; message: string; edits: RetryEdit[] }> {
  const sources = [...new Set(items.map((u) => u.source))]
  const r = await window.api.translate({
    text: JSON.stringify(sources),
    mode: 'structure',
    ignoreKeys: '',
    from: 'auto',
    to
  })
  if (!r.ok) return { ok: false, message: r.message, edits: [] }
  let arr: unknown = null
  try {
    arr = JSON.parse(r.text)
  } catch {
    arr = null
  }
  if (!Array.isArray(arr) || arr.length !== sources.length || !arr.every((x) => typeof x === 'string')) {
    return { ok: false, message: 'Invalid response', edits: [] }
  }
  const map = new Map(sources.map((s, i) => [s, arr[i] as string] as const))
  const wanted = new Set(items.map((u) => u.idx))
  const edits: RetryEdit[] = []
  for (const u of currentList()) {
    if (!wanted.has(u.idx)) continue
    const tr = map.get(u.source)
    if (tr === undefined || tr === u.source) continue
    edits.push({ line: u.line, startCol: u.startCol, endCol: u.endCol, text: encodeFor(format)(tr) })
  }
  return { ok: true, message: '', edits }
}
