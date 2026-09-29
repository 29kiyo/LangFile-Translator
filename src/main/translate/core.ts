export type Mode = 'structure' | 'keys'

const HAS_LETTER = /\p{L}/u

/** 文字を含まない値 (数字・記号のみ・空文字) は翻訳しない */
export function isTranslatable(s: string): boolean {
  return HAS_LETTER.test(s)
}

export function parseIgnoreKeys(s: string): Set<string> {
  return new Set(
    s
      .split(',')
      .map((x) => x.trim())
      .filter(Boolean)
  )
}

const hasOwn = (o: object, k: string): boolean => Object.prototype.hasOwnProperty.call(o, k)

function put(o: Record<string, unknown>, k: string, v: unknown): void {
  Object.defineProperty(o, k, { value: v, enumerable: true, writable: true, configurable: true })
}

function walk(node: unknown, mode: Mode, ignore: Set<string>, fn: (s: string) => string): unknown {
  if (typeof node === 'string') return fn(node)
  if (Array.isArray(node)) return node.map((n) => walk(n, mode, ignore, fn))
  if (node !== null && typeof node === 'object') {
    const out: Record<string, unknown> = {}
    for (const [k, v] of Object.entries(node as Record<string, unknown>)) {
      const ignored = ignore.has(k)
      let nk = !ignored && mode === 'keys' ? fn(k) : k
      if (hasOwn(out, nk)) nk = k
      while (hasOwn(out, nk)) nk += '_'
      put(out, nk, ignored ? v : walk(v, mode, ignore, fn))
    }
    return out
  }
  return node
}

/** 翻訳対象の文字列 (重複なし) を集め、翻訳結果の Map から JSON を組み立てる */
export function extract(
  json: unknown,
  mode: Mode,
  ignore: Set<string>
): { texts: string[]; build: (m: Map<string, string>) => unknown } {
  const uniq = new Set<string>()
  walk(json, mode, ignore, (s) => {
    if (isTranslatable(s)) uniq.add(s)
    return s
  })
  return {
    texts: [...uniq],
    build: (m) => walk(json, mode, ignore, (s) => (isTranslatable(s) ? (m.get(s) ?? s) : s))
  }
}

// {name} {{name}} ${name} %s %d %1$s %(name)s <b> </b> &amp; &#39;
const PLACEHOLDER =
  /\{\{[^{}]*\}\}|\$\{[^{}]*\}|\{[^{}\s]*\}|%(?:\d+\$)?[sdifuxXcboeEgG@]|%\([^)]*\)[sdif]|<\/?[a-zA-Z][^<>]*>|&[a-zA-Z]+;|&#\d+;/g

export interface Protected {
  text: string
  tokens: string[]
}

export function protect(s: string): Protected {
  const tokens: string[] = []
  const text = s.replace(PLACEHOLDER, (m) => {
    tokens.push(m)
    return `⟦${tokens.length - 1}⟧`
  })
  return { text, tokens }
}

/** 全てのトークンが揃っていれば元に戻した文字列、欠けていれば null */
export function restore(s: string, tokens: string[]): string | null {
  const seen = new Set<number>()
  const out = s.replace(/⟦\s*(\d+)\s*⟧/g, (m, n: string) => {
    const i = Number(n)
    if (i >= tokens.length) return m
    seen.add(i)
    return tokens[i]
  })
  if (seen.size !== tokens.length || out.includes('⟦')) return null
  return out
}

/** インデックスの配列を返す。1件が maxChars を超える場合は単独バッチにする */
export function makeBatches(texts: string[], maxItems: number, maxChars: number): number[][] {
  const batches: number[][] = []
  let cur: number[] = []
  let chars = 0
  texts.forEach((t, i) => {
    if (cur.length && (cur.length >= maxItems || chars + t.length > maxChars)) {
      batches.push(cur)
      cur = []
      chars = 0
    }
    cur.push(i)
    chars += t.length
  })
  if (cur.length) batches.push(cur)
  return batches
}

/** LLM に渡す言語名 (例: "Japanese (ja)") */
export function langName(code: string): string {
  try {
    const n = new Intl.DisplayNames(['en'], { type: 'language' }).of(code)
    return n && n !== code ? `${n} (${code})` : code
  } catch {
    return code
  }
}
