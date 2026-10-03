import * as monaco from 'monaco-editor/editor/editor.api.js'
import { getLanguage } from '@shared/languages'
import { outputName } from '@shared/outname'
import type { BulkFile } from '@shared/types'
import { nativeName } from './langpicker'
import type { Marks } from '@shared/keyscan'
import { parseIgnoreKeys, type Untranslated } from '@shared/untranslated'
import { findUntranslatedFor, type FormatId } from '@shared/formats/index'
import { renderUntranslated, uniqueLines } from './unview'
import { applyReplacements } from '@shared/textedit'
import { retranslate } from './retry'
import { errText } from './errtext'

type Status = 'pending' | 'running' | 'done' | 'failed' | 'cancelled'

interface Result {
  code: string
  file: string
  status: Status
  text: string
  /** 保存前の編集内容 (保存または元に戻すと消える) */
  draft?: string
  warnings: number
  /** 原文のまま残った行 (出力テキストの行番号) */
  unt: Untranslated[]
  /** 右クリックで対象外にした項目 (原文の文字列の通し番号) */
  dismissed: Set<number>
  ui?: { badge: HTMLElement; retry: HTMLButtonElement }
  message: string
}

export interface ResultsDeps {
  getSource(): string
  getSourceName(): string
  getOptions(): {
    mode: 'structure' | 'keys'
    ignoreKeys: string
    marks?: { marked: string[]; released: string[] }
    format: FormatId
  }
}

export interface ResultsApi {
  start(codes: string[]): Promise<void>
  cancel(): void
  clear(): void
  render(): void
  prefix(): string
}

const $ = <T extends HTMLElement>(id: string): T => document.getElementById(id) as T

function el<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  cls?: string,
  text?: string
): HTMLElementTagNameMap[K] {
  const e = document.createElement(tag)
  if (cls) e.className = cls
  if (text !== undefined) e.textContent = text
  return e
}

export function initResults(t: (key: string) => string, deps: ResultsDeps): ResultsApi {
  const list = $<HTMLUListElement>('file-list')
  const title = $('list-title')
  const status = $('tr-status')
  const btnTr = $<HTMLButtonElement>('btn-translate')
  const btnCancel = $<HTMLButtonElement>('btn-cancel')

  let results: Result[] = []
  /** 直近の翻訳の条件 (原文・モード・無視)。未翻訳の判定に使う */
  let ctx: { source: string; mode: 'structure' | 'keys'; ignore: Set<string>; marks?: Marks; format: FormatId } | null = null
  let openIdx = -1
  let openName: HTMLElement | null = null
  let cancelFlag = false
  let prefixText = ''
  let quiet = false

  // --- アコーディオン内のエディタ (1つを使い回す) ---
  const acc = el('div', 'acc')
  const accBar = el('div', 'acc-bar')
  const saveBtn = el('button', undefined, t('res.save'))
  const accHint = el('span', 'hint')
  document.addEventListener('ui-lang-changed', () => {
    accHint.textContent = ''
  })
  const unBox = el('span', 'un-list')
  unBox.hidden = true
  const edHost = el('div', 'acc-editor')
  accBar.append(saveBtn, accHint, unBox)
  acc.append(accBar, edHost)
  let ed: monaco.editor.IStandaloneCodeEditor | null = null
  let edDeco: monaco.editor.IEditorDecorationsCollection | null = null

  const rowName = (r: Result): string => `${r.file}${r.draft !== undefined ? ' ●' : ''}`

  const calcUn = (text: string, r: Result): Untranslated[] =>
    ctx ? findUntranslatedFor(ctx.format, ctx.source, text, ctx.mode, ctx.ignore, ctx.marks, r.dismissed) : []
  const unBadge = (r: Result): string =>
    r.status === 'done' && r.unt.length ? t('un.badge').replace('{n}', String(uniqueLines(r.unt))) : ''
  const jump = (u: Untranslated): void => {
    const e = getEd()
    e.revealLineInCenter(u.line)
    e.setSelection(new monaco.Range(u.line, u.startCol, u.line, u.endCol))
    e.focus()
  }
  const dismissFor =
    (r: Result) =>
    (items: Untranslated[]): void => {
      for (const x of items) r.dismissed.add(x.idx)
      const cur = ed && results[openIdx] === r ? ed.getValue() : (r.draft ?? r.text)
      r.unt = calcUn(cur, r)
      refreshUnUi(r)
    }
  // 開いている行のエディタに、未翻訳の行の赤い点を出す
  const drawDots = (r: Result): void => {
    if (!edDeco) return
    const seen = new Set<number>()
    const decos: monaco.editor.IModelDeltaDecoration[] = []
    for (const u of r.unt) {
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
    edDeco.set(decos)
  }
  const refreshUnUi = (r: Result): void => {
    if (r.ui) {
      r.ui.badge.textContent = unBadge(r)
      r.ui.retry.hidden = r.status !== 'done' || r.unt.length === 0
    }
    if (results[openIdx] === r) {
      renderUntranslated(unBox, r.unt, t, jump, dismissFor(r), (items) => void retry(r, items))
      drawDots(r)
    }
  }

  // 未翻訳の文字列だけを再翻訳して、その言語の結果として即確定する (ダウンロードにも反映される)
  const retry = async (r: Result, items: Untranslated[]): Promise<void> => {
    if (btnTr.disabled || items.length === 0 || r.status !== 'done') return
    btnTr.disabled = true
    status.textContent = t('un.retrying')
    const openNow = (): boolean => results[openIdx] === r && ed !== null
    const cur = (): string => (openNow() && ed ? ed.getValue() : (r.draft ?? r.text))
    const out = await retranslate(items, r.code, () => calcUn(cur(), r), ctx?.format)
    btnTr.disabled = false
    if (!out.ok) {
      status.textContent = `${t('tr.failed')}: ${errText(out.message, t)}`
      return
    }
    if (out.edits.length === 0) {
      status.textContent = t('un.retryNone')
      return
    }
    if (openNow() && ed) {
      ed.pushUndoStop()
      ed.executeEdits(
        'retranslate',
        out.edits.map((e) => ({ range: new monaco.Range(e.line, e.startCol, e.line, e.endCol), text: e.text }))
      )
      ed.pushUndoStop()
      r.text = ed.getValue()
      saveBtn.disabled = true
      accHint.textContent = t('res.applied')
    } else {
      r.text = applyReplacements(cur(), out.edits)
    }
    r.draft = undefined
    r.unt = calcUn(r.text, r)
    if (openName && results[openIdx] === r) openName.textContent = rowName(r)
    refreshUnUi(r)
    status.textContent = t('un.retryDone').replace('{n}', String(out.edits.length))
  }
  let unTimer = 0
  let unRow: Result | null = null
  const runUn = (): void => {
    window.clearTimeout(unTimer)
    const r = unRow
    unRow = null
    if (r && ed && results[openIdx] === r) {
      r.unt = calcUn(ed.getValue(), r)
      refreshUnUi(r)
    }
  }
  const scheduleUn = (r: Result): void => {
    unRow = r
    window.clearTimeout(unTimer)
    unTimer = window.setTimeout(runUn, 250)
  }

  const getEd = (): monaco.editor.IStandaloneCodeEditor => {
    if (ed) return ed
    const e = monaco.editor.create(edHost, {
      value: '',
      language: 'json',
      automaticLayout: true,
      minimap: { enabled: false },
      lineNumbers: 'on',
      glyphMargin: true,
      scrollBeyondLastLine: false,
      dropIntoEditor: { enabled: false },
      fontSize: 13
    })
    e.onDidChangeModelContent(() => {
      if (quiet) return
      const r = results[openIdx]
      if (!r) return
      const v = e.getValue()
      r.draft = v === r.text ? undefined : v
      saveBtn.disabled = r.draft === undefined
      accHint.textContent = ''
      if (openName) openName.textContent = rowName(r)
      scheduleUn(r)
    })
    edDeco = e.createDecorationsCollection()
    e.onMouseDown((ev) => {
      const r = results[openIdx]
      if (r && ev.target.type === monaco.editor.MouseTargetType.GUTTER_GLYPH_MARGIN && ev.target.position) {
        const line = ev.target.position.lineNumber
        void retry(r, r.unt.filter((x) => x.line === line))
      }
    })
    ed = e
    return e
  }

  saveBtn.addEventListener('click', () => {
    const r = results[openIdx]
    if (!r || !ed) return
    r.text = ed.getValue()
    r.draft = undefined
    saveBtn.disabled = true
    accHint.textContent = t('res.applied')
    if (openName) openName.textContent = rowName(r)
  })

  // --- ダウンロード ---
  const downloadOne = async (r: Result): Promise<void> => {
    const p = await window.api.saveFile(r.file, r.text)
    status.textContent = t('editor.saved') + p + (r.draft !== undefined ? ` (${t('res.unsaved')})` : '')
  }

  const downloadAll = async (): Promise<void> => {
    const files: BulkFile[] = results
      .filter((r) => r.status === 'done')
      .map((r) => ({ name: r.file, content: r.text }))
    if (files.length === 0) {
      status.textContent = t('editor.nothing')
      return
    }
    const base = deps.getSourceName().replace(/\.[^.]+$/, '') || 'translations'
    const out = await window.api.saveBulk(files, `${base}_translations.zip`)
    status.textContent = `${t('editor.saved')}${out.path} (${out.count})`
  }

  const bulkBtn = el('button')
  bulkBtn.addEventListener('click', () => void downloadAll())

  // --- 一覧 ---
  const stateText = (r: Result): string => {
    switch (r.status) {
      case 'pending':
        return t('res.pending')
      case 'running':
        return t('tr.running')
      case 'done':
        return t('tr.done')
      case 'failed':
        return `${t('tr.failed')}: ${errText(r.message, t).slice(0, 60)}`
      case 'cancelled':
        return t('tr.cancelled')
    }
  }

  const toggle = (i: number): void => {
    runUn()
    const r = results[i]
    if (!r) return
    if (openIdx === i) {
      openIdx = -1
      renderList()
      return
    }
    if (r.status !== 'done') return
    openIdx = i
    quiet = true
    getEd().setValue(r.draft ?? r.text)
    quiet = false
    saveBtn.disabled = r.draft === undefined
    accHint.textContent = ''
    renderList()
  }

  const renderList = (): void => {
    title.innerHTML = ''
    bulkBtn.textContent = t('res.downloadAll')
    bulkBtn.disabled = !results.some((r) => r.status === 'done')
    title.append(el('span', undefined, `${t('editor.resultList')} (${results.length})`), el('span', 'spacer'), bulkBtn)
    saveBtn.textContent = t('res.save')
    list.innerHTML = ''
    openName = null
    if (results.length === 0) {
      list.appendChild(el('li', undefined, t('editor.resultEmpty')))
      return
    }
    results.forEach((r, i) => {
      const li = el('li', 'res')
      const head = el('div', 'res-head')
      const name = el('span', 'rname', rowName(r))
      const st = el('span', `rstate ${r.status}`, stateText(r))
      if (r.status === 'failed') st.title = errText(r.message, t)
      const dl = el('button', undefined, t('res.download'))
      dl.disabled = r.status !== 'done'
      dl.addEventListener('click', () => void downloadOne(r))
      const badge = el('span', 'rbadge', unBadge(r))
      const retryBtn = el('button', undefined, t('un.retry'))
      retryBtn.hidden = r.status !== 'done' || r.unt.length === 0
      retryBtn.addEventListener('click', () => void retry(r, r.unt))
      r.ui = { badge, retry: retryBtn }
      head.append(el('span', 'arrow', i === openIdx ? '▾' : '▸'), name, el('span', 'rmeta', nativeName(r.code)), st, badge, retryBtn, dl)
      head.addEventListener('click', (e) => {
        if ((e.target as HTMLElement).closest('button')) return
        toggle(i)
      })
      li.appendChild(head)
      list.appendChild(li)
      if (i === openIdx) {
        openName = name
        li.appendChild(acc)
        renderUntranslated(unBox, r.unt, t, jump, dismissFor(r), (items) => void retry(r, items))
        getEd().layout()
        drawDots(r)
      }
    })
  }

  // --- 複数言語の翻訳 (選択した言語を順に翻訳) ---
  const start = async (codes: string[]): Promise<void> => {
    const src = deps.getSource()
    const s = await window.api.getSettings()
    const opt = deps.getOptions()
    ctx = {
      source: src,
      format: opt.format,
      mode: opt.mode,
      ignore: parseIgnoreKeys(opt.ignoreKeys),
      marks: opt.marks && { marked: new Set(opt.marks.marked), released: new Set(opt.marks.released) }
    }
    const next: Result[] = []
    for (const code of codes) {
      const l = getLanguage(code)
      if (l) next.push({ code, file: outputName(deps.getSourceName(), l, s.fileNameStyle, opt.format), status: 'pending', text: '', warnings: 0, message: '', unt: [], dismissed: new Set() })
    }
    results = next
    openIdx = -1
    cancelFlag = false
    renderList()
    btnTr.disabled = true
    btnCancel.hidden = false

    for (let i = 0; i < results.length; i++) {
      if (cancelFlag) {
        for (const r of results.slice(i)) r.status = 'cancelled'
        break
      }
      const r = results[i]
      r.status = 'running'
      prefixText = `${t('tr.language')} ${i + 1}/${results.length} (${nativeName(r.code)}): `
      status.textContent = `${prefixText}${t('tr.running')}`
      renderList()
      const out = await window.api.translate({
        text: src,
        mode: opt.mode,
        ignoreKeys: opt.ignoreKeys,
        marks: opt.marks,
        format: opt.format,
        from: 'auto',
        to: r.code
      })
      if (out.ok) {
        r.status = 'done'
        r.text = out.text
        r.warnings = out.warnings
        r.unt = calcUn(r.text, r)
      } else if (out.cancelled) {
        r.status = 'cancelled'
        cancelFlag = true
      } else {
        r.status = 'failed'
        r.message = out.message
      }
      renderList()
    }

    prefixText = ''
    btnTr.disabled = false
    btnCancel.hidden = true
    renderList()
    const ok = results.filter((r) => r.status === 'done').length
    const failed = results.filter((r) => r.status === 'failed').length
    status.textContent =
      `${t('tr.done')}: ${ok}/${results.length}` +
      (failed ? ` / ${t('tr.failed')}: ${failed}` : '') +
      (cancelFlag ? ` / ${t('tr.cancelled')}` : '')
  }

  document.addEventListener('i18n-changed', renderList)
  renderList()

  return {
    start,
    cancel: () => {
      cancelFlag = true
    },
    clear: () => {
      results = []
      openIdx = -1
      renderList()
    },
    render: renderList,
    prefix: () => prefixText
  }
}
