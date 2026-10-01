import { test } from 'node:test'
import assert from 'node:assert/strict'
import { extract, parseIgnoreKeys } from '../src/main/translate/core.ts'
import { pathId, scanStrings } from '../src/shared/keyscan.ts'
import type { Marks } from '../src/shared/keyscan.ts'
import { findUntranslated, needsTranslation } from '../src/shared/untranslated.ts'

const up = (s: string): string => s.toUpperCase()
const keep = (...keys: string[]) => (s: string): string => (keys.includes(s) ? s : up(s))

/** 実際の翻訳エンジンと同じ手順で出力テキストを作る */
function pipeline(
  src: unknown,
  tr: (s: string) => string,
  mode: 'structure' | 'keys' = 'structure',
  ignoreKeys = '',
  marks?: Marks
): string {
  const ex = extract(src, mode, parseIgnoreKeys(ignoreKeys), marks)
  const m = new Map(ex.texts.map((t) => [t, tr(t)] as const))
  return JSON.stringify(ex.build(m), null, 2)
}
const find = (
  src: unknown,
  out: string,
  mode: 'structure' | 'keys' = 'structure',
  ignoreKeys = '',
  marks?: Marks
) => findUntranslated(JSON.stringify(src, null, 2), out, mode, parseIgnoreKeys(ignoreKeys), marks)

test('nothing is reported when everything is translated', () => {
  const src = { a: 'Hello', b: ['One', 'Two'], n: { c: 'World' } }
  assert.deepEqual(find(src, pipeline(src, up)), [])
})

test('an unchanged value is reported with its output line and column range', () => {
  const src = { a: 'Hello', b: 'Keep me' }
  const r = find(src, pipeline(src, keep('Keep me')))
  assert.deepEqual(r, [{ line: 3, idx: 3, kind: 'value', source: 'Keep me', startCol: 8, endCol: 17 }])
})

test('values under an ignored key are not reported (list), but are without the list', () => {
  const src = { id: 'abc-Hello', msg: 'Welcome' }
  const out = pipeline(src, up, 'structure', 'id')
  assert.deepEqual(find(src, out, 'structure', 'id'), [])
  assert.equal(find(src, out, 'structure', '').length, 1)
})

test('marked occurrences are not reported; released ones are translated', () => {
  const src = { id: 'One', nested: { id: 'Two' } }
  const marked: Marks = { marked: new Set([pathId(['nested', 'id'])]), released: new Set() }
  const out1 = pipeline(src, up, 'structure', '', marked)
  assert.deepEqual(find(src, out1, 'structure', '', marked), [])
  assert.equal(find(src, out1).length, 1)
  const released: Marks = { marked: new Set(), released: new Set([pathId(['nested', 'id'])]) }
  const out2 = pipeline(src, up, 'structure', 'id', released)
  assert.deepEqual(find(src, out2, 'structure', 'id', released), [])
})

test('an ignored parent hides everything below it', () => {
  const src = { keep: { a: 'Alpha', b: ['Beta'] }, other: 'Gamma' }
  const out = pipeline(src, up, 'structure', 'keep')
  assert.deepEqual(find(src, out, 'structure', 'keep'), [])
})

test('placeholders, urls, emails and non-letter values are not reported', () => {
  const src = { a: '{count}', b: 'https://x.y/z', c: 'me@x.io', d: '123', e: '<b>', f: 'OK' }
  const r = find(src, JSON.stringify(src, null, 2))
  assert.deepEqual(
    r.map((x) => x.source),
    ['OK']
  )
  assert.equal(needsTranslation('Hello {name}'), true)
  assert.equal(needsTranslation('%s'), false)
  assert.equal(needsTranslation('www.example.com'), false)
})

test('keys mode also reports unchanged keys (key and value on one line count once per item)', () => {
  const src = { greeting: 'Hi' }
  const out = JSON.stringify(src, null, 2)
  const keys = find(src, out, 'keys')
  assert.deepEqual(
    keys.map((x) => [x.kind, x.line]),
    [
      ['key', 2],
      ['value', 2]
    ]
  )
  assert.deepEqual(
    find(src, out, 'structure').map((x) => x.kind),
    ['value']
  )
})

test('a structure mismatch reports nothing', () => {
  const src = { a: 'Hello', b: 'World' }
  assert.deepEqual(find(src, '{\n  "a": "HELLO"\n}'), [])
  assert.deepEqual(find(src, 'not json at all'), [])
})

test('integer-like keys are aligned in engine order, not text order', () => {
  const text = '{\n  "b": "x",\n  "1": "y"\n}'
  const out = pipeline(JSON.parse(text), up)
  assert.ok(out.indexOf('"1"') < out.indexOf('"b"'))
  assert.deepEqual(findUntranslated(text, out, 'structure', new Set()), [])
})

test('scanStrings: kinds and Monaco columns', () => {
  const t = scanStrings('{\n  "k": "v"\n}')
  assert.deepEqual(
    t.map((x) => [x.kind, x.text, x.line, x.startCol, x.endCol]),
    [
      ['key', 'k', 2, 3, 6],
      ['value', 'v', 2, 8, 11]
    ]
  )
})

test('dismissed items are not reported', () => {
  const src = { a: 'Hello', b: 'Keep me' }
  const out = pipeline(src, keep('Keep me'))
  const text = JSON.stringify(src, null, 2)
  assert.equal(findUntranslated(text, out, 'structure', new Set(), undefined, new Set([3])).length, 0)
  assert.equal(findUntranslated(text, out, 'structure', new Set(), undefined, new Set([1])).length, 1)
})
