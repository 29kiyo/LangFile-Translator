import { test } from 'node:test'
import assert from 'node:assert/strict'
import { LANGUAGES, fileNameFor, getLanguage } from '../src/shared/languages.ts'

const name = (code: string, style: 'full' | 'short'): string =>
  fileNameFor(getLanguage(code) as NonNullable<ReturnType<typeof getLanguage>>, style)

test('file names: full (ja_jp) and short (ja) styles', () => {
  assert.equal(name('ja', 'full'), 'ja_jp.json')
  assert.equal(name('ja', 'short'), 'ja.json')
  assert.equal(name('en', 'full'), 'en_us.json')
  assert.equal(name('eo', 'full'), 'eo.json')
  assert.equal(name('eo', 'short'), 'eo.json')
})

test('regional variants always keep the region', () => {
  for (const style of ['full', 'short'] as const) {
    assert.equal(name('zh-CN', style), 'zh_cn.json')
    assert.equal(name('zh-TW', style), 'zh_tw.json')
    assert.equal(name('pt-BR', style), 'pt_br.json')
    assert.equal(name('pt-PT', style), 'pt_pt.json')
  }
})

test('codes and file names are unique in both styles', () => {
  assert.equal(new Set(LANGUAGES.map((l) => l.code)).size, LANGUAGES.length)
  for (const style of ['full', 'short'] as const) {
    const names = LANGUAGES.map((l) => fileNameFor(l, style))
    assert.equal(new Set(names).size, names.length)
  }
})

test('many languages, and every code has a display name', () => {
  assert.ok(LANGUAGES.length >= 130)
  const dn = new Intl.DisplayNames(['en'], { type: 'language' })
  for (const l of LANGUAGES) assert.equal(typeof dn.of(l.code), 'string')
  assert.match(dn.of('ja') as string, /Japanese/)
})
