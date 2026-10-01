import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  extract,
  langName,
  makeBatches,
  parseIgnoreKeys,
  protect,
  restore
} from '../src/main/translate/core.ts'

test('structure mode: values only, ignore keys, non-strings kept', () => {
  const json = {
    title: 'Hello',
    id: 'Keep me',
    n: 1,
    ok: true,
    nil: null,
    list: ['One', '123'],
    nested: { msg: 'World', url: 'Skip' }
  }
  const ex = extract(json, 'structure', parseIgnoreKeys(' id , url '))
  assert.deepEqual(ex.texts.sort(), ['Hello', 'One', 'World'])
  const out = ex.build(
    new Map([
      ['Hello', 'こんにちは'],
      ['One', '一'],
      ['World', '世界']
    ])
  )
  assert.deepEqual(out, {
    title: 'こんにちは',
    id: 'Keep me',
    n: 1,
    ok: true,
    nil: null,
    list: ['一', '123'],
    nested: { msg: '世界', url: 'Skip' }
  })
})

test('keys mode: keys are translated except ignored ones', () => {
  const json = { greeting: 'Hi', ignoreMe: 'X', sub: { label: 'Name' } }
  const ex = extract(json, 'keys', new Set(['ignoreMe']))
  assert.deepEqual(ex.texts.sort(), ['Hi', 'Name', 'greeting', 'label', 'sub'])
  const out = ex.build(
    new Map([
      ['greeting', 'あいさつ'],
      ['Hi', 'やあ'],
      ['sub', 'サブ'],
      ['label', 'ラベル'],
      ['Name', '名前']
    ])
  )
  assert.deepEqual(out, { あいさつ: 'やあ', ignoreMe: 'X', サブ: { ラベル: '名前' } })
})

test('keys mode: colliding translated keys fall back to the original key', () => {
  const ex = extract({ aa: 'v1', bb: 'v2' }, 'keys', new Set())
  const out = ex.build(
    new Map([
      ['aa', 'k'],
      ['bb', 'k'],
      ['v1', 'V1'],
      ['v2', 'V2']
    ])
  )
  assert.deepEqual(out, { k: 'V1', bb: 'V2' })
})

test('duplicate values are collected once', () => {
  const ex = extract({ a: 'same', b: 'same' }, 'structure', new Set())
  assert.deepEqual(ex.texts, ['same'])
})

test('protect / restore placeholders', () => {
  const src = 'Hello {name}, you have %d items <b>now</b> ${x} {{y}} %1$s'
  const p = protect(src)
  assert.equal(p.tokens.length, 7)
  assert.equal(restore(p.text, p.tokens), src)
  assert.equal(restore('⟦1⟧ ⟦0⟧', ['{a}', '%s']), '%s {a}')
  assert.equal(restore('⟦ 0 ⟧', ['{a}']), '{a}')
  assert.equal(restore('⟦0⟧', ['{a}', '%s']), null)
  assert.equal(restore('⟦0⟧⟦5⟧', ['{a}']), null)
})

test('makeBatches respects item and char limits', () => {
  assert.deepEqual(makeBatches(['aa', 'bb', 'cc', 'dd', 'eeeee'], 2, 100), [[0, 1], [2, 3], [4]])
  assert.deepEqual(makeBatches(['abcdefghij', 'a'], 10, 5), [[0], [1]])
})

test('parseIgnoreKeys trims and drops empties', () => {
  assert.deepEqual([...parseIgnoreKeys(' a, b ,,c ')], ['a', 'b', 'c'])
})

test('langName', () => {
  assert.match(langName('ja'), /Japanese/)
})
