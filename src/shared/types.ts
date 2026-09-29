export type Theme = 'light' | 'dark'

export interface Settings {
  theme: Theme
  /** 'auto' = PCの言語に合わせる */
  uiLanguage: string
  showCommandLog: boolean
  /** '' = Downloads フォルダ */
  outputDir: string
}

export const DEFAULT_SETTINGS: Settings = {
  theme: 'dark',
  uiLanguage: 'auto',
  showCommandLog: true,
  outputDir: ''
}

export interface PickedFile {
  name: string
  size: number
  text: string
}

export const IPC = {
  getSettings: 'settings:get',
  setSettings: 'settings:set',
  getLocale: 'app:locale',
  commandLog: 'log:command',
  chooseDir: 'dialog:choose-dir',
  saveFile: 'file:save',
  getOutputDir: 'app:output-dir',
  openFiles: 'dialog:open-files'
} as const

export interface Api {
  getSettings(): Promise<Settings>
  setSettings(patch: Partial<Settings>): Promise<Settings>
  getLocale(): Promise<string>
  onCommandLog(cb: (text: string) => void): void
  getOutputDir(): Promise<string>
  openFiles(): Promise<PickedFile[]>
  chooseDir(): Promise<string | null>
  saveFile(name: string, content: string): Promise<string>
}
