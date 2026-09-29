import type { ProviderType } from './types'

export interface ProviderPreset {
  label: string
  baseUrl: string
  needsKey: boolean
  needsModel: boolean
}

export const PROVIDER_PRESETS: Record<ProviderType, ProviderPreset> = {
  lmstudio: { label: 'LM Studio', baseUrl: 'http://localhost:1234/v1', needsKey: false, needsModel: true },
  ollama: { label: 'Ollama', baseUrl: 'http://localhost:11434', needsKey: false, needsModel: true },
  gemini: {
    label: 'Gemini',
    baseUrl: 'https://generativelanguage.googleapis.com/v1beta',
    needsKey: true,
    needsModel: true
  },
  claude: { label: 'Claude', baseUrl: 'https://api.anthropic.com/v1', needsKey: true, needsModel: true },
  openai: { label: 'ChatGPT (OpenAI)', baseUrl: 'https://api.openai.com/v1', needsKey: true, needsModel: true },
  'google-translate': {
    label: 'Google Translate',
    baseUrl: 'https://translation.googleapis.com/language/translate/v2',
    needsKey: true,
    needsModel: false
  },
  deepl: { label: 'DeepL', baseUrl: 'https://api-free.deepl.com/v2', needsKey: true, needsModel: false },
  libretranslate: {
    label: 'LibreTranslate',
    baseUrl: 'https://libretranslate.com',
    needsKey: true,
    needsModel: false
  }
}

/** LibreTranslate をローカル実行するときの既定URL */
export const LIBRE_LOCAL_URL = 'http://localhost:5000'
