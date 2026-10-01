export type LocaleDict = Record<string, string>

export type LocaleError = 'badName' | 'badJson' | 'noKeys' | 'reserved' | 'tooBig'

export interface LocaleCheck {
  ok: boolean
  error?: LocaleError
  /** 言語コード (小文字・ハイフン区切り。例: ja-jp) */
  code: string
  /** 取り込む辞書 (英語に存在するキーのうち、使えるものだけ) */
  dict: LocaleDict
  /** 英語で補うキー (無い・空・{n} などの記号が欠けている) */
  missing: string[]
  /** 英語に無いため使わないキー */
  extra: string[]
}

const MAX_CHARS = 1_000_000
const CODE_RE = /^[a-z]{2,3}(-[a-z0-9]{2,8})*$/

/** 保存してよい言語コードの形か (小文字・ハイフン区切り) */
export const isLocaleCode = (code: string): boolean => CODE_RE.test(code)

const has = (o: object, k: string): boolean => Object.prototype.hasOwnProperty.call(o, k)
const tokens = (s: string): string[] => s.match(/\{[A-Za-z]+\}/g) ?? []

/** ファイル名から言語コードを作る (ja_jp.json → ja-jp)。言語コードの形でなければ null */
export function codeFromFileName(name: string): string | null {
  const base = name.replace(/\.json$/i, '')
  if (!/^[A-Za-z]{2,3}([-_][A-Za-z0-9]{2,8})*$/.test(base)) return null
  const code = base.replace(/_/g, '-').toLowerCase()
  try {
    new Intl.Locale(code)
  } catch {
    return null
  }
  return code
}

/** 入れ子のオブジェクトは "a.b" のキーに平らにする。文字列以外と空の文字列は捨てる。オブジェクトでなければ null */
export function flattenLocale(json: unknown): LocaleDict | null {
  if (json === null || typeof json !== 'object' || Array.isArray(json)) return null
  const out: LocaleDict = {}
  const walk = (o: Record<string, unknown>, prefix: string): void => {
    for (const [k, v] of Object.entries(o)) {
      if (k === '__proto__') continue
      if (typeof v === 'string') {
        if (v.trim() !== '') out[prefix + k] = v
      } else if (v !== null && typeof v === 'object' && !Array.isArray(v)) {
        walk(v as Record<string, unknown>, `${prefix}${k}.`)
      }
    }
  }
  walk(json as Record<string, unknown>, '')
  return out
}

/** 言語ファイルを検証し、取り込む辞書を作る。足りないキーは、表示のとき英語で補われる */
export function validateLocale(fileName: string, text: string, en: LocaleDict, tooBig = false): LocaleCheck {
  const fail = (error: LocaleError, code = ''): LocaleCheck => ({ ok: false, error, code, dict: {}, missing: [], extra: [] })
  const code = codeFromFileName(fileName)
  if (!code) return fail('badName')
  if (code === 'en') return fail('reserved', code)
  if (tooBig || text.length > MAX_CHARS) return fail('tooBig', code)
  let json: unknown
  try {
    json = JSON.parse(text.replace(/^\uFEFF/, ''))
  } catch {
    return fail('badJson', code)
  }
  const flat = flattenLocale(json)
  if (!flat) return fail('badJson', code)
  if (!Object.keys(flat).some((k) => has(en, k))) return fail('noKeys', code)
  const dict: LocaleDict = {}
  const missing: string[] = []
  for (const k of Object.keys(en)) {
    const v = flat[k]
    if (v === undefined || !tokens(en[k]).every((tk) => v.includes(tk))) missing.push(k)
    else dict[k] = v
  }
  const extra = Object.keys(flat).filter((k) => !has(en, k))
  return { ok: true, code, dict, missing, extra }
}

/**
 * 表示言語を決める。完全一致 → 言語部分の一致 → 同じ言語の別の地域 → en の順。
 * 中国語は、簡体字と繁体字を取り違えないように、完全一致 (と zh) だけを使う
 */
export function pickLocale(requested: string, available: string[]): string {
  const norm = (s: string): string => s.toLowerCase().replace(/_/g, '-')
  const req = norm(requested)
  const find = (code: string): string | undefined => available.find((a) => norm(a) === code)
  const exact = find(req)
  if (exact) return exact
  const base = req.split('-')[0]
  const baseHit = find(base)
  if (baseHit) return baseHit
  if (base !== 'zh') {
    const same = available.filter((a) => norm(a).split('-')[0] === base).sort()
    if (same.length) return same[0]
  }
  return 'en'
}
