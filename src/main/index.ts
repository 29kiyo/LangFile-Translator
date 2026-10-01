import { app, BrowserWindow, dialog, ipcMain } from 'electron'
import { basename, extname, join } from 'path'
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'fs'
import {
  DEFAULT_SETTINGS,
  type BulkFile,
  IPC,
  type Provider,
  type Settings,
  type TestResult,
  type TranslateRequest,
  type TranslateResult
} from '@shared/types'
import { translateJson } from './translate/engine'
import { makeZip } from './zip'
import iconIco from '../../build/icon.ico?asset'
import iconPng from '../../build/icon.png?asset'

const appIcon = process.platform === 'win32' ? iconIco : iconPng
const settingsPath = join(app.getPath('userData'), 'settings.json')
let win: BrowserWindow | null = null

/** 実行した処理をコンソールとUIログに流す (表示のon/offはUI側の設定) */
function logCommand(text: string): void {
  console.log(`[cmd] ${text}`)
  win?.webContents.send(IPC.commandLog, text)
}

function loadSettings(): Settings {
  try {
    if (existsSync(settingsPath)) {
      const raw = JSON.parse(readFileSync(settingsPath, 'utf-8')) as Partial<Settings> & { targetLang?: string }
      const s: Settings = { ...DEFAULT_SETTINGS, ...raw }
      // 旧バージョンの targetLang (単体言語の選択) を targetLangs に引き継ぐ
      if (!Array.isArray(raw.targetLangs) && typeof raw.targetLang === 'string') s.targetLangs = [raw.targetLang]
      return s
    }
  } catch {
    // 壊れている場合はデフォルトに戻す
  }
  return { ...DEFAULT_SETTINGS }
}

function saveSettings(s: Settings): void {
  mkdirSync(app.getPath('userData'), { recursive: true })
  writeFileSync(settingsPath, JSON.stringify(s, null, 2))
}

let settings = loadSettings()

function resolveOutputDir(): string {
  return settings.outputDir || app.getPath('downloads')
}

/** 既存ファイルは上書きせず "name (1).json" のように連番を付ける */
function uniquePath(dir: string, name: string): string {
  const ext = extname(name)
  const base = basename(name, ext)
  let p = join(dir, name)
  for (let i = 1; existsSync(p); i++) p = join(dir, `${base} (${i})${ext}`)
  return p
}

const arr = (v: unknown): Record<string, unknown>[] => (Array.isArray(v) ? v : [])

/** 接続テスト: モデル一覧 (または疎通確認用エンドポイント) を取得。APIキーはログに出さない */
async function testProvider(p: Provider): Promise<TestResult> {
  const base = p.baseUrl.replace(/\/+$/, '')
  const key = p.apiKey
  const headers: Record<string, string> = {}
  let url = ''
  switch (p.type) {
    case 'lmstudio':
      url = `${base}/models`
      break
    case 'openai':
      url = `${base}/models`
      headers.Authorization = `Bearer ${key}`
      break
    case 'ollama':
      url = `${base}/api/tags`
      break
    case 'claude':
      url = `${base}/models`
      headers['x-api-key'] = key
      headers['anthropic-version'] = '2023-06-01'
      break
    case 'gemini':
      url = `${base}/models?pageSize=200&key=${encodeURIComponent(key)}`
      break
    case 'deepl':
      url = `${base}/usage`
      headers.Authorization = `DeepL-Auth-Key ${key}`
      break
    case 'google-translate':
      url = `${base}/languages?target=en&key=${encodeURIComponent(key)}`
      break
    case 'libretranslate':
      url = `${base}/languages`
      break
  }
  logCommand(`test connection [${p.type}] GET ${url.split('?')[0]}`)
  try {
    const res = await fetch(url, { headers, signal: AbortSignal.timeout(10000) })
    if (!res.ok) {
      return { ok: false, message: `HTTP ${res.status} ${(await res.text()).slice(0, 200)}`, models: [] }
    }
    const json = (await res.json()) as Record<string, unknown>
    let models: string[] = []
    if (p.type === 'lmstudio' || p.type === 'openai' || p.type === 'claude') {
      models = arr(json.data).map((m) => String(m.id))
    } else if (p.type === 'ollama') {
      models = arr(json.models).map((m) => String(m.name))
    } else if (p.type === 'gemini') {
      models = arr(json.models).map((m) => String(m.name).replace(/^models\//, ''))
    }
    return { ok: true, message: 'OK', models }
  } catch (e) {
    const err = e as Error & { cause?: { code?: string } }
    return {
      ok: false,
      message: err.message + (err.cause?.code ? ` (${err.cause.code})` : ''),
      models: []
    }
  }
}

let job: AbortController | null = null

async function runTranslate(req: TranslateRequest): Promise<TranslateResult> {
  if (job) return { ok: false, text: '', message: 'Another translation is running', warnings: 0 }
  const ac = new AbortController()
  job = ac
  const providers = settings.providers.filter((p) => p.enabled)
  const dist = settings.distribution.enabled
  logCommand(
    `translate ${req.mode} ${req.from} -> ${req.to} (providers: ${providers.map((p) => p.name).join(' > ') || 'none'}${dist ? ', distribution' : ''})`
  )
  try {
    const r = await translateJson(req.text, {
      providers,
      distribution: dist,
      mode: req.mode,
      ignoreKeys: req.ignoreKeys,
      marks: req.marks && { marked: new Set(req.marks.marked), released: new Set(req.marks.released) },
      from: req.from,
      to: req.to,
      signal: ac.signal,
      onProgress: (done, total) => win?.webContents.send(IPC.translateProgress, { done, total }),
      log: logCommand
    })
    logCommand(`translate done (untranslated: ${r.warnings}, used: ${r.used.join(', ') || '-'})`)
    return { ok: true, text: r.text, message: r.used.join(', '), warnings: r.warnings }
  } catch (e) {
    if (ac.signal.aborted) {
      logCommand('translate cancelled')
      return { ok: false, cancelled: true, text: '', message: 'cancelled', warnings: 0 }
    }
    const msg = (e as Error).message
    logCommand(`translate failed: ${msg}`)
    return { ok: false, text: '', message: msg, warnings: 0 }
  } finally {
    job = null
  }
}

function createWindow(): void {
  win = new BrowserWindow({
    width: 1200,
    height: 800,
    show: false,
    icon: appIcon,
    backgroundColor: settings.theme === 'dark' ? '#1e1e1e' : '#ffffff',
    webPreferences: { preload: join(__dirname, '../preload/index.js') }
  })
  win.once('ready-to-show', () => win?.show())
  win.on('closed', () => {
    win = null
  })
  win.webContents.once('did-finish-load', () => logCommand(`app started (settings: ${settingsPath})`))
  if (process.env['ELECTRON_RENDERER_URL']) {
    win.loadURL(process.env['ELECTRON_RENDERER_URL'])
  } else {
    win.loadFile(join(__dirname, '../renderer/index.html'))
  }
}

app.whenReady().then(() => {
  // タスクバーのグループ化・ピン留め用 (配布版の appId と同じ値にする)
  app.setAppUserModelId('com.github.29kiyo.json-translator')
  ipcMain.handle(IPC.getSettings, () => settings)
  ipcMain.handle(IPC.setSettings, (_e, patch: Partial<Settings>) => {
    settings = { ...settings, ...patch }
    saveSettings(settings)
    logCommand(`save settings: ${Object.keys(patch).join(', ')}`)
    return settings
  })
  ipcMain.handle(IPC.getLocale, () => app.getLocale())
  ipcMain.handle(IPC.testProvider, (_e, p: Provider) => testProvider(p))
  ipcMain.handle(IPC.translate, (_e, req: TranslateRequest) => runTranslate(req))
  ipcMain.handle(IPC.cancelTranslate, () => {
    job?.abort()
  })
  ipcMain.handle(IPC.getOutputDir, () => resolveOutputDir())
  ipcMain.handle(IPC.openFiles, async () => {
    const r = await dialog.showOpenDialog({
      properties: ['openFile', 'multiSelections'],
      filters: [
        { name: 'JSON / Text', extensions: ['json', 'txt', 'lang', 'properties'] },
        { name: 'All', extensions: ['*'] }
      ]
    })
    if (r.canceled) return []
    logCommand(`open files ${r.filePaths.join(', ')}`)
    return r.filePaths.map((p) => {
      const buf = readFileSync(p)
      return { name: basename(p), size: buf.length, text: buf.toString('utf-8') }
    })
  })
  ipcMain.handle(IPC.chooseDir, async () => {
    const r = await dialog.showOpenDialog({
      properties: ['openDirectory', 'createDirectory'],
      defaultPath: resolveOutputDir()
    })
    return r.canceled ? null : r.filePaths[0]
  })
  ipcMain.handle(IPC.saveBulk, (_e, files: BulkFile[], zipName: string) => {
    const dir = resolveOutputDir()
    mkdirSync(dir, { recursive: true })
    if (settings.bulkMethod === 'zip') {
      const p = uniquePath(dir, basename(zipName))
      writeFileSync(p, makeZip(files))
      logCommand(`write zip ${p} (${files.length} files)`)
      return { path: p, count: files.length }
    }
    for (const f of files) {
      const p = uniquePath(dir, basename(f.name))
      writeFileSync(p, f.content, 'utf-8')
      logCommand(`write file ${p}`)
    }
    return { path: dir, count: files.length }
  })
  ipcMain.handle(IPC.saveFile, (_e, name: string, content: string) => {
    const dir = resolveOutputDir()
    mkdirSync(dir, { recursive: true })
    const p = uniquePath(dir, basename(name))
    writeFileSync(p, content, 'utf-8')
    logCommand(`write file ${p}`)
    return p
  })

  createWindow()
  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow()
  })
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit()
})
