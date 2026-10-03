import test from 'node:test'
import assert from 'node:assert/strict'
import { XML, encodeAndroid } from '../src/shared/formats/xml.ts'
import { pathId } from '../src/shared/keyscan.ts'

const src = [
  '<resources>',
  '    <!-- c -->',
  '    <string name="app">My App</string>',
  '    <string name="skip" translatable="false">Keep</string>',
  '    <string name="it">It\\\'s &amp; ok</string>',
  '    <string-array name="colors">',
  '        <item>Red</item>',
  '        <item>Blue</item>',
  '    </string-array>',
  '    <plurals name="files">',
  '        <item quantity="one">%d file</item>',
  '        <item quantity="other">%d files</item>',
  '    </plurals>',
  '    <string name="html"><![CDATA[<b>x</b>]]></string>',
  '</resources>',
  ''
].join('\n')

test('xml: string / array / plurals の位置・パス・skip', () => {
  const e = XML.scan(src)
  assert.deepEqual(
    e.map((x) => x.text),
    ['My App', 'Keep', "It\\'s &amp; ok", 'Red', 'Blue', '%d file', '%d files', '<![CDATA[<b>x</b>]]>']
  )
  assert.deepEqual(
    e.map((x) => x.skip),
    [false, true, false, false, false, false, false, true]
  )
  assert.deepEqual([e[0].line, e[0].startCol, e[0].endCol], [3, 24, 30])
  assert.equal(e[0].id, pathId(['string', 'app']))
  assert.equal(e[4].id, pathId(['colors', 1]))
  assert.equal(e[5].id, pathId(['files', 'one']))
  assert.equal(e[5].key, 'files')
})

test('xml: 翻訳文の埋め込み (エスケープ・タグの中は触らない)', () => {
  assert.equal(encodeAndroid('It\'s <b>bold</b> & "q"'), 'It\\\'s <b>bold</b> &amp; \\"q\\"')
  assert.equal(encodeAndroid("It\\'s"), "It\\'s")
  assert.equal(encodeAndroid('a\nb'), 'a\\nb')
  assert.equal(encodeAndroid('<a href="x">link</a> &amp; 1 < 2'), '<a href="x">link</a> &amp; 1 &lt; 2')
})

import { getLanguage } from '../src/shared/languages.ts'
import { outputPath } from '../src/shared/outname.ts'

test('xml: 出力パス (values-ja/strings.xml)', () => {
  const L = (c: string) => getLanguage(c) as NonNullable<ReturnType<typeof getLanguage>>
  assert.equal(outputPath('strings.xml', L('ja'), 'full', 'xml'), 'values-ja/strings.xml')
  assert.equal(outputPath('strings.xml', L('zh-CN'), 'full', 'xml'), 'values-zh-rCN/strings.xml')
  assert.equal(outputPath('strings.xml', L('pt-BR'), 'short', 'xml'), 'values-pt-rBR/strings.xml')
  assert.equal(outputPath('en_US.json', L('ja'), 'full', 'json'), 'ja_JP.json')
  assert.equal(outputPath('app_en.csv', L('ja'), 'full', 'csv-nh'), 'app_ja.csv')
})
