export type KeyPath = (string | number)[]

export interface Marks {
  /** 行マーカーで個別に無視する出現位置 (パスを JSON.stringify した文字列) */
  marked: Set<string>
  /** 無視キーの一覧に載っていても、個別に翻訳対象へ戻す出現位置 */
  released: Set<string>
  /** 入力バーの「翻訳するキー」 */
  only?: Set<string>
  /** 翻訳する (青) の指定があるとき true。決まっていない値は翻訳しない */
  restrict?: boolean
}

export const pathId = (p: KeyPath): string => JSON.stringify(p)

/**
 * 無視するかの判定 (翻訳エンジンと画面で共通)。
 * 一覧にあるキーは released 以外の全てを無視、一覧にないキーは marked の出現位置だけを無視する
 */
export type Own = 'ignore' | 'translate' | undefined

/** 1つの出現位置の判定。行の点 (marked / released) > 入力バー (同じキーが両方にあれば「翻訳しない」が勝つ)。決まらなければ undefined */
export function verdictOf(key: string, id: string, ignore: Set<string>, marks?: Marks): Own {
  if (marks) {
    if (marks.marked.has(id)) return 'ignore'
    if (marks.released.has(id)) return 'translate'
  }
  if (ignore.has(key)) return 'ignore'
  if (marks?.only?.has(key)) return 'translate'
  return undefined
}

export function verdict(key: string, path: KeyPath, ignore: Set<string>, marks?: Marks): Own {
  return verdictOf(key, marks ? pathId(path) : '', ignore, marks)
}

/** 近い方優先: 自分の判定が無ければ、親の状態を引き継ぐ */
export const stateOf = (parent: Own, own: Own): Own => own ?? parent

/** 翻訳するか。決まっていないときは、翻訳する指定 (青) があれば翻訳しない */
export const isActive = (s: Own, marks?: Marks): boolean => s === 'translate' || (s === undefined && !marks?.restrict)

export function isIgnoredId(key: string, id: string, ignore: Set<string>, marks?: Marks): boolean {
  return verdictOf(key, id, ignore, marks) === 'ignore'
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

export interface StrToken {
  kind: 'key' | 'value'
  /** JSON としてデコードした文字列 */
  text: string
  /** 開始位置の行 (1始まり) と、クォートを含む範囲の列 (Monaco と同じ: 1始まり、endCol は含まない) */
  line: number
  startCol: number
  endCol: number
  /** key のときだけ設定 (value は [] / '') */
  path: KeyPath
  id: string
}

/** JSONテキスト中の全ての文字列 (キーと値) を、出現順に 位置付きで返す (途中まで壊れたJSONでも動く) */
export function scanStrings(text: string): StrToken[] {
  interface Frame {
    obj: boolean
    key: string
    index: number
  }
  const out: StrToken[] = []
  const stack: Frame[] = []
  const n = text.length
  let line = 1
  let lineStart = 0
  let i = 0
  while (i < n) {
    const c = text[i]
    if (c === '\n') {
      line++
      i++
      lineStart = i
    } else if (c === '"') {
      const start = i
      const startLine = line
      const startCol = i - lineStart + 1
      i++
      while (i < n && text[i] !== '"') {
        if (text[i] === '\\') i++
        if (text[i] === '\n') {
          line++
          lineStart = i + 1
        }
        i++
      }
      i++
      const endCol = i - lineStart + 1
      const raw = text.slice(start + 1, i - 1)
      let s = raw
      if (raw.includes('\\')) {
        try {
          s = JSON.parse(text.slice(start, i)) as string
        } catch {
          // 壊れた文字列はそのまま使う
        }
      }
      const top = stack[stack.length - 1]
      let isKey = false
      if (top && top.obj) {
        let j = i
        while (j < n && (text[j] === ' ' || text[j] === '\t' || text[j] === '\r' || text[j] === '\n')) j++
        isKey = text[j] === ':'
      }
      if (isKey && top) {
        top.key = s
        const path = stack.map((f) => (f.obj ? f.key : f.index))
        out.push({ kind: 'key', text: s, line: startLine, startCol, endCol, path, id: pathId(path) })
      } else {
        out.push({ kind: 'value', text: s, line: startLine, startCol, endCol, path: [], id: '' })
      }
    } else if (c === '{' || c === '[') {
      stack.push({ obj: c === '{', key: '', index: 0 })
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

/** JSONテキスト中の全てのキーについて 行・キー名・パス を返す */
export function scanKeys(text: string): KeyEntry[] {
  const out: KeyEntry[] = []
  for (const t of scanStrings(text)) {
    if (t.kind === 'key') out.push({ line: t.line, key: t.text, path: t.path, id: t.id })
  }
  return out
}

/** main へ渡す形 (行の点と、翻訳するキー) */
export interface MarksPayload {
  marked: string[]
  released: string[]
  only?: string[]
  restrict?: boolean
}

export const toMarks = (p: MarksPayload): Marks => ({
  marked: new Set(p.marked),
  released: new Set(p.released),
  only: new Set(p.only ?? []),
  restrict: !!p.restrict
})
