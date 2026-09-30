import * as monaco from 'monaco-editor/editor/editor.api.js'
import 'monaco-editor/editor/editor.main.js'
import 'monaco-editor/language/json/monaco.contribution.js'
import editorWorker from 'monaco-editor/editor/editor.worker.js?worker'
import jsonWorker from 'monaco-editor/language/json/json.worker.js?worker'
import { initLangPicker } from './langpicker'
import { initResults } from './results'
import { isIgnoredId, scanKeys, type KeyEntry } from '@shared/keyscan'

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
  const left = monaco.editor.create($('editor-left'), { ...options, glyphMargin: true })
  const right = monaco.editor.create($('editor-right'), options)

  let currentName = ''


  const status = $('file-name')
  const list = $<HTMLUListElement>('file-list')
  const fileInput = $<HTMLInputElement>('file-input')

  const setLang = (name: string): void => {
    const lang = name.toLowerCase().endsWith('.json') ? 'json' : 'plaintext'
    for (const ed of [left, right]) monaco.editor.setModelLanguage(ed.getModel()!, lang)
  }

  const renderList = (): void => res.render()

  const loadFiles = async (picked: File[]): Promise<void> => {
    const f = picked[0]
    if (!f) return
    left.setValue(await f.text())
    clearMarks()
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

  /** 選択言語が2つ以上なら複数言語モード (右=結果一覧)、それ以外は単体 (右=出力エディタ) */
  const applyMode = (): void => {
    const multi = picker.selected().length >= 2
    $('editor-right').hidden = multi
    $('title-right').hidden = multi
    $('list-title').hidden = !multi
    list.hidden = !multi
    $('btn-download').hidden = multi
    renderList()
  }

  $('btn-clear').addEventListener('click', () => {
    left.setValue('')
    right.setValue('')
    currentName = ''
    clearMarks()
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
  const trMode = $<HTMLSelectElement>('tr-mode')
  const trIgnore = $<HTMLInputElement>('tr-ignore')
  const trStatus = $('tr-status')
  const btnTr = $<HTMLButtonElement>('btn-translate')
  const btnCancel = $<HTMLButtonElement>('btn-cancel')
  const modeValue = (): 'structure' | 'keys' => (trMode.value === 'keys' ? 'keys' : 'structure')

  void window.api.getSettings().then((s) => {
    trMode.value = s.translateMode
    trIgnore.value = s.ignoreKeys
    refreshFixed()
  })
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
    const codes = picker.selected()
    if (codes.length === 0) {
      trStatus.textContent = t('tr.selectLang')
      return
    }
    if (codes.length >= 2) {
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
      marks: marksPayload(),
      from: 'auto',
      to: codes[0]
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

  // --- 行マーカーによる無視キー (phase6) ---
  // 赤い点は「行 (出現位置) 単位」で管理する (無視キーの一覧 #tr-ignore とは同期しない)
  //  - 一覧に載っているキー: 全ての出現位置に点が出る。点のクリックでその行だけ外せる (released)
  //  - 一覧にないキー: 点をクリックした行だけが対象 (marked)
  // 判定規則は shared/keyscan.ts (翻訳エンジンと共通)。点の状態はセッション中のみ保持する
  const marks = { marked: new Set<string>(), released: new Set<string>() }
  const keyList = (): Set<string> =>
    new Set(
      trIgnore.value
        .split(',')
        .map((s) => s.trim())
        .filter(Boolean)
    )
  const clearMarks = (): void => {
    marks.marked.clear()
    marks.released.clear()
  }
  const marksPayload = (): { marked: string[]; released: string[] } | undefined =>
    marks.marked.size || marks.released.size
      ? { marked: [...marks.marked], released: [...marks.released] }
      : undefined

  // 行 -> その行のキー (1行にキーがちょうど1つの行だけ。minify 形式などは点なし)
  let lineEntries = new Map<number, KeyEntry>()
  const rescan = (): void => {
    const byLine = new Map<number, KeyEntry[]>()
    for (const e of scanKeys(left.getValue())) {
      const a = byLine.get(e.line)
      if (a) a.push(e)
      else byLine.set(e.line, [e])
    }
    lineEntries = new Map()
    for (const [ln, a] of byLine) if (a.length === 1) lineEntries.set(ln, a[0])
  }

  const dot = (line: number, key: string, on: boolean): monaco.editor.IModelDeltaDecoration => ({
    range: new monaco.Range(line, 1, line, 1),
    options: {
      glyphMarginClassName: on ? 'ign-dot' : 'ign-dot hover',
      glyphMarginHoverMessage: { value: `${t(on ? 'ign.remove' : 'ign.add')}: \`${key.replace(/`/g, "'")}\`` }
    }
  })

  const fixedDeco = left.createDecorationsCollection()
  const hoverDeco = left.createDecorationsCollection()
  let hoverLine = 0

  const drawFixed = (): void => {
    const ign = keyList()
    const list: monaco.editor.IModelDeltaDecoration[] = []
    for (const [ln, e] of lineEntries) if (isIgnoredId(e.key, e.id, ign, marks)) list.push(dot(ln, e.key, true))
    fixedDeco.set(list)
  }
  const drawHover = (): void => {
    const e = lineEntries.get(hoverLine)
    hoverDeco.set(e && !isIgnoredId(e.key, e.id, keyList(), marks) ? [dot(hoverLine, e.key, false)] : [])
  }
  const redraw = (): void => {
    drawFixed()
    drawHover()
  }
  const refreshFixed = (): void => {
    rescan()
    redraw()
  }

  const toggleLine = (line: number): void => {
    const e = lineEntries.get(line)
    if (!e) return
    const ign = keyList()
    const on = isIgnoredId(e.key, e.id, ign, marks)
    if (ign.has(e.key)) {
      // 一覧のキー: その行だけ外す / 戻す
      marks.marked.delete(e.id)
      if (on) marks.released.add(e.id)
      else marks.released.delete(e.id)
    } else if (on) marks.marked.delete(e.id)
    else marks.marked.add(e.id)
    redraw()
  }

  left.onMouseMove((e) => {
    const n = e.target.position?.lineNumber ?? 0
    if (n !== hoverLine) {
      hoverLine = n
      drawHover()
    }
  })
  left.onMouseLeave(() => {
    hoverLine = 0
    drawHover()
  })
  left.onMouseDown((e) => {
    if (e.target.type === monaco.editor.MouseTargetType.GUTTER_GLYPH_MARGIN && e.target.position) {
      toggleLine(e.target.position.lineNumber)
    }
  })
  trIgnore.addEventListener('input', redraw)
  let markTimer = 0
  left.onDidChangeModelContent(() => {
    window.clearTimeout(markTimer)
    markTimer = window.setTimeout(refreshFixed, 150)
  })
  document.addEventListener('i18n-changed', refreshFixed)

  // --- 複数言語 (phase5) ---
  const picker = initLangPicker(t)
  picker.onChange(applyMode)
  const res = initResults(t, {
    getSource: () => left.getValue(),
    getSourceName: () => currentName,
    getOptions: () => ({ mode: modeValue(), ignoreKeys: trIgnore.value, marks: marksPayload() })
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
