export type KeyPath = (string | number)[]

export interface Marks {
  /** 行マーカーで個別に無視する出現位置 (パスを JSON.stringify した文字列) */
  marked: Set<string>
  /** 無視キーの一覧に載っていても、個別に翻訳対象へ戻す出現位置 */
  released: Set<string>
}

export const pathId = (p: KeyPath): string => JSON.stringify(p)

/**
 * 無視するかの判定 (翻訳エンジンと画面で共通)。
 * 一覧にあるキーは released 以外の全てを無視、一覧にないキーは marked の出現位置だけを無視する
 */
export function isIgnoredId(key: string, id: string, ignore: Set<string>, marks?: Marks): boolean {
  if (!marks) return ignore.has(key)
  return ignore.has(key) ? !marks.released.has(id) : marks.marked.has(id)
}

export function isIgnored(key: string, path: KeyPath, ignore: Set<string>, marks?: Marks): boolean {
  return isIgnoredId(key, marks ? pathId(path) : '', ignore, marks)
}

export interface KeyEntry {
  /** キーのある行 (1始まり) */
  line: number
  key: string
  path: KeyPath
  id: string
}

/** JSONテキストを走査し、全てのキーについて 行・キー名・パス を返す (途中まで壊れたJSONでも動く) */
export function scanKeys(text: string): KeyEntry[] {
  interface Frame {
    obj: boolean
    key: string
    index: number
  }
  const out: KeyEntry[] = []
  const stack: Frame[] = []
  const n = text.length
  let line = 1
  let i = 0
  while (i < n) {
    const c = text[i]
    if (c === '\n') {
      line++
      i++
    } else if (c === '"') {
      const start = i
      const startLine = line
      i++
      while (i < n && text[i] !== '"') {
        if (text[i] === '\\') i++
        if (text[i] === '\n') line++
        i++
      }
      i++
      const top = stack[stack.length - 1]
      if (top && top.obj) {
        let j = i
        while (j < n && (text[j] === ' ' || text[j] === '\t' || text[j] === '\r' || text[j] === '\n')) j++
        if (text[j] === ':') {
          let key = text.slice(start + 1, i - 1)
          try {
            key = JSON.parse(text.slice(start, i)) as string
          } catch {
            // 壊れた文字列はそのまま使う
          }
          top.key = key
          const path = stack.map((f) => (f.obj ? f.key : f.index))
          out.push({ line: startLine, key, path, id: pathId(path) })
        }
      }
    } else if (c === '{') {
      stack.push({ obj: true, key: '', index: 0 })
      i++
    } else if (c === '[') {
      stack.push({ obj: false, key: '', index: 0 })
      i++
    } else if (c === '}' || c === ']') {
      stack.pop()
      i++
    } else if (c === ',') {
      const top = stack[stack.length - 1]
      if (top && !top.obj) top.index++
      i++
    } else {
      i++
    }
  }
  return out
}
