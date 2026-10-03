import test from 'node:test'
import assert from 'node:assert/strict'
import { INI, PROPERTIES } from '../src/shared/formats/line.ts'
import {
  detectFormat,
  effectiveIgnore,
  encodeFor,
  finalize,
  findUntranslatedFor,
  planSegments
} from '../src/shared/formats/index.ts'

const props = '# comment\nhello=Hello\\nWorld\nbye : Good bye\nmulti=a\\\n  b\nempty=\n'

test('properties: scan (コメント・継続行を除く)', () => {
  const es = PROPERTIES.scan(props)
  assert.deepEqual(
    es.map((e) => e.key),
    ['hello', 'bye', 'empty']
  )
  assert.equal(es[0].text, 'Hello\nWorld')
  assert.equal(es[0].line, 2)
  assert.equal(es[1].text, 'Good bye')
  assert.equal(es[1].startCol, 7)
  assert.equal(es[1].endCol, 15)
})

test('properties: 翻訳の埋め込み (無視キー・エスケープ)', () => {
  const plan = planSegments('properties', props, new Set(['bye']))!
  assert.deepEqual(plan.texts, ['Hello\nWorld'])
  const out = plan.build(new Map([['Hello\nWorld', 'こんにちは\n世界']]))
  assert.equal(out, props.replace('Hello\\nWorld', 'こんにちは\\n世界'))
})

const ini = '[General]\n; c\nname = "My App"\nlang=en\n[Other]\nname=Foo\n'

test('ini: セクション・引用符', () => {
  const e = INI.scan(ini)
  assert.deepEqual(
    e.map((x) => x.id),
    [JSON.stringify(['General', 'name']), JSON.stringify(['General', 'lang']), JSON.stringify(['Other', 'name'])]
  )
  assert.equal(e[0].text, 'My App')
  assert.equal(e[0].startCol, 9)
  assert.equal(e[0].endCol, 15)
})

test('ini: 行マーカー (marked) と無視キー', () => {
  const marks = { marked: new Set([JSON.stringify(['Other', 'name'])]), released: new Set<string>() }
  assert.deepEqual(planSegments('ini', ini, new Set(['lang']), marks)!.texts, ['My App'])
})

test('未翻訳の判定 (properties)', () => {
  const u = findUntranslatedFor('properties', 'a=Hello\nb=Bye\n', 'a=こんにちは\nb=Bye\n', 'structure', new Set())
  assert.equal(u.length, 1)
  assert.equal(u[0].line, 2)
  assert.equal(u[0].idx, 1)
  assert.equal(u[0].startCol, 3)
  assert.equal(u[0].endCol, 6)
  assert.equal(encodeFor('properties')('a\nb'), 'a\\nb')
  assert.equal(encodeFor('arb')('a"b'), '"a\\"b"')
})

test('形式の判定', () => {
  assert.equal(detectFormat('a.ARB', ''), 'arb')
  assert.equal(detectFormat('en_us.lang', ''), 'lang')
  assert.equal(detectFormat('strings.xml', ''), 'xml')
  assert.equal(detectFormat('layout.xml', ''), null)
  assert.equal(detectFormat('', '{"a":1}'), 'json')
  assert.equal(detectFormat('', '[s]\nk=v'), 'ini')
  assert.equal(detectFormat('', 'k=v'), 'properties')
})

const arb = '{\n  "@@locale": "en",\n  "hi": "Hello",\n  "@hi": { "description": "greeting" }\n}\n'

test('arb: @ のキーを無視し、@@locale を書き換える', () => {
  assert.deepEqual([...effectiveIgnore('arb', arb, new Set())].sort(), ['@@locale', '@hi'])
  assert.equal(finalize('arb', arb, 'zh-CN'), arb.replace('"en"', '"zh_CN"'))
})
