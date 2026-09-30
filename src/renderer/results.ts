import * as monaco from 'monaco-editor/editor/editor.api.js'
import { fileNameFor, getLanguage } from '@shared/languages'
import type { BulkFile } from '@shared/types'
import { nativeName } from './langpicker'

type Status = 'pending' | 'running' | 'done' | 'failed' | 'cancelled'

interface Result {
  code: string
  file: string
  status: Status
  text: string
  /** 保存前の編集内容 (保存または元に戻すと消える) */
  draft?: string
  warnings: number
  message: string
}

export interface ResultsDeps {
  getSource(): string
  getSourceName(): string
  getOptions(): { mode: 'structure' | 'keys'; ignoreKeys: string }
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
  const edHost = el('div', 'acc-editor')
  accBar.append(saveBtn, accHint)
  acc.append(accBar, edHost)
  let ed: monaco.editor.IStandaloneCodeEditor | null = null

  const rowName = (r: Result): string => `${r.file}${r.draft !== undefined ? ' ●' : ''}`

  const getEd = (): monaco.editor.IStandaloneCodeEditor => {
    if (ed) return ed
    const e = monaco.editor.create(edHost, {
      value: '',
      language: 'json',
      automaticLayout: true,
      minimap: { enabled: false },
      lineNumbers: 'on',
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
        return t('tr.done') + (r.warnings ? ` (${t('tr.warnings')}: ${r.warnings})` : '')
      case 'failed':
        return `${t('tr.failed')}: ${r.message.slice(0, 60)}`
      case 'cancelled':
        return t('tr.cancelled')
    }
  }

  const toggle = (i: number): void => {
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
      if (r.status === 'failed') st.title = r.message
      const dl = el('button', undefined, t('res.download'))
      dl.disabled = r.status !== 'done'
      dl.addEventListener('click', () => void downloadOne(r))
      head.append(el('span', 'arrow', i === openIdx ? '▾' : '▸'), name, el('span', 'rmeta', nativeName(r.code)), st, dl)
      head.addEventListener('click', (e) => {
        if ((e.target as HTMLElement).closest('button')) return
        toggle(i)
      })
      li.appendChild(head)
      list.appendChild(li)
      if (i === openIdx) {
        openName = name
        li.appendChild(acc)
        getEd().layout()
      }
    })
  }

  // --- 複数言語の翻訳 (選択した言語を順に翻訳) ---
  const start = async (codes: string[]): Promise<void> => {
    const src = deps.getSource()
    const s = await window.api.getSettings()
    const opt = deps.getOptions()
    const next: Result[] = []
    for (const code of codes) {
      const l = getLanguage(code)
      if (l) next.push({ code, file: fileNameFor(l, s.fileNameStyle), status: 'pending', text: '', warnings: 0, message: '' })
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
        from: 'auto',
        to: r.code
      })
      if (out.ok) {
        r.status = 'done'
        r.text = out.text
        r.warnings = out.warnings
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
    const warn = results.reduce((n, r) => n + r.warnings, 0)
    status.textContent =
      `${t('tr.done')}: ${ok}/${results.length}` +
      (failed ? ` / ${t('tr.failed')}: ${failed}` : '') +
      (warn ? ` / ${t('tr.warnings')}: ${warn}` : '') +
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
