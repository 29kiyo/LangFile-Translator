import { test } from 'node:test'
import assert from 'node:assert/strict'
import { codeFromFileName, flattenLocale, isLocaleCode, pickLocale, validateLocale } from '../src/shared/locale-file.ts'

const EN = {
  'nav.editor': 'Editor',
  'nav.settings': 'Settings',
  'uil.missing': '{n} key(s) shown in English',
  'uil.confirmDelete': 'Delete {file}?'
}

test('codeFromFileName', () => {
  assert.equal(codeFromFileName('ja_jp.json'), 'ja-jp')
  assert.equal(codeFromFileName('FR.JSON'), 'fr')
  assert.equal(codeFromFileName('zh-CN.json'), 'zh-cn')
  assert.equal(codeFromFileName('ja_jp (1).json'), null)
  assert.equal(codeFromFileName('language.json'), null)
  assert.equal(codeFromFileName('x.json'), null)
})

test('isLocaleCode only allows lowercase hyphenated codes', () => {
  assert.equal(isLocaleCode('fr-fr'), true)
  assert.equal(isLocaleCode('FR'), false)
  assert.equal(isLocaleCode('../x'), false)
})

test('flattenLocale flattens nested objects and drops non-strings and empty values', () => {
  assert.deepEqual(flattenLocale({ a: { b: 'x', c: 5, d: '' }, e: ['z'], f: 'y', g: '  ' }), { 'a.b': 'x', f: 'y' })
  assert.equal(flattenLocale([1]), null)
  assert.equal(flattenLocale('x'), null)
  assert.equal(flattenLocale(null), null)
})

test('validateLocale: nested file, missing key, broken placeholder, extra key', () => {
  const text = JSON.stringify({
    nav: { editor: 'Éditeur' },
    uil: { missing: '{n} clés', confirmDelete: 'Supprimer ?' },
    extraKey: 'x'
  })
  const r = validateLocale('fr_fr.json', text, EN)
  assert.equal(r.ok, true)
  assert.equal(r.code, 'fr-fr')
  assert.deepEqual(r.dict, { 'nav.editor': 'Éditeur', 'uil.missing': '{n} clés' })
  assert.deepEqual([...r.missing].sort(), ['nav.settings', 'uil.confirmDelete'])
  assert.deepEqual(r.extra, ['extraKey'])
})

test('validateLocale: flat file with a BOM', () => {
  const text = '\uFEFF' + JSON.stringify({ 'nav.editor': 'Editor2', 'nav.settings': 'S2' })
  const r = validateLocale('de.json', text, EN)
  assert.equal(r.ok, true)
  assert.deepEqual(r.dict, { 'nav.editor': 'Editor2', 'nav.settings': 'S2' })
})

test('validateLocale: rejections', () => {
  assert.equal(validateLocale('lang (1).json', '{}', EN).error, 'badName')
  assert.equal(validateLocale('en.json', '{}', EN).error, 'reserved')
  assert.equal(validateLocale('fr.json', '{oops', EN).error, 'badJson')
  assert.equal(validateLocale('fr.json', '[1]', EN).error, 'badJson')
  assert.equal(validateLocale('fr.json', '{"a":"b"}', EN).error, 'noKeys')
  assert.equal(validateLocale('fr.json', '{}', EN, true).error, 'tooBig')
})

test('pickLocale', () => {
  const av = ['en', 'ja', 'fr-fr', 'pt-br', 'zh-cn']
  assert.equal(pickLocale('ja', av), 'ja')
  assert.equal(pickLocale('JA-JP', av), 'ja')
  assert.equal(pickLocale('fr', av), 'fr-fr')
  assert.equal(pickLocale('fr-CA', av), 'fr-fr')
  assert.equal(pickLocale('pt_BR', av), 'pt-br')
  assert.equal(pickLocale('zh-CN', av), 'zh-cn')
  assert.equal(pickLocale('zh-TW', av), 'en')
  assert.equal(pickLocale('de', av), 'en')
  assert.equal(pickLocale('', av), 'en')
})
