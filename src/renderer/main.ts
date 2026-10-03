import './styles.css'
import enJson from './locales/en.json'
import jaJson from './locales/ja.json'
import type { Settings } from '@shared/types'
import { initProviders } from './providers'
import { initLangPicker } from './langpicker'
import { initUiLang, langDisplayName } from './uilang'
import { pickLocale } from '@shared/locale-file'
let editorMod: typeof import('./editor') | null = null
let providersUi: { render: () => void } | null = null

const en: Record<string, string> = enJson
const builtin: Record<string, Record<string, string>> = { en, ja: jaJson }
let dict: Record<string, string> = en

const t = (key: string): string => dict[key] ?? en[key] ?? key
const $ = <T extends HTMLElement>(id: string): T => document.getElementById(id) as T

const logEl = $<HTMLPreElement>('log')

function applyI18n(): void {
  document.querySelectorAll<HTMLElement>('[data-i18n]').forEach((el) => {
    el.textContent = t(el.dataset.i18n as string)
  })
}

/** 追加した表示言語 (コード → 辞書)。userData/locales から読む */
let custom: Record<string, Record<string, string>> = {}
const allLocales = (): Record<string, Record<string, string>> => ({ ...builtin, ...custom })

/** 表示言語の選択肢 (自動 / 標準の言語 / 追加した言語) を作り直す */
function fillUiLang(selected: string): void {
  const sel = $<HTMLSelectElement>('set-lang')
  sel.innerHTML = ''
  const add = (value: string, text: string): void => {
    const o = document.createElement('option')
    o.value = value
    o.textContent = text
    sel.appendChild(o)
  }
  add('auto', t('settings.lang.auto'))
  add('en', 'English')
  add('ja', '日本語')
  for (const code of Object.keys(custom).sort()) {
    if (code !== 'en' && code !== 'ja') add(code, langDisplayName(code))
  }
  sel.value = Array.from(sel.options).some((o) => o.value === selected) ? selected : 'auto'
}

/** 直前に適用した表示言語 (切り替わったことを検出するため) */
let shownLang = ''

async function applySettings(s: Settings): Promise<void> {
  document.documentElement.dataset.theme = s.theme
  editorMod?.setEditorTheme(s.theme === 'dark')
  const all = allLocales()
  const requested = s.uiLanguage === 'auto' ? await window.api.getLocale() : s.uiLanguage
  const chosen = pickLocale(requested, Object.keys(all))
  dict = all[chosen] ?? en
  document.documentElement.lang = chosen
  fillUiLang(s.uiLanguage)
  const langChanged = shownLang !== '' && shownLang !== chosen
  shownLang = chosen
  applyI18n()
  providersUi?.render()
  document.dispatchEvent(new Event('i18n-changed'))
  // 前の言語の状態表示 (保存しました / 完了 など) を、各画面で消す
  if (langChanged) document.dispatchEvent(new Event('ui-lang-changed'))
  logEl.classList.toggle('hidden', !s.showCommandLog)
}

window.api.onCommandLog((text) => {
  logEl.textContent += `[${new Date().toLocaleTimeString()}] ${text}\n`
  const lines = (logEl.textContent ?? '').split('\n')
  if (lines.length > 200) logEl.textContent = lines.slice(-200).join('\n')
  logEl.scrollTop = logEl.scrollHeight
})

document.querySelectorAll<HTMLButtonElement>('#tabs button').forEach((btn) => {
  btn.addEventListener('click', () => {
    document.querySelectorAll('#tabs button').forEach((b) => b.classList.remove('active'))
    document.querySelectorAll('.view').forEach((v) => v.classList.remove('active'))
    btn.classList.add('active')
    $(`view-${btn.dataset.view}`).classList.add('active')
  })
})

async function init(): Promise<void> {
  let settings = await window.api.getSettings()
  custom = await window.api.listUiLocales()
  const theme = $<HTMLSelectElement>('set-theme')
  const lang = $<HTMLSelectElement>('set-lang')
  const showLog = $<HTMLInputElement>('set-log')

  theme.value = settings.theme
  lang.value = settings.uiLanguage
  showLog.checked = settings.showCommandLog

  const update = async (patch: Partial<Settings>): Promise<void> => {
    settings = await window.api.setSettings(patch)
    await applySettings(settings)
  }
  theme.addEventListener('change', () => update({ theme: theme.value as Settings['theme'] }))
  lang.addEventListener('change', () => update({ uiLanguage: lang.value }))
  showLog.addEventListener('change', () => update({ showCommandLog: showLog.checked }))

  const bulk = $<HTMLSelectElement>('set-bulk')
  bulk.value = settings.bulkMethod
  bulk.addEventListener('change', () => update({ bulkMethod: bulk.value as Settings['bulkMethod'] }))
  const delImp = $<HTMLSelectElement>('uil-delete')
  delImp.value = settings.deleteImported
  delImp.addEventListener('change', () => update({ deleteImported: delImp.value as Settings['deleteImported'] }))

  const outDir = $('out-dir')
  const refreshOutDir = async (): Promise<void> => {
    outDir.textContent = await window.api.getOutputDir()
  }
  $('btn-outdir').addEventListener('click', async () => {
    const dir = await window.api.chooseDir()
    if (dir) {
      await update({ outputDir: dir })
      await refreshOutDir()
    }
  })
  $('btn-outdir-reset').addEventListener('click', async () => {
    await update({ outputDir: '' })
    await refreshOutDir()
  })
  await refreshOutDir()
  providersUi = initProviders(t)
  const picker = initLangPicker(t)
  const uiLang = initUiLang({
    t,
    en,
    custom: () => custom,
    reload: async () => {
      custom = await window.api.listUiLocales()
      settings = await window.api.getSettings()
      await applySettings(settings)
    }
  })
  uiLang.render()
  void import('./editor').then((m) => {
    editorMod = m
    m.initEditor(t, picker)
    m.setEditorTheme(settings.theme === 'dark')
  })

  await applySettings(settings)
}

init()
