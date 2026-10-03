import test from 'node:test'
import assert from 'node:assert/strict'
import { LANGUAGES, fileNameFor, getLanguage } from '../src/shared/languages.ts'

const name = (code: string): string =>
  fileNameFor(getLanguage(code) as NonNullable<ReturnType<typeof getLanguage>>)

test('file names: ja_jp style, languages without a region stay bare', () => {
  assert.equal(name('ja'), 'ja_jp.json')
  assert.equal(name('en'), 'en_us.json')
  assert.equal(name('eo'), 'eo.json')
  assert.equal(name('nb'), 'nb_no.json')
  assert.equal(name('fil'), 'fil_ph.json')
  assert.equal(name('yue'), 'yue_hk.json')
})

test('regional variants always keep the region', () => {
  assert.equal(name('zh-CN'), 'zh_cn.json')
  assert.equal(name('zh-TW'), 'zh_tw.json')
  assert.equal(name('zh-HK'), 'zh_hk.json')
  assert.equal(name('pt-BR'), 'pt_br.json')
  assert.equal(name('pt-PT'), 'pt_pt.json')
  assert.equal(name('en-GB'), 'en_gb.json')
  assert.equal(name('es-MX'), 'es_mx.json')
  assert.equal(name('fr-CA'), 'fr_ca.json')
  assert.equal(name('sr-Latn'), 'sr_latn.json')
})

test('codes and file names are unique', () => {
  const codes = LANGUAGES.map((l) => l.code)
  assert.equal(new Set(codes).size, codes.length)
  const names = LANGUAGES.map((l) => fileNameFor(l))
  assert.equal(new Set(names).size, names.length)
})

test('many languages, and every code has a display name', () => {
  assert.ok(LANGUAGES.length >= 145)
  const dn = new Intl.DisplayNames(['en'], { type: 'language' })
  for (const l of LANGUAGES) assert.ok(dn.of(l.code), l.code)
})
