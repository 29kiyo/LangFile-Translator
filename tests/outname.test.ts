import test from 'node:test'
import assert from 'node:assert/strict'
import { getLanguage } from '../src/shared/languages.ts'
import { outputName } from '../src/shared/outname.ts'

const L = (c: string) => getLanguage(c) as NonNullable<ReturnType<typeof getLanguage>>

test('元の言語コードの形式に合わせる', () => {
  assert.equal(outputName('en_US.json', L('ja')), 'ja_JP.json')
  assert.equal(outputName('en_us.json', L('ja')), 'ja_jp.json')
  assert.equal(outputName('en.json', L('ja')), 'ja.json')
  assert.equal(outputName('en-US.json', L('ja')), 'ja-JP.json')
  assert.equal(outputName('messages_en.json', L('ja')), 'messages_ja.json')
  assert.equal(outputName('app_en_US.properties', L('ja')), 'app_ja_JP.properties')
  assert.equal(outputName('app_en.arb', L('de')), 'app_de.arb')
})

test('地域付きコード・スクリプト・地域なしの言語', () => {
  assert.equal(outputName('en_US.json', L('zh-CN')), 'zh_CN.json')
  assert.equal(outputName('en.json', L('zh-CN')), 'zh_cn.json')
  assert.equal(outputName('en_US.json', L('eo')), 'eo.json')
  assert.equal(outputName('en.json', L('pt-BR')), 'pt_br.json')
  assert.equal(outputName('en_US.json', L('zh-HK')), 'zh_HK.json')
  assert.equal(outputName('en_US.json', L('sr-Latn')), 'sr_Latn.json')
  assert.equal(outputName('en.json', L('sr-Latn')), 'sr_latn.json')
  assert.equal(outputName('en_US.json', L('nb')), 'nb_NO.json')
  assert.equal(outputName('en.json', L('nb')), 'nb.json')
})

test('言語コードが無い名前は ja_jp の形', () => {
  assert.equal(outputName('strings.json', L('ja')), 'ja_jp.json')
  assert.equal(outputName('app.properties', L('ja')), 'ja_jp.properties')
  assert.equal(outputName('', L('ja'), 'arb'), 'ja_jp.arb')
  assert.equal(outputName('', L('ja')), 'ja_jp.json')
})
