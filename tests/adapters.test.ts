import { test } from 'node:test'
import assert from 'node:assert/strict'
import type { Provider } from '../src/shared/types.ts'
import { BadFormatError, createAdapter, parseLlmArray } from '../src/main/translate/adapters.ts'

interface Call {
  url: string
  headers: Record<string, string>
  body: any
}

function mockFetch(reply: (c: Call) => unknown, status = 200): Call[] {
  const calls: Call[] = []
  globalThis.fetch = (async (url: string | URL, init?: RequestInit) => {
    const call: Call = {
      url: String(url),
      headers: (init?.headers ?? {}) as Record<string, string>,
      body: JSON.parse(String(init?.body))
    }
    calls.push(call)
    return new Response(JSON.stringify(reply(call)), { status })
  }) as typeof fetch
  return calls
}

const prov = (type: Provider['type'], extra: Partial<Provider> = {}): Provider => ({
  id: type,
  type,
  name: type,
  baseUrl: 'http://x/v1',
  apiKey: 'K',
  model: 'm',
  enabled: true,
  priority: 1,
  ...extra
})
const sig = new AbortController().signal

test('parseLlmArray: strips think/fences, rejects bad shapes', () => {
  assert.deepEqual(parseLlmArray('<think>x</think>```json\n["a","b"]\n```', 2), ['a', 'b'])
  assert.deepEqual(parseLlmArray('["a [1]", "b"]', 2), ['a [1]', 'b'])
  assert.throws(() => parseLlmArray('["a"]', 2), BadFormatError)
  assert.throws(() => parseLlmArray('no array', 1), BadFormatError)
  assert.throws(() => parseLlmArray('[1, 2]', 2), BadFormatError)
})

test('lmstudio: chat completions, no auth header without key', async () => {
  const calls = mockFetch(() => ({ choices: [{ message: { content: '["こんにちは","世界"]' } }] }))
  const out = await createAdapter(prov('lmstudio', { apiKey: '' })).translate(['Hello', 'World'], 'auto', 'ja', sig)
  assert.deepEqual(out, ['こんにちは', '世界'])
  assert.equal(calls[0].url, 'http://x/v1/chat/completions')
  assert.equal(calls[0].headers.Authorization, undefined)
  assert.equal(calls[0].body.model, 'm')
  assert.equal(calls[0].body.messages[1].content, JSON.stringify(['Hello', 'World']))
})

test('openai: bearer auth, no temperature', async () => {
  const calls = mockFetch(() => ({ choices: [{ message: { content: '["A"]' } }] }))
  await createAdapter(prov('openai')).translate(['a'], 'auto', 'ja', sig)
  assert.equal(calls[0].headers.Authorization, 'Bearer K')
  assert.equal(calls[0].body.temperature, undefined)
})

test('ollama: /api/chat', async () => {
  const calls = mockFetch(() => ({ message: { content: '["A"]' } }))
  const out = await createAdapter(prov('ollama', { baseUrl: 'http://x/' })).translate(['a'], 'auto', 'ja', sig)
  assert.deepEqual(out, ['A'])
  assert.equal(calls[0].url, 'http://x/api/chat')
  assert.equal(calls[0].body.stream, false)
})

test('claude: messages API headers', async () => {
  const calls = mockFetch(() => ({ content: [{ type: 'text', text: '["A"]' }] }))
  const out = await createAdapter(prov('claude')).translate(['a'], 'auto', 'ja', sig)
  assert.deepEqual(out, ['A'])
  assert.equal(calls[0].url, 'http://x/v1/messages')
  assert.equal(calls[0].headers['x-api-key'], 'K')
  assert.equal(calls[0].headers['anthropic-version'], '2023-06-01')
})

test('gemini: generateContent with key in header', async () => {
  const calls = mockFetch(() => ({ candidates: [{ content: { parts: [{ text: '["A"]' }] } }] }))
  const out = await createAdapter(prov('gemini', { baseUrl: 'http://x/v1beta', model: 'models/gem' })).translate(
    ['a'],
    'auto',
    'ja',
    sig
  )
  assert.deepEqual(out, ['A'])
  assert.equal(calls[0].url, 'http://x/v1beta/models/gem:generateContent')
  assert.equal(calls[0].headers['x-goog-api-key'], 'K')
})

test('deepl: target/source codes and auth header', async () => {
  const calls = mockFetch(() => ({ translations: [{ text: 'A' }, { text: 'B' }] }))
  const ad = createAdapter(prov('deepl', { baseUrl: 'http://x/v2' }))
  assert.deepEqual(await ad.translate(['a', 'b'], 'auto', 'ja', sig), ['A', 'B'])
  assert.equal(calls[0].url, 'http://x/v2/translate')
  assert.equal(calls[0].headers.Authorization, 'DeepL-Auth-Key K')
  assert.equal(calls[0].body.target_lang, 'JA')
  assert.equal(calls[0].body.source_lang, undefined)
  await ad.translate(['a', 'b'], 'en-US', 'en', sig)
  assert.equal(calls[1].body.target_lang, 'EN-US')
  assert.equal(calls[1].body.source_lang, 'EN')
})

test('deepl: count mismatch is a BadFormatError', async () => {
  mockFetch(() => ({ translations: [{ text: 'A' }] }))
  await assert.rejects(createAdapter(prov('deepl', { baseUrl: 'http://x/v2' })).translate(['a', 'b'], 'auto', 'ja', sig), BadFormatError)
})

test('google-translate: v2 body and key header', async () => {
  const calls = mockFetch(() => ({ data: { translations: [{ translatedText: 'A' }] } }))
  const out = await createAdapter(prov('google-translate', { baseUrl: 'http://x/v2' })).translate(['a'], 'auto', 'zh-CN', sig)
  assert.deepEqual(out, ['A'])
  assert.equal(calls[0].url, 'http://x/v2')
  assert.equal(calls[0].headers['X-goog-api-key'], 'K')
  assert.equal(calls[0].body.target, 'zh-CN')
  assert.equal(calls[0].body.format, 'text')
})

test('libretranslate: /translate with api_key', async () => {
  const calls = mockFetch(() => ({ translatedText: ['A'] }))
  const out = await createAdapter(prov('libretranslate', { baseUrl: 'http://x' })).translate(['a'], 'auto', 'pt-BR', sig)
  assert.deepEqual(out, ['A'])
  assert.equal(calls[0].url, 'http://x/translate')
  assert.equal(calls[0].body.api_key, 'K')
  assert.equal(calls[0].body.source, 'auto')
  assert.equal(calls[0].body.target, 'pt')
})

test('HTTP errors surface the status', async () => {
  mockFetch(() => ({ error: 'nope' }), 401)
  await assert.rejects(createAdapter(prov('openai')).translate(['a'], 'auto', 'ja', sig), /HTTP 401/)
})
