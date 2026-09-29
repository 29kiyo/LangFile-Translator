export type Theme = 'light' | 'dark'

export interface Settings {
  theme: Theme
  /** 'auto' = PCの言語に合わせる */
  uiLanguage: string
  showCommandLog: boolean
}

export const DEFAULT_SETTINGS: Settings = {
  theme: 'dark',
  uiLanguage: 'auto',
  showCommandLog: true
}

export const IPC = {
  getSettings: 'settings:get',
  setSettings: 'settings:set',
  getLocale: 'app:locale',
  commandLog: 'log:command'
} as const

export interface Api {
  getSettings(): Promise<Settings>
  setSettings(patch: Partial<Settings>): Promise<Settings>
  getLocale(): Promise<string>
  onCommandLog(cb: (text: string) => void): void
}
