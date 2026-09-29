import { app, BrowserWindow, dialog, ipcMain } from 'electron'
import { basename, extname, join } from 'path'
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'fs'
import { DEFAULT_SETTINGS, IPC, type Provider, type Settings, type TestResult } from '@shared/types'

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
      return { ...DEFAULT_SETTINGS, ...JSON.parse(readFileSync(settingsPath, 'utf-8')) }
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

function createWindow(): void {
  win = new BrowserWindow({
    width: 1200,
    height: 800,
    show: false,
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
  ipcMain.handle(IPC.getSettings, () => settings)
  ipcMain.handle(IPC.setSettings, (_e, patch: Partial<Settings>) => {
    settings = { ...settings, ...patch }
    saveSettings(settings)
    logCommand(`save settings: ${Object.keys(patch).join(', ')}`)
    return settings
  })
  ipcMain.handle(IPC.getLocale, () => app.getLocale())
  ipcMain.handle(IPC.testProvider, (_e, p: Provider) => testProvider(p))
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
