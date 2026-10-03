import test from 'node:test'
import assert from 'node:assert/strict'
import { YAML } from '../src/shared/formats/yaml.ts'
import { detectFormat, planSegments, findUntranslatedFor } from '../src/shared/formats/index.ts'
import { pathId } from '../src/shared/keyscan.ts'

const src = `# comment
app:
  title: Hello world
  quoted: "Say \\"hi\\""
  single: 'It''s ok'
  count: 3
  flag: true
  list:
    - First item
    - Second item
  long: |
    line1
    line2
`

test('yaml: 値の位置・種類・パス', () => {
  const e = YAML.scan(src)
  assert.deepEqual(
    e.map((x) => x.text),
    ['Hello world', 'Say "hi"', "It's ok", 'First item', 'Second item', 'line1\nline2\n']
  )
  assert.equal(e[0].line, 3)
  assert.deepEqual([e[0].startCol, e[0].endCol], [10, 21])
  assert.equal(e[1].quoted, true)
  assert.equal(e[3].id, pathId(['app', 'list', 0]))
  assert.equal(e[3].key, 'list')
  assert.equal(e[5].skip, true)
})

test('yaml: 翻訳の埋め込み (コメント・元の引用符を保つ)', () => {
  const plan = planSegments('yaml', src, new Set(['quoted']))!
  assert.deepEqual(plan.texts, ['Hello world', "It's ok", 'First item', 'Second item'])
  const out = plan.build(
    new Map([
      ['Hello world', '見出し: こんにちは'],
      ["It's ok", "大丈夫です'"],
      ['First item', '最初'],
      ['Second item', '2番目']
    ])
  )
  assert.ok(out.startsWith('# comment\n'))
  assert.ok(out.includes('title: "見出し: こんにちは"'))
  assert.ok(out.includes("single: '大丈夫です'''"))
  assert.ok(out.includes('- 最初\n'))
  assert.ok(out.includes('long: |\n    line1'))
  assert.ok(out.includes('quoted: "Say \\"hi\\""'))
})

test('yaml: 無視キーと行マーカー (親を無視すると配下も無視)', () => {
  assert.deepEqual(planSegments('yaml', src, new Set(['list']))!.texts, ['Hello world', 'Say "hi"', "It's ok"])
  const marks = { marked: new Set([pathId(['app', 'title'])]), released: new Set<string>() }
  assert.ok(!planSegments('yaml', src, new Set(), marks)!.texts.includes('Hello world'))
})

test('yaml: 未翻訳の判定と拡張子', () => {
  const u = findUntranslatedFor('yaml', 'a: Hello\nb: Bye\n', 'a: こんにちは\nb: Bye\n', 'structure', new Set())
  assert.equal(u.length, 1)
  assert.deepEqual([u[0].line, u[0].startCol, u[0].endCol], [2, 4, 7])
  assert.equal(detectFormat('en.yml', ''), 'yaml')
  assert.equal(detectFormat('en.YAML', ''), 'yaml')
  assert.deepEqual(YAML.scan('a: [unclosed'), [])
})
