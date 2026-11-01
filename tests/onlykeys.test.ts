import test from 'node:test'
import assert from 'node:assert/strict'
import { extract } from '../src/shared/translate-core.ts'
import { findUntranslated } from '../src/shared/untranslated.ts'
import { planSegments } from '../src/shared/formats/index.ts'
import { pathId, type Marks } from '../src/shared/keyscan.ts'

const mk = (only: string[], extra: Partial<Marks> = {}): Marks => ({
  marked: new Set(),
  released: new Set(),
  only: new Set(only),
  restrict: only.length > 0,
  ...extra
})

test('翻訳するキーのみ: 指定したキーの値だけ訳す', () => {
  const json = { menu: { title: 'Hello', id: 'abc' }, text: 'Bye' }
  assert.deepEqual(extract(json, 'structure', new Set(), mk(['title'])).texts, ['Hello'])
})

test('併用: 翻訳するキーの配下から、無視キーだけ除く', () => {
  const json = { text: { id: 'Some', body: 'Hello' }, other: 'Other' }
  assert.deepEqual(extract(json, 'structure', new Set(['id']), mk(['text'])).texts, ['Hello'])
})

test('同じキーが両方にあれば、翻訳しないが勝つ', () => {
  const json = { a: 'Hello', b: 'World' }
  assert.deepEqual(extract(json, 'structure', new Set(['a']), mk(['a', 'b'])).texts, ['World'])
  assert.deepEqual(extract(json, 'structure', new Set(['a']), mk(['a'])).texts, [])
})

test('近い方優先: 親が翻訳しないでも、子の翻訳するキーは訳す', () => {
  const json = { menu: { title: 'Hello', id: 'abc' } }
  const m = mk(['title'], { marked: new Set([pathId(['menu'])]), restrict: false })
  assert.deepEqual(extract(json, 'structure', new Set(), m).texts, ['Hello'])
})

test('行の青い点 (released) は、入力バーの無視キーに勝つ。青があれば他は訳さない', () => {
  const json = { a: 'Hello', b: 'World' }
  const m = mk([], { released: new Set([pathId(['a'])]), restrict: true })
  assert.deepEqual(extract(json, 'structure', new Set(['a']), m).texts, ['Hello'])
})

test('未翻訳の判定も同じ規則 (翻訳しない値は出さない)', () => {
  const src = '{"a":"Hello","b":"World"}'
  const u = findUntranslated(src, src, 'structure', new Set(), mk(['a']))
  assert.deepEqual(
    u.map((x) => x.source),
    ['Hello']
  )
})

test('1行1キーの形式 (properties) と、親を持つ形式 (yaml)', () => {
  const p = planSegments('properties', 'a=Hello\nb=Bye\nc=Moon\n', new Set(), mk(['a']))!
  assert.deepEqual(p.texts, ['Hello'])
  const y = planSegments('yaml', 'app:\n  title: Hello\n  sub:\n    x: World\nother: Bye\n', new Set(['app']))!
  assert.deepEqual(y.texts, ['Bye'])
})
