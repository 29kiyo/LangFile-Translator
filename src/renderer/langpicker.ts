import { LANGUAGES, fileBaseName } from '@shared/languages'

const $ = <T extends HTMLElement>(id: string): T => document.getElementById(id) as T
const uiLocale = (): string => document.documentElement.lang || 'en'

/** 中国語は地域ではなく文字体系で表示する */
const LABEL: Record<string, string> = { 'zh-CN': '中文（簡体字）', 'zh-TW': '中文（繁体字）' }

function nameMap(locale: string): Map<string, string> {
  const m = new Map<string, string>()
  let dn: Intl.DisplayNames | null = null
  try {
    dn = new Intl.DisplayNames([locale], { type: 'language' })
  } catch {
    dn = null
  }
  for (const l of LANGUAGES) {
    let v = l.code
    try {
      v = dn?.of(l.code) ?? l.code
    } catch {
      v = l.code
    }
    m.set(l.code, v)
  }
  return m
}

const nativeCache = new Map<string, string>()
/** その言語自身での名前 (例: ja → 日本語)。必要になった分だけ計算する */
export function nativeName(code: string): string {
  if (LABEL[code]) return LABEL[code]
  let v = nativeCache.get(code)
  if (v === undefined) {
    try {
      v = new Intl.DisplayNames([code], { type: 'language' }).of(code) ?? code
    } catch {
      v = code
    }
    nativeCache.set(code, v)
  }
  return v
}

export interface LangPicker {
  selected(): string[]
  onChange(cb: () => void): void
}

/** 対象言語のピッカー (アコーディオン + 枠付きグリッド + 検索)。単体・複数で共通 */
export function initLangPicker(t: (key: string) => string): LangPicker {
  const head = $<HTMLButtonElement>('lang-head')
  const arrow = $('lang-arrow')
  const title = $('lang-title')
  const summary = $('lang-summary')
  const body = $('lang-body')
  const grid = $<HTMLUListElement>('lang-grid')
  const search = $<HTMLInputElement>('lang-search')

  let selected = new Set<string>()
  let shown: string[] = []
  let ui = new Map<string, string>()
  let uiFor = ''
  let en = new Map<string, string>()
  const listeners: (() => void)[] = []

  const codes = (): string[] => LANGUAGES.filter((l) => selected.has(l.code)).map((l) => l.code)

  const updateHead = (): void => {
    const c = codes()
    title.textContent = `${t('lang.title')} (${c.length})`
    summary.textContent = c.length === 1 ? `${nativeName(c[0])} (${c[0]})` : c.join(', ')
  }
  const notify = (): void => listeners.forEach((cb) => cb())
  const changed = (): void => {
    void window.api.setSettings({ targetLangs: codes() })
    updateHead()
    notify()
  }

  const render = (): void => {
    const loc = uiLocale()
    if (uiFor !== loc) {
      ui = nameMap(loc)
      uiFor = loc
    }
    if (en.size === 0) en = nameMap('en')
    search.placeholder = t('lang.search')
    const norm = (s: string): string => s.toLowerCase().replace(/-/g, '_')
    const q = norm(search.value.trim())
    const hit = LANGUAGES.filter(
      (l) =>
        !q ||
        [l.code, fileBaseName(l, 'full'), nativeName(l.code), en.get(l.code) ?? '', ui.get(l.code) ?? ''].some((s) =>
          norm(s).includes(q)
        )
    )
    shown = hit.map((l) => l.code)
    grid.innerHTML = ''
    for (const l of hit) {
      const li = document.createElement('li')
      const label = document.createElement('label')
      const cb = document.createElement('input')
      cb.type = 'checkbox'
      cb.checked = selected.has(l.code)
      const text = document.createElement('span')
      text.className = 'ltext'
      const name = document.createElement('span')
      name.className = 'lname'
      name.textContent = nativeName(l.code)
      const sub = document.createElement('span')
      sub.className = 'lc'
      const u = LABEL[l.code] ? '' : (ui.get(l.code) ?? '')
      sub.textContent = u && u !== name.textContent ? `${u} · ${l.code}` : l.code
      text.append(name, sub)
      label.append(cb, text)
      li.appendChild(label)
      grid.appendChild(li)
      cb.addEventListener('change', () => {
        if (cb.checked) selected.add(l.code)
        else selected.delete(l.code)
        changed()
      })
    }
  }

  const setOpen = (open: boolean): void => {
    body.hidden = !open
    arrow.textContent = open ? '▾' : '▸'
    if (open) render()
  }

  head.addEventListener('click', () => setOpen(Boolean(body.hidden)))
  search.addEventListener('input', render)
  $('lang-all').addEventListener('click', () => {
    for (const c of shown) selected.add(c)
    changed()
    render()
  })
  $('lang-none').addEventListener('click', () => {
    selected.clear()
    changed()
    render()
  })
  document.addEventListener('i18n-changed', () => {
    updateHead()
    if (!body.hidden) render()
  })
  void window.api.getSettings().then((s) => {
    selected = new Set(s.targetLangs ?? [])
    updateHead()
    notify()
  })
  updateHead()
  setOpen(false)

  return {
    selected: codes,
    onChange: (cb) => {
      listeners.push(cb)
    }
  }
}
