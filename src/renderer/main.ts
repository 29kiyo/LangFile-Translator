import './styles.css'
import enJson from './locales/en.json'
import jaJson from './locales/ja.json'
import type { Settings } from '@shared/types'
import { initProviders } from './providers'
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

async function applySettings(s: Settings): Promise<void> {
  document.documentElement.dataset.theme = s.theme
  editorMod?.setEditorTheme(s.theme === 'dark')
  const code =
    s.uiLanguage === 'auto'
      ? (await window.api.getLocale()).toLowerCase().split('-')[0]
      : s.uiLanguage
  dict = builtin[code] ?? en
  document.documentElement.lang = builtin[code] ? code : 'en'
  applyI18n()
  providersUi?.render()
  document.dispatchEvent(new Event('i18n-changed'))
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

  const nameStyle = $<HTMLSelectElement>('set-namestyle')
  const bulk = $<HTMLSelectElement>('set-bulk')
  nameStyle.value = settings.fileNameStyle
  bulk.value = settings.bulkMethod
  nameStyle.addEventListener('change', () => update({ fileNameStyle: nameStyle.value as Settings['fileNameStyle'] }))
  bulk.addEventListener('change', () => update({ bulkMethod: bulk.value as Settings['bulkMethod'] }))

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
  void import('./editor').then((m) => {
    editorMod = m
    m.initEditor(t)
    m.setEditorTheme(settings.theme === 'dark')
  })

  await applySettings(settings)
}

init()
