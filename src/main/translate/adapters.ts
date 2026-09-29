import type { Provider } from '@shared/types'
import { langName } from './core.ts'

export interface Adapter {
  maxItems: number
  maxChars: number
  translate(texts: string[], from: string, to: string, signal: AbortSignal): Promise<string[]>
}

/** 応答の形式不正 (件数違い・JSONでない等)。バッチ分割や次のプロバイダーで再試行する対象 */
export class BadFormatError extends Error {}

const TIMEOUT_MS = 180_000

type Json = any // eslint-disable-line @typescript-eslint/no-explicit-any

async function post(
  url: string,
  headers: Record<string, string>,
  body: unknown,
  signal: AbortSignal
): Promise<Json> {
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...headers },
    body: JSON.stringify(body),
    signal: AbortSignal.any([signal, AbortSignal.timeout(TIMEOUT_MS)])
  })
  const text = await res.text()
  if (!res.ok) throw new Error(`HTTP ${res.status}: ${text.slice(0, 200)}`)
  try {
    return JSON.parse(text)
  } catch {
    throw new Error('Invalid JSON response')
  }
}

// ---- LLM 共通 ----
function llmPrompt(from: string, to: string): string {
  const src = from === 'auto' ? 'the source language (auto-detect)' : langName(from)
  return (
    `You are a professional translator. The user sends a JSON array of strings. ` +
    `Translate each string from ${src} into ${langName(to)}. ` +
    `Return ONLY a JSON array of strings with exactly the same number of items in the same order. ` +
    `Keep tokens like ⟦0⟧ exactly as they are. Do not translate proper nouns or code. ` +
    `No explanations, no code fences.`
  )
}

export function parseLlmArray(content: string, expected: number): string[] {
  const s = content.replace(/<think>[\s\S]*?<\/think>/g, '').trim()
  const a = s.indexOf('[')
  const b = s.lastIndexOf(']')
  if (a < 0 || b < a) throw new BadFormatError('no JSON array in response')
  let arr: unknown
  try {
    arr = JSON.parse(s.slice(a, b + 1))
  } catch {
    throw new BadFormatError('invalid JSON array')
  }
  if (!Array.isArray(arr) || arr.length !== expected || !arr.every((x) => typeof x === 'string')) {
    throw new BadFormatError(`expected ${expected} strings`)
  }
  return arr as string[]
}

function llm(call: (system: string, user: string, signal: AbortSignal) => Promise<string>): Adapter {
  return {
    maxItems: 20,
    maxChars: 3000,
    async translate(texts, from, to, signal) {
      const content = await call(llmPrompt(from, to), JSON.stringify(texts), signal)
      return parseLlmArray(content, texts.length)
    }
  }
}

// ---- 機械翻訳 共通 ----
function mt(
  maxItems: number,
  maxChars: number,
  call: (texts: string[], from: string, to: string, signal: AbortSignal) => Promise<unknown>
): Adapter {
  return {
    maxItems,
    maxChars,
    async translate(texts, from, to, signal) {
      const out = await call(texts, from, to, signal)
      if (!Array.isArray(out) || out.length !== texts.length || !out.every((x) => typeof x === 'string')) {
        throw new BadFormatError(`expected ${texts.length} translations`)
      }
      return out as string[]
    }
  }
}

const base2 = (c: string): string => c.split('-')[0].toLowerCase()
const googleCode = (c: string): string => (c === 'zh-CN' || c === 'zh-TW' ? c : base2(c))
function deeplTarget(c: string): string {
  const u = c.toUpperCase()
  const map: Record<string, string> = { EN: 'EN-US', PT: 'PT-BR', 'ZH-CN': 'ZH-HANS', 'ZH-TW': 'ZH-HANT' }
  return map[u] ?? u
}

export function createAdapter(p: Provider): Adapter {
  const base = p.baseUrl.replace(/\/+$/, '')
  const key = p.apiKey
  switch (p.type) {
    case 'lmstudio':
    case 'openai':
      return llm(async (system, user, signal) => {
        const j = await post(
          `${base}/chat/completions`,
          key ? { Authorization: `Bearer ${key}` } : {},
          {
            model: p.model || undefined,
            // OpenAI の一部モデルは temperature の指定を受け付けないため lmstudio のみ指定
            temperature: p.type === 'lmstudio' ? 0 : undefined,
            messages: [
              { role: 'system', content: system },
              { role: 'user', content: user }
            ]
          },
          signal
        )
        return String(j.choices?.[0]?.message?.content ?? '')
      })
    case 'ollama':
      return llm(async (system, user, signal) => {
        const j = await post(
          `${base}/api/chat`,
          {},
          {
            model: p.model,
            stream: false,
            options: { temperature: 0 },
            messages: [
              { role: 'system', content: system },
              { role: 'user', content: user }
            ]
          },
          signal
        )
        return String(j.message?.content ?? '')
      })
    case 'claude':
      return llm(async (system, user, signal) => {
        const j = await post(
          `${base}/messages`,
          { 'x-api-key': key, 'anthropic-version': '2023-06-01' },
          {
            model: p.model,
            max_tokens: 8192,
            temperature: 0,
            system,
            messages: [{ role: 'user', content: user }]
          },
          signal
        )
        return (j.content ?? [])
          .filter((b: Json) => b.type === 'text')
          .map((b: Json) => b.text)
          .join('')
      })
    case 'gemini':
      return llm(async (system, user, signal) => {
        const model = p.model.replace(/^models\//, '')
        const j = await post(
          `${base}/models/${model}:generateContent`,
          { 'x-goog-api-key': key },
          {
            systemInstruction: { parts: [{ text: system }] },
            contents: [{ role: 'user', parts: [{ text: user }] }],
            generationConfig: { temperature: 0 }
          },
          signal
        )
        return (j.candidates?.[0]?.content?.parts ?? []).map((x: Json) => x.text ?? '').join('')
      })
    case 'deepl':
      return mt(50, 30000, async (texts, from, to, signal) => {
        const j = await post(
          `${base}/translate`,
          { Authorization: `DeepL-Auth-Key ${key}` },
          {
            text: texts,
            target_lang: deeplTarget(to),
            source_lang: from === 'auto' ? undefined : from.split('-')[0].toUpperCase(),
            preserve_formatting: true
          },
          signal
        )
        return (j.translations ?? []).map((x: Json) => x.text)
      })
    case 'google-translate':
      return mt(100, 4000, async (texts, from, to, signal) => {
        const j = await post(
          base,
          { 'X-goog-api-key': key },
          {
            q: texts,
            target: googleCode(to),
            source: from === 'auto' ? undefined : googleCode(from),
            format: 'text'
          },
          signal
        )
        return (j.data?.translations ?? []).map((x: Json) => x.translatedText)
      })
    case 'libretranslate':
      return mt(50, 3000, async (texts, from, to, signal) => {
        const j = await post(
          `${base}/translate`,
          {},
          {
            q: texts,
            source: from === 'auto' ? 'auto' : base2(from),
            target: base2(to),
            format: 'text',
            api_key: key || undefined
          },
          signal
        )
        return Array.isArray(j.translatedText) ? j.translatedText : [j.translatedText]
      })
  }
}
