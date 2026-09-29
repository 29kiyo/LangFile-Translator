import { app, BrowserWindow, ipcMain } from 'electron'
import { join } from 'path'
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'fs'
import { DEFAULT_SETTINGS, IPC, type Settings } from '@shared/types'

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

function createWindow(): void {
  win = new BrowserWindow({
    width: 1200,
    height: 800,
    webPreferences: { preload: join(__dirname, '../preload/index.js') }
  })
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
    logCommand(`save settings ${JSON.stringify(patch)}`)
    return settings
  })
  ipcMain.handle(IPC.getLocale, () => app.getLocale())

  createWindow()
  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow()
  })
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit()
})
