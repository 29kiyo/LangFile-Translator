export type Theme = 'light' | 'dark'

export type ProviderType =
  | 'gemini'
  | 'claude'
  | 'openai'
  | 'google-translate'
  | 'deepl'
  | 'lmstudio'
  | 'ollama'
  | 'libretranslate'

export interface Provider {
  id: string
  type: ProviderType
  name: string
  baseUrl: string
  apiKey: string
  model: string
  enabled: boolean
  /** 1 = 最優先。失敗時は次の番号へフォールバック */
  priority: number
  /** libretranslate のみ: api / local */
  mode?: 'api' | 'local'
}

/** 分配設定 (型のみ。実装は phase4) */
export interface DistributionSettings {
  enabled: boolean
}

export interface TestResult {
  ok: boolean
  message: string
  models: string[]
}

export interface Settings {
  theme: Theme
  /** 'auto' = PCの言語に合わせる */
  uiLanguage: string
  showCommandLog: boolean
  /** '' = Downloads フォルダ */
  outputDir: string
  providers: Provider[]
  distribution: DistributionSettings
}

export const DEFAULT_SETTINGS: Settings = {
  theme: 'dark',
  uiLanguage: 'auto',
  showCommandLog: true,
  outputDir: '',
  providers: [],
  distribution: { enabled: false }
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
  openFiles: 'dialog:open-files',
  testProvider: 'provider:test'
} as const

export interface Api {
  getSettings(): Promise<Settings>
  setSettings(patch: Partial<Settings>): Promise<Settings>
  getLocale(): Promise<string>
  onCommandLog(cb: (text: string) => void): void
  getOutputDir(): Promise<string>
  openFiles(): Promise<PickedFile[]>
  testProvider(p: Provider): Promise<TestResult>
  chooseDir(): Promise<string | null>
  saveFile(name: string, content: string): Promise<string>
}
