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

/** 単体言語モードの翻訳先 (全言語)。UI言語が変わったら名前を作り直す */
export function fillLangSelect(sel: HTMLSelectElement, value: string): void {
  const fill = (v: string): void => {
    const names = nameMap(uiLocale())
    sel.innerHTML = ''
    for (const l of LANGUAGES) {
      const o = document.createElement('option')
      o.value = l.code
      o.textContent = `${LABEL[l.code] ?? names.get(l.code)} (${l.code})`
      sel.appendChild(o)
    }
    sel.value = v
  }
  fill(value)
  document.addEventListener('i18n-changed', () => fill(sel.value))
}

export interface LangPicker {
  selected(): string[]
  render(): void
}

/** 複数言語モードの言語ピッカー (検索 + チェックボックス) */
export function initLangPicker(t: (key: string) => string): LangPicker {
  const pane = $('pane-lang')
  const list = $<HTMLUListElement>('lang-list')
  const search = $<HTMLInputElement>('lang-search')
  const title = $('lang-title')

  let selected = new Set<string>()
  let shown: string[] = []
  let ui = new Map<string, string>()
  let uiFor = ''
  let en = new Map<string, string>()

  const persist = (): void => {
    void window.api.setSettings({ targetLangs: LANGUAGES.filter((l) => selected.has(l.code)).map((l) => l.code) })
  }
  const updateTitle = (): void => {
    title.textContent = `${t('lang.title')} (${selected.size})`
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
    list.innerHTML = ''
    for (const l of hit) {
      const li = document.createElement('li')
      const label = document.createElement('label')
      const cb = document.createElement('input')
      cb.type = 'checkbox'
      cb.checked = selected.has(l.code)
      const name = document.createElement('span')
      name.textContent = nativeName(l.code)
      const sub = document.createElement('span')
      sub.className = 'lc'
      const u = LABEL[l.code] ? '' : (ui.get(l.code) ?? '')
      sub.textContent = u && u !== name.textContent ? `${u} · ${l.code}` : l.code
      label.append(cb, name, sub)
      li.appendChild(label)
      list.appendChild(li)
      cb.addEventListener('change', () => {
        if (cb.checked) selected.add(l.code)
        else selected.delete(l.code)
        persist()
        updateTitle()
      })
    }
    updateTitle()
  }

  search.addEventListener('input', render)
  $('lang-all').addEventListener('click', () => {
    for (const c of shown) selected.add(c)
    persist()
    render()
  })
  $('lang-none').addEventListener('click', () => {
    selected.clear()
    persist()
    render()
  })
  document.addEventListener('i18n-changed', () => {
    if (!pane.hidden) render()
    else updateTitle()
  })
  void window.api.getSettings().then((s) => {
    selected = new Set(s.targetLangs ?? [])
    if (!pane.hidden) render()
    else updateTitle()
  })
  updateTitle()

  return { selected: () => LANGUAGES.filter((l) => selected.has(l.code)).map((l) => l.code), render }
}
