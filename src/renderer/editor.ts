import * as monaco from 'monaco-editor/editor/editor.api.js'
import 'monaco-editor/editor/editor.main.js'
import 'monaco-editor/language/json/monaco.contribution.js'
import editorWorker from 'monaco-editor/editor/editor.worker.js?worker'
import jsonWorker from 'monaco-editor/language/json/json.worker.js?worker'

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
  let results: { name: string; text: string }[] = []

  const status = $('file-name')
  const list = $<HTMLUListElement>('file-list')
  const fileInput = $<HTMLInputElement>('file-input')
  const modeSel = $<HTMLSelectElement>('mode-select')

  const setLang = (name: string): void => {
    const lang = name.toLowerCase().endsWith('.json') ? 'json' : 'plaintext'
    for (const ed of [left, right]) monaco.editor.setModelLanguage(ed.getModel()!, lang)
  }

  const renderList = (): void => {
    list.innerHTML = ''
    $('list-title').textContent = `${t('editor.resultList')} (${results.length})`
    if (results.length === 0) {
      const li = document.createElement('li')
      li.textContent = t('editor.resultEmpty')
      list.appendChild(li)
    }
    for (const r of results) {
      const li = document.createElement('li')
      li.textContent = r.name
      list.appendChild(li)
    }
  }

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
    renderList()
  })

  $('btn-clear').addEventListener('click', () => {
    left.setValue('')
    right.setValue('')
    currentName = ''
    results = []
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
