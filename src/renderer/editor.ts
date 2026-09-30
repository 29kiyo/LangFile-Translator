import * as monaco from 'monaco-editor/editor/editor.api.js'
import 'monaco-editor/editor/editor.main.js'
import 'monaco-editor/language/json/monaco.contribution.js'
import editorWorker from 'monaco-editor/editor/editor.worker.js?worker'
import jsonWorker from 'monaco-editor/language/json/json.worker.js?worker'
import { fillLangSelect, initLangPicker } from './langpicker'
import { initResults } from './results'

;(self as unknown as { MonacoEnvironment: monaco.Environment }).MonacoEnvironment = {
  getWorker: (_id, label) => (label === 'json' ? new jsonWorker() : new editorWorker())
}


const $ = <T extends HTMLElement>(id: string): T => document.getElementById(id) as T

export function setEditorTheme(dark: boolean): void {
  monaco.editor.setTheme(dark ? 'vs-dark' : 'vs')
}

export function initEditor(t: (key: string) => string): void {
  const options: monaco.editor.IStandaloneEditorConstructionOptions = {
    value: '',
    language: 'json',
    automaticLayout: true,
    minimap: { enabled: false },
    lineNumbers: 'on',
    scrollBeyondLastLine: false,
    dropIntoEditor: { enabled: false },
    fontSize: 13
  }
  const left = monaco.editor.create($('editor-left'), options)
  const right = monaco.editor.create($('editor-right'), options)

  let mode: 'single' | 'multi' = 'single'
  let currentName = ''


  const status = $('file-name')
  const list = $<HTMLUListElement>('file-list')
  const fileInput = $<HTMLInputElement>('file-input')
  const modeSel = $<HTMLSelectElement>('mode-select')

  const setLang = (name: string): void => {
    const lang = name.toLowerCase().endsWith('.json') ? 'json' : 'plaintext'
    for (const ed of [left, right]) monaco.editor.setModelLanguage(ed.getModel()!, lang)
  }

  const renderList = (): void => res.render()

  const loadFiles = async (picked: File[]): Promise<void> => {
    const f = picked[0]
    if (!f) return
    left.setValue(await f.text())
    right.setValue('')
    currentName = f.name
    setLang(f.name)
    status.textContent = f.name
  }

$('btn-pick').addEventListener('click', async () => {
  const picked = await window.api.openFiles()
  await loadFiles(picked.map((p) => new File([p.text], p.name)))
})
  fileInput.addEventListener('change', async () => {
    await loadFiles(Array.from(fileInput.files ?? []))
    fileInput.value = ''
  })

  modeSel.addEventListener('change', () => {
    mode = modeSel.value as 'single' | 'multi'
    const multi = mode === 'multi'
    $('editor-right').hidden = multi
    $('title-right').hidden = multi
    $('list-title').hidden = !multi
    list.hidden = !multi
    $('btn-download').hidden = multi
    document.querySelectorAll<HTMLElement>('.single-only').forEach((el) => (el.hidden = multi))
    $('pane-lang').hidden = !multi
    $('split').classList.toggle('multi', multi)
    if (multi) picker.render()
    renderList()
  })

  $('btn-clear').addEventListener('click', () => {
    left.setValue('')
    right.setValue('')
    currentName = ''
    res.clear()
    renderList()
    status.textContent = ''
  })

  $('btn-download').addEventListener('click', async () => {
    const text = right.getValue()
    if (!text.trim()) {
      status.textContent = t('editor.nothing')
      return
    }
    const saved = await window.api.saveFile(currentName || 'output.json', text)
    status.textContent = t('editor.saved') + saved
  })

  // --- 翻訳 (phase4) ---
  const langTo = $<HTMLSelectElement>('lang-to')
  const trMode = $<HTMLSelectElement>('tr-mode')
  const trIgnore = $<HTMLInputElement>('tr-ignore')
  const trStatus = $('tr-status')
  const btnTr = $<HTMLButtonElement>('btn-translate')
  const btnCancel = $<HTMLButtonElement>('btn-cancel')
  const modeValue = (): 'structure' | 'keys' => (trMode.value === 'keys' ? 'keys' : 'structure')

  void window.api.getSettings().then((s) => {
    fillLangSelect(langTo, s.targetLang)
    trMode.value = s.translateMode
    trIgnore.value = s.ignoreKeys
  })
  langTo.addEventListener('change', () => void window.api.setSettings({ targetLang: langTo.value }))
  trMode.addEventListener('change', () => void window.api.setSettings({ translateMode: modeValue() }))
  trIgnore.addEventListener('change', () => void window.api.setSettings({ ignoreKeys: trIgnore.value }))

  window.api.onTranslateProgress((p) => {
    trStatus.textContent = `${res.prefix()}${t('tr.progress')} ${p.done}/${p.total}`
  })
  btnCancel.addEventListener('click', () => {
    res.cancel()
    void window.api.cancelTranslate()
  })
  btnTr.addEventListener('click', async () => {
    const src = left.getValue()
    if (!src.trim()) {
      trStatus.textContent = t('tr.noSource')
      return
    }
    if (mode === 'multi') {
      const codes = picker.selected()
      if (codes.length === 0) {
        trStatus.textContent = t('tr.selectLang')
        return
      }
      await res.start(codes)
      return
    }
    btnTr.disabled = true
    btnCancel.hidden = false
    trStatus.textContent = t('tr.running')
    const r = await window.api.translate({
      text: src,
      mode: modeValue(),
      ignoreKeys: trIgnore.value,
      from: 'auto',
      to: langTo.value
    })
    btnTr.disabled = false
    btnCancel.hidden = true
    if (r.ok) {
      right.setValue(r.text)
      trStatus.textContent =
        t('tr.done') + (r.warnings ? ` (${t('tr.warnings')}: ${r.warnings})` : '') + (r.message ? ` [${r.message}]` : '')
    } else {
      trStatus.textContent = r.cancelled ? t('tr.cancelled') : `${t('tr.failed')}: ${r.message}`
    }
  })

  // --- 複数言語 (phase5) ---
  const picker = initLangPicker(t)
  const res = initResults(t, {
    getSource: () => left.getValue(),
    getSourceName: () => currentName,
    getOptions: () => ({ mode: modeValue(), ignoreKeys: trIgnore.value })
  })

  const overlay = $('drop-overlay')
  const editorActive = (): boolean => $('view-editor').classList.contains('active')
  document.addEventListener('dragover', (e) => {
    e.preventDefault()
    if (editorActive()) overlay.classList.add('show')
  })
  document.addEventListener('dragleave', (e) => {
    if (!e.relatedTarget) overlay.classList.remove('show')
  })
  document.addEventListener(
    'drop',
    (e) => {
      e.preventDefault()
      if (!editorActive()) return
      e.stopPropagation()
      overlay.classList.remove('show')
      if (editorActive() && e.dataTransfer) void loadFiles(Array.from(e.dataTransfer.files))
    },
    true
  )
}
