import { test } from 'node:test'
import assert from 'node:assert/strict'
import { isIgnored, pathId, scanKeys } from '../src/shared/keyscan.ts'
import { extract } from '../src/main/translate/core.ts'

const SRC = `{
  "title": "Hello",
  "id": "abc-Hello",
  "nested": {
    "id": "x-Name",
    "msg": "Welcome"
  },
  "list": [
    "One",
    { "a": "A", "b": "B" }
  ],
  "a,b": "comma"
}`

test('scanKeys: lines and paths', () => {
  const e = scanKeys(SRC)
  const at = (p: (string | number)[]) => e.find((x) => x.id === pathId(p))
  assert.equal(at(['title'])?.line, 2)
  assert.equal(at(['id'])?.line, 3)
  assert.equal(at(['nested'])?.line, 4)
  assert.equal(at(['nested', 'id'])?.line, 5)
  assert.equal(at(['list', 1, 'a'])?.line, 10)
  assert.equal(at(['list', 1, 'b'])?.line, 10)
  assert.equal(at(['a,b'])?.line, 12)
  assert.equal(at(['a,b'])?.key, 'a,b')
  assert.equal(e.length, 9)
})

test('scanKeys: values containing colons or quotes are not keys', () => {
  const e = scanKeys('{\n "url": "https://x/a:b",\n "msg": "say \\"x\\": y"\n}')
  assert.deepEqual(
    e.map((x) => x.key),
    ['url', 'msg']
  )
})

test('scanKeys: escapes are decoded and minified text is scanned', () => {
  const e = scanKeys('{"say\\"hi":1,"\\u0041":[{"k":2}]}')
  assert.deepEqual(
    e.map((x) => [x.key, x.line]),
    [
      ['say"hi', 1],
      ['A', 1],
      ['k', 1]
    ]
  )
  assert.equal(e[2].id, pathId(['A', 0, 'k']))
})

test('scanKeys: broken JSON does not throw', () => {
  assert.doesNotThrow(() => scanKeys('{"a": ['))
  assert.doesNotThrow(() => scanKeys('}}]]"'))
})

test('isIgnored: listed keys are ignored except released ones, others only when marked', () => {
  const marks = { marked: new Set([pathId(['b'])]), released: new Set([pathId(['n', 'id'])]) }
  const list = new Set(['id'])
  assert.equal(isIgnored('id', ['id'], list, marks), true)
  assert.equal(isIgnored('id', ['n', 'id'], list, marks), false)
  assert.equal(isIgnored('b', ['b'], list, marks), true)
  assert.equal(isIgnored('c', ['c'], list, marks), false)
  assert.equal(isIgnored('id', ['n', 'id'], list), true)
})

test('extract: a marked occurrence is ignored, same-named keys elsewhere are translated', () => {
  const json = { id: 'One', nested: { id: 'Two' } }
  const marks = { marked: new Set([pathId(['nested', 'id'])]), released: new Set<string>() }
  const ex = extract(json, 'structure', new Set(), marks)
  assert.deepEqual(ex.texts, ['One'])
  assert.deepEqual(ex.build(new Map([['One', '1']])), { id: '1', nested: { id: 'Two' } })
})

test('extract: a released occurrence of a listed key is translated', () => {
  const json = { id: 'One', nested: { id: 'Two' } }
  const marks = { marked: new Set<string>(), released: new Set([pathId(['nested', 'id'])]) }
  const ex = extract(json, 'structure', new Set(['id']), marks)
  assert.deepEqual(ex.texts, ['Two'])
  assert.deepEqual(ex.build(new Map([['Two', '2']])), { id: 'One', nested: { id: '2' } })
})

test('extract: marking a parent keeps the whole subtree; array items use indexes', () => {
  const json = { keep: { a: 'A', b: ['B'] }, list: [{ x: 'X' }, { x: 'Y' }] }
  const marks = {
    marked: new Set([pathId(['keep']), pathId(['list', 0, 'x'])]),
    released: new Set<string>()
  }
  const ex = extract(json, 'structure', new Set(), marks)
  assert.deepEqual(ex.texts, ['Y'])
  assert.deepEqual(ex.build(new Map([['Y', 'y']])), {
    keep: { a: 'A', b: ['B'] },
    list: [{ x: 'X' }, { x: 'y' }]
  })
})

test('extract: keys mode keeps a marked key untranslated', () => {
  const json = { greeting: 'Hi', other: 'Yo' }
  const marks = { marked: new Set([pathId(['greeting'])]), released: new Set<string>() }
  const ex = extract(json, 'keys', new Set(), marks)
  assert.deepEqual(ex.texts.sort(), ['Yo', 'other'])
  assert.deepEqual(
    ex.build(
      new Map([
        ['Yo', 'やあ'],
        ['other', 'ほか']
      ])
    ),
    { greeting: 'Hi', ほか: 'やあ' }
  )
})
