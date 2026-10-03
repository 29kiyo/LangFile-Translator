import * as monaco from 'monaco-editor/editor/editor.api.js'
import 'monaco-editor/editor/editor.main.js'
import 'monaco-editor/language/json/monaco.contribution.js'
import editorWorker from 'monaco-editor/editor/editor.worker.js?worker'
import jsonWorker from 'monaco-editor/language/json/json.worker.js?worker'
import type { LangPicker } from './langpicker'
import { getLanguage } from '@shared/languages'
import { outputPath } from '@shared/outname'
import { initResults } from './results'
import { isIgnoredId, pathId, type KeyEntry, type Marks } from '@shared/keyscan'
import type { Untranslated } from '@shared/untranslated'
import {
  csvColumnNames,
  detectFormat,
  findUntranslatedFor,
  isCsv,
  keyEntries,
  supportsKeyMode,
  withHeader,
  type FormatId
} from '@shared/formats/index'
import { renderUntranslated } from './unview'
import { retranslate } from './retry'
import { errText } from './errtext'

;(self as unknown as { MonacoEnvironment: monaco.Environment }).MonacoEnvironment = {
  getWorker: (_id, label) => (label === 'json' ? new jsonWorker() : new editorWorker())
}


const $ = <T extends HTMLElement>(id: string): T => document.getElementById(id) as T

export function setEditorTheme(dark: boolean): void {
  monaco.editor.setTheme(dark ? 'vs-dark' : 'vs')
}

export function initEditor(t: (key: string) => string, picker: LangPicker): void {
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
  const right = monaco.editor.create($('editor-right'), { ...options, glyphMargin: true })

  let currentName = ''
  let csvHeader = true
  const fmtOr = (): FormatId => withHeader(detectFormat(currentName, left.getValue()) ?? 'json', csvHeader)
  const unsupportedText = (): string =>
    t('err.unsupported').replace('{ext}', /\.[^.\\/]+$/.exec(currentName)?.[0] ?? '')


  const status = $('file-name')
  const list = $<HTMLUListElement>('file-list')
  const fileInput = $<HTMLInputElement>('file-input')

  const setLang = (name: string): void => {
    const lang = /\.(json|arb)$/i.test(name) ? 'json' : 'plaintext'
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
    trStatus.textContent = detectFormat(f.name, left.getValue()) === null ? unsupportedText() : ''
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

  // 単体のダウンロード名は、翻訳先の言語に合わせる (ja_jp.json / ja.json。設定で形式を選べる)
  const outName = async (): Promise<string> => {
    const code = lastCtx?.to ?? picker.selected()[0]
    const l = code ? getLanguage(code) : undefined
    if (!l) return currentName || 'output.json'
    const style = (await window.api.getSettings()).fileNameStyle
    return outputPath(currentName, l, style, lastCtx?.format ?? 'json')
  }
  $('btn-download').addEventListener('click', async () => {
    const text = right.getValue()
    if (!text.trim()) {
      status.textContent = t('editor.nothing')
      return
    }
    const saved = await window.api.saveFile(await outName(), text)
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
    const fmt0 = detectFormat(currentName, src)
    const fmt = fmt0 === null ? null : withHeader(fmt0, csvHeader)
    if (fmt === null) {
      trStatus.textContent = unsupportedText()
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
      format: fmt,
      from: 'auto',
      to: codes[0]
    })
    btnTr.disabled = false
    btnCancel.hidden = true
    if (r.ok) {
      right.setValue(r.text)
      dismissed.clear()
      lastCtx = {
        source: src,
        to: codes[0],
        format: fmt,
        mode: modeValue(),
        ignore: keyList(),
        marks: { marked: new Set(marks.marked), released: new Set(marks.released) }
      }
      refreshUn()
      trStatus.textContent =
        t('tr.done') + (r.message ? ` [${errText(r.message, t)}]` : '')
    } else {
      trStatus.textContent = r.cancelled ? t('tr.cancelled') : `${t('tr.failed')}: ${errText(r.message, t)}`
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
    lastCtx = null
    dismissed.clear()
  }
  const marksPayload = (): { marked: string[]; released: string[] } | undefined =>
    marks.marked.size || marks.released.size
      ? { marked: [...marks.marked], released: [...marks.released] }
      : undefined

  // 行 -> その行のキー (1行にキーがちょうど1つの行だけ。minify 形式などは点なし)
  let lineEntries = new Map<number, KeyEntry>()
  const rescan = (): void => {
    const byLine = new Map<number, KeyEntry[]>()
    for (const e of keyEntries(fmtOr(), left.getValue())) {
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
    // 「キーも翻訳」は JSON のみ
    const keysOpt = trMode.querySelector('option[value="keys"]') as HTMLOptionElement | null
    if (keysOpt) keysOpt.disabled = !supportsKeyMode(fmtOr())
    renderCsv()
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

  // --- CSV / TSV: 翻訳する列の選択 (列名 = キー、識別子 = pathId([列名])。行マーカーと同じ marks に載せる) ---
  const csvBar = $('csv-bar')
  const csvCols = $('csv-cols')
  const csvHeaderChk = $<HTMLInputElement>('csv-header')
  const toggleCol = (name: string): void => {
    const id = pathId([name])
    const ign = keyList()
    const on = isIgnoredId(name, id, ign, marks)
    if (ign.has(name)) {
      marks.marked.delete(id)
      if (on) marks.released.add(id)
      else marks.released.delete(id)
    } else if (on) marks.marked.delete(id)
    else marks.marked.add(id)
  }
  const renderCsv = (): void => {
    const f = fmtOr()
    csvBar.hidden = !isCsv(f)
    csvCols.replaceChildren()
    if (!isCsv(f)) return
    const ign = keyList()
    for (const name of csvColumnNames(f, left.getValue())) {
      const lab = document.createElement('label')
      lab.className = 'csv-col'
      const cb = document.createElement('input')
      cb.type = 'checkbox'
      cb.checked = !isIgnoredId(name, pathId([name]), ign, marks)
      cb.addEventListener('change', () => toggleCol(name))
      const sp = document.createElement('span')
      sp.textContent = name
      lab.append(cb, sp)
      csvCols.append(lab)
    }
  }
  csvHeaderChk.addEventListener('change', () => {
    csvHeader = csvHeaderChk.checked
    marks.marked.clear()
    marks.released.clear()
    refreshFixed()
  })

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
  trIgnore.addEventListener('input', () => {
    redraw()
    renderCsv()
  })
  let markTimer = 0
  left.onDidChangeModelContent(() => {
    window.clearTimeout(markTimer)
    markTimer = window.setTimeout(refreshFixed, 150)
  })
  document.addEventListener('i18n-changed', refreshFixed)

  // --- 未翻訳行の表示 (phase5) ---
  // 直近の翻訳の条件 (原文・モード・無視) を覚えておき、右エディタの内容と比べて「原文のまま残った行」を出す
  let lastCtx: {
    source: string
    mode: 'structure' | 'keys'
    ignore: Set<string>
    marks: Marks
    to: string
    format: FormatId
  } | null = null
  const unBox = $('un-single')
  const jumpRight = (u: Untranslated): void => {
    right.revealLineInCenter(u.line)
    right.setSelection(new monaco.Range(u.line, u.startCol, u.line, u.endCol))
    right.focus()
  }
  // 右クリックで対象外にした項目 (原文の文字列の通し番号)。クリア・ファイル読込・翻訳のやり直しでリセット
  const dismissed = new Set<number>()
  const dismissItems = (items: Untranslated[]): void => {
    for (const x of items) dismissed.add(x.idx)
    refreshUn()
  }
  const rightDeco = right.createDecorationsCollection()
  let curList: Untranslated[] = []
  const computeUn = (): Untranslated[] =>
    lastCtx && picker.selected().length < 2
      ? findUntranslatedFor(
          lastCtx.format,
          lastCtx.source,
          right.getValue(),
          lastCtx.mode,
          lastCtx.ignore,
          lastCtx.marks,
          dismissed
        )
      : []

  // 未翻訳の文字列だけを再翻訳して、右エディタに1回の編集として反映する (Ctrl+Z で戻せる)
  const retryItems = async (items: Untranslated[]): Promise<void> => {
    if (btnTr.disabled || !lastCtx || items.length === 0) return
    const to = lastCtx.to
    const fmt = lastCtx.format
    btnTr.disabled = true
    trStatus.textContent = t('un.retrying')
    const out = await retranslate(items, to, computeUn, fmt)
    btnTr.disabled = false
    if (!out.ok) {
      trStatus.textContent = `${t('tr.failed')}: ${errText(out.message, t)}`
      return
    }
    if (out.edits.length === 0) {
      trStatus.textContent = t('un.retryNone')
      return
    }
    right.pushUndoStop()
    right.executeEdits(
      'retranslate',
      out.edits.map((e) => ({ range: new monaco.Range(e.line, e.startCol, e.line, e.endCol), text: e.text }))
    )
    right.pushUndoStop()
    refreshUn()
    trStatus.textContent = t('un.retryDone').replace('{n}', String(out.edits.length))
  }

  const refreshUn = (): void => {
    curList = computeUn()
    renderUntranslated(unBox, curList, t, jumpRight, dismissItems, retryItems)
    // 未翻訳の行の左に赤い点 (クリックでその行だけ再翻訳)
    const seen = new Set<number>()
    const decos: monaco.editor.IModelDeltaDecoration[] = []
    for (const u of curList) {
      if (seen.has(u.line)) continue
      seen.add(u.line)
      decos.push({
        range: new monaco.Range(u.line, 1, u.line, 1),
        options: {
          glyphMarginClassName: 'un-dot',
          glyphMarginHoverMessage: { value: `${t('un.dotTip')}: \`${u.source.slice(0, 60).replace(/`/g, "'")}\`` }
        }
      })
    }
    rightDeco.set(decos)
  }
  right.onMouseDown((e) => {
    if (e.target.type === monaco.editor.MouseTargetType.GUTTER_GLYPH_MARGIN && e.target.position) {
      const line = e.target.position.lineNumber
      void retryItems(curList.filter((x) => x.line === line))
    }
  })
  let unTimer = 0
  right.onDidChangeModelContent(() => {
    window.clearTimeout(unTimer)
    unTimer = window.setTimeout(refreshUn, 250)
  })
  document.addEventListener('i18n-changed', refreshUn)
  document.addEventListener('ui-lang-changed', () => {
    trStatus.textContent = ''
    status.textContent = currentName
  })

  // --- 複数言語 (phase5) ---
  const res = initResults(t, {
    getSource: () => left.getValue(),
    getSourceName: () => currentName,
    getOptions: () => ({ mode: modeValue(), ignoreKeys: trIgnore.value, marks: marksPayload(), format: fmtOr() })
  })

  // 結果一覧 (res) の初期化より後で、ピッカーの変更とモードを結び付ける
  picker.onChange(applyMode)
  picker.onChange(refreshUn)
  applyMode()
  refreshUn()

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
