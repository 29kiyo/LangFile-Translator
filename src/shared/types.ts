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

export type TranslateMode = 'structure' | 'keys'

export interface TranslateRequest {
  /** 行マーカー: 個別に無視 (marked) / 無視キーの一覧から個別に外す (released) 出現位置のパス */
  marks?: { marked: string[]; released: string[] }
  text: string
  mode: TranslateMode
  ignoreKeys: string
  from: string
  to: string
}

export interface TranslateResult {
  ok: boolean
  cancelled?: boolean
  text: string
  message: string
  warnings: number
}

export interface TranslateProgress {
  done: number
  total: number
}

export type NameStyle = 'full' | 'short'
export type BulkMethod = 'zip' | 'folder'

export interface BulkFile {
  name: string
  content: string
}

export interface BulkResult {
  path: string
  count: number
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
  translateMode: TranslateMode
  ignoreKeys: string
  /** ja_jp.json (full) / ja.json (short) */
  fileNameStyle: NameStyle
  bulkMethod: BulkMethod
  /** 複数言語モードで選択中の言語コード */
  targetLangs: string[]
}

export const DEFAULT_SETTINGS: Settings = {
  theme: 'dark',
  uiLanguage: 'auto',
  showCommandLog: true,
  outputDir: '',
  providers: [],
  distribution: { enabled: false },
  translateMode: 'structure',
  ignoreKeys: '',
  fileNameStyle: 'full',
  bulkMethod: 'zip',
  targetLangs: ['ja']
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
  testProvider: 'provider:test',
  translate: 'translate:run',
  cancelTranslate: 'translate:cancel',
  translateProgress: 'translate:progress',
  saveBulk: 'file:save-bulk'
} as const

export interface Api {
  getSettings(): Promise<Settings>
  setSettings(patch: Partial<Settings>): Promise<Settings>
  getLocale(): Promise<string>
  onCommandLog(cb: (text: string) => void): void
  getOutputDir(): Promise<string>
  openFiles(): Promise<PickedFile[]>
  testProvider(p: Provider): Promise<TestResult>
  translate(req: TranslateRequest): Promise<TranslateResult>
  cancelTranslate(): Promise<void>
  onTranslateProgress(cb: (p: TranslateProgress) => void): void
  saveBulk(files: BulkFile[], zipName: string): Promise<BulkResult>
  chooseDir(): Promise<string | null>
  saveFile(name: string, content: string): Promise<string>
}
