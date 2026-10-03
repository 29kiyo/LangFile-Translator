import test from 'node:test'
import assert from 'node:assert/strict'
import { PO, finalizePo } from '../src/shared/formats/po.ts'
import { detectFormat, finalize, findUntranslatedFor, planSegments } from '../src/shared/formats/index.ts'
import { getLanguage } from '../src/shared/languages.ts'
import { outputName } from '../src/shared/outname.ts'

const po = `# comment
msgid ""
msgstr ""
"Language: en\\n"

#: a.c:1
msgid "Hello"
msgstr ""

msgid "Bye"
msgstr "Tschüss"

msgid "One file"
msgid_plural "%d files"
msgstr[0] ""
msgstr[1] ""
`

test('po: msgstr ごとの位置・skip・複数形', () => {
  const e = PO.scan(po)
  assert.deepEqual(
    e.map((x) => x.text),
    ['Hello', 'Tschüss', 'One file', '%d files']
  )
  assert.deepEqual(
    e.map((x) => x.skip),
    [false, true, false, false]
  )
  assert.deepEqual([e[0].line, e[0].startCol, e[0].endCol], [8, 8, 10])
})

test('po: 翻訳の埋め込みと Language ヘッダー', () => {
  const plan = planSegments('po', po, new Set())!
  assert.deepEqual(plan.texts, ['Hello', 'One file', '%d files'])
  const out = plan.build(
    new Map([
      ['Hello', 'こんにちは'],
      ['One file', 'ファイル'],
      ['%d files', '%d個のファイル']
    ])
  )
  assert.ok(out.includes('msgstr "こんにちは"'))
  assert.ok(out.includes('msgstr[0] "ファイル"'))
  assert.ok(out.includes('msgstr[1] "%d個のファイル"'))
  assert.ok(out.includes('msgstr "Tschüss"'))
  assert.ok(finalize('po', out, 'ja').includes('"Language: ja\\n"'))
  assert.ok(finalizePo(out, 'zh-CN').includes('"Language: zh_CN\\n"'))
})

test('po: 未翻訳の判定・拡張子・出力名', () => {
  const src = 'msgid "Hello"\nmsgstr ""\n\nmsgid "Bye"\nmsgstr ""\n'
  const outp = 'msgid "Hello"\nmsgstr "こんにちは"\n\nmsgid "Bye"\nmsgstr ""\n'
  const u = findUntranslatedFor('po', src, outp, 'structure', new Set())
  assert.equal(u.length, 1)
  assert.deepEqual([u[0].line, u[0].idx, u[0].startCol, u[0].endCol], [5, 1, 8, 10])
  assert.equal(detectFormat('app.POT', ''), 'po')
  assert.equal(detectFormat('en.po', ''), 'po')
  const ja = getLanguage('ja') as NonNullable<ReturnType<typeof getLanguage>>
  assert.equal(outputName('app.pot', ja, 'full', 'po'), 'ja_jp.po')
  assert.equal(outputName('en_US.po', ja, 'full', 'po'), 'ja_JP.po')
})
