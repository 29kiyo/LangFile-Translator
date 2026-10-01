import { test } from 'node:test'
import assert from 'node:assert/strict'
import { applyReplacements } from '../src/shared/textedit.ts'
import { findUntranslated } from '../src/shared/untranslated.ts'

test('replaces ranges on different lines', () => {
  const text = '{\n  "a": "x",\n  "b": "y"\n}'
  const out = applyReplacements(text, [
    { line: 2, startCol: 8, endCol: 11, text: '"あ"' },
    { line: 3, startCol: 8, endCol: 11, text: '"い"' }
  ])
  assert.equal(out, '{\n  "a": "あ",\n  "b": "い"\n}')
})

test('replaces two ranges on the same line without shifting', () => {
  const out = applyReplacements('{"k": "v"}', [
    { line: 1, startCol: 7, endCol: 10, text: '"値"' },
    { line: 1, startCol: 2, endCol: 5, text: '"キー"' }
  ])
  assert.equal(out, '{"キー": "値"}')
})

test('works with CRLF text', () => {
  const out = applyReplacements('{\r\n  "a": "x"\r\n}', [{ line: 2, startCol: 8, endCol: 11, text: '"Z"' }])
  assert.equal(out, '{\r\n  "a": "Z"\r\n}')
})

test('ignores a line that does not exist', () => {
  assert.equal(applyReplacements('abc', [{ line: 5, startCol: 1, endCol: 2, text: 'x' }]), 'abc')
})

test('replacing a reported untranslated item makes it disappear', () => {
  const src = { a: 'Hello', b: 'Keep me' }
  const srcText = JSON.stringify(src, null, 2)
  const out = '{\n  "a": "HELLO",\n  "b": "Keep me"\n}'
  const found = findUntranslated(srcText, out, 'structure', new Set())
  assert.equal(found.length, 1)
  const fixed = applyReplacements(
    out,
    found.map((u) => ({ line: u.line, startCol: u.startCol, endCol: u.endCol, text: JSON.stringify('KEEP ME') }))
  )
  assert.equal(findUntranslated(srcText, fixed, 'structure', new Set()).length, 0)
})
