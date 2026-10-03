import type { FormatId } from './formats/types.ts'
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
  /** 元ファイルの形式 (省略時は JSON) */
  format?: FormatId
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

export type BulkMethod = 'zip' | 'folder'

export interface BulkFile {
  name: string
  content: string
}

export interface BulkResult {
  path: string
  count: number
}

export type DeleteImported = 'ask' | 'always' | 'never'

export interface PickedLocaleFile {
  path: string
  name: string
  text: string
  tooBig: boolean
}

export interface SaveLocaleRequest {
  code: string
  dict: Record<string, string>
  /** 追加元のファイル (削除の対象。選んだファイルのパスだけ受け付ける) */
  sourcePath: string
  /** 削除の確認ダイアログの文言 (表示言語に合わせて画面側から渡す) */
  confirm: { message: string; yes: string; no: string }
}

export interface SaveLocaleResult {
  ok: boolean
  deleted: boolean
  message: string
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
  bulkMethod: BulkMethod
  /** 表示言語ファイルの追加後、元のファイルを削除するか */
  deleteImported: DeleteImported
  /** 複数言語モードで選択中の言語コード */
  targetLangs: string[]
}

export const DEFAULT_SETTINGS: Settings = {
  theme: 'dark',
  uiLanguage: 'auto',
  showCommandLog: false,
  outputDir: '',
  providers: [],
  distribution: { enabled: false },
  translateMode: 'structure',
  ignoreKeys: '',
  bulkMethod: 'zip',
  deleteImported: 'ask',
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
  saveBulk: 'file:save-bulk',
  pickUiLocaleFiles: 'uilocale:pick',
  saveUiLocale: 'uilocale:save',
  listUiLocales: 'uilocale:list',
  deleteUiLocale: 'uilocale:delete'
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
  pickUiLocaleFiles(): Promise<PickedLocaleFile[]>
  saveUiLocale(req: SaveLocaleRequest): Promise<SaveLocaleResult>
  listUiLocales(): Promise<Record<string, Record<string, string>>>
  deleteUiLocale(code: string): Promise<boolean>
  chooseDir(): Promise<string | null>
  saveFile(name: string, content: string): Promise<string>
}
