import { test } from 'node:test'
import assert from 'node:assert/strict'
import type { Provider } from '../src/shared/types.ts'
import type { Adapter } from '../src/main/translate/adapters.ts'
import type { EngineOptions } from '../src/main/translate/engine.ts'
import type { FormatId } from '../src/shared/formats/types.ts'
import { translateJson } from '../src/main/translate/engine.ts'

const provider = {
  id: 'p',
  type: 'lmstudio',
  name: 'p',
  baseUrl: '',
  apiKey: '',
  model: '',
  enabled: true,
  priority: 1
} as unknown as Provider
const fake = {
  maxItems: 50,
  maxChars: 10000,
  translate: async (texts: string[]) => texts.map((s) => `[${s}]`)
} as unknown as Adapter

const run = (text: string, format: FormatId, extra: Partial<EngineOptions> = {}) =>
  translateJson(text, {
    providers: [provider],
    distribution: false,
    mode: 'structure',
    ignoreKeys: '',
    format,
    from: 'auto',
    to: 'ja',
    signal: new AbortController().signal,
    onProgress: () => {},
    log: () => {},
    makeAdapter: () => fake,
    ...extra
  })

test('properties: 値だけ翻訳し、コメントと無視キーはそのまま', async () => {
  const r = await run('a=Hello\n# c\nb=Bye\n', 'properties', { ignoreKeys: 'b' })
  assert.equal(r.text, 'a=[Hello]\n# c\nb=Bye\n')
})

test('ini: セクションと引用符を保つ', async () => {
  const r = await run('[S]\nname = "My App"\n', 'ini')
  assert.equal(r.text, '[S]\nname = "[My App]"\n')
})

test('arb: @ のキーはそのまま、@@locale は翻訳先、キー翻訳モードでも値だけ', async () => {
  const src = '{\n  "@@locale": "en",\n  "hi": "Hello",\n  "@hi": { "description": "greeting" }\n}\n'
  const r = await run(src, 'arb', { mode: 'keys', to: 'zh-CN' })
  const o = JSON.parse(r.text)
  assert.equal(o['@@locale'], 'zh_CN')
  assert.equal(o.hi, '[Hello]')
  assert.equal(o['@hi'].description, 'greeting')
})

test('csv: 列を選んで翻訳 (無視キー)、引用符を保つ', async () => {
  const r = await run('id,text,note\nbtn,Hello,"Hi, you"\n', 'csv', { ignoreKeys: 'id,note' })
  assert.equal(r.text, 'id,text,note\nbtn,[Hello],"Hi, you"\n')
})

test('xml: translatable="false" は残し、アポストロフィを Android 形式にする', async () => {
  const src = [
    '<resources>',
    '    <string name="a">Hello</string>',
    '    <string name="b" translatable="false">Keep</string>',
    "    <string name=\"c\">It\\'s <b>fine</b></string>",
    '</resources>',
    ''
  ].join('\n')
  const r = await run(src, 'xml')
  assert.ok(r.text.includes('<string name="a">[Hello]</string>'))
  assert.ok(r.text.includes('>Keep</string>'))
  assert.ok(r.text.includes("[It\\'s <b>fine</b>]"))
})
