import test from 'node:test'
import assert from 'node:assert/strict'
import { getLanguage } from '../src/shared/languages.ts'
import { outputName } from '../src/shared/outname.ts'

const L = (c: string) => getLanguage(c) as NonNullable<ReturnType<typeof getLanguage>>

test('元の言語コードの形式に合わせる', () => {
  assert.equal(outputName('en_US.json', L('ja'), 'full'), 'ja_JP.json')
  assert.equal(outputName('en_us.json', L('ja'), 'full'), 'ja_jp.json')
  assert.equal(outputName('en.json', L('ja'), 'full'), 'ja.json')
  assert.equal(outputName('en-US.json', L('ja'), 'full'), 'ja-JP.json')
  assert.equal(outputName('messages_en.json', L('ja'), 'full'), 'messages_ja.json')
  assert.equal(outputName('app_en_US.properties', L('ja'), 'short'), 'app_ja_JP.properties')
  assert.equal(outputName('app_en.arb', L('de'), 'full'), 'app_de.arb')
})

test('地域付きコード・地域なしの言語', () => {
  assert.equal(outputName('en_US.json', L('zh-CN'), 'full'), 'zh_CN.json')
  assert.equal(outputName('en.json', L('zh-CN'), 'full'), 'zh_cn.json')
  assert.equal(outputName('en_US.json', L('eo'), 'full'), 'eo.json')
  assert.equal(outputName('en.json', L('pt-BR'), 'short'), 'pt_br.json')
})

test('言語コードが無い名前は設定の形式を使う', () => {
  assert.equal(outputName('strings.json', L('ja'), 'full'), 'ja_jp.json')
  assert.equal(outputName('strings.json', L('ja'), 'short'), 'ja.json')
  assert.equal(outputName('app.properties', L('ja'), 'full'), 'ja_jp.properties')
  assert.equal(outputName('', L('ja'), 'full', 'arb'), 'ja_jp.arb')
  assert.equal(outputName('', L('ja'), 'short'), 'ja.json')
})
