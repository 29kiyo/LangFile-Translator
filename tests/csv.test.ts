import test from 'node:test'
import assert from 'node:assert/strict'
import { CSV, CSV_NH, TSV, detectDelim } from '../src/shared/formats/csv.ts'
import {
  csvColumnNames,
  detectFormat,
  encodeFor,
  extFor,
  findUntranslatedFor,
  keyEntries,
  planSegments,
  withHeader
} from '../src/shared/formats/index.ts'
import { pathId } from '../src/shared/keyscan.ts'

const csv = 'id,text\n1,Hello\n2,"Hi, there"\n'

test('csv: 位置と引用符', () => {
  const e = CSV.scan(csv)
  assert.deepEqual(
    e.map((x) => x.key),
    ['id', 'text', 'id', 'text']
  )
  assert.equal(e[1].text, 'Hello')
  assert.deepEqual([e[1].line, e[1].startCol, e[1].endCol], [2, 3, 8])
  assert.equal(e[3].text, 'Hi, there')
  assert.equal(e[3].quoted, true)
  assert.deepEqual([e[3].line, e[3].startCol, e[3].endCol], [3, 3, 14])
})

test('csv: 複数行のセルは skip、"" は " に戻す', () => {
  const e = CSV.scan('k,v\n1,"a ""b""\nc"\n2,x\n')
  assert.equal(e[1].text, 'a "b"\nc')
  assert.equal(e[1].skip, true)
  assert.equal(e[2].line, 4)
  assert.equal(e[3].text, 'x')
})

test('csv: 翻訳の埋め込み (引用符を保つ・必要なら付ける)', () => {
  const plan = planSegments('csv', csv, new Set(['id']))!
  assert.deepEqual(plan.texts, ['Hello', 'Hi, there'])
  const out = plan.build(
    new Map([
      ['Hello', 'a,b'],
      ['Hi, there', 'やあ']
    ])
  )
  assert.equal(out, 'id,text\n1,"a,b"\n2,"やあ"\n')
})

test('csv: 列単位の marks と無視キー', () => {
  const off = { marked: new Set([pathId(['text'])]), released: new Set<string>() }
  assert.deepEqual(planSegments('csv', csv, new Set(), off)!.texts, [])
  const on = { marked: new Set<string>(), released: new Set([pathId(['text'])]) }
  assert.deepEqual(planSegments('csv', csv, new Set(['text']), on)!.texts, ['Hello', 'Hi, there'])
  assert.deepEqual(planSegments('csv', csv, new Set(['text']))!.texts, [])
})

test('区切り文字の判定・TSV・見出しなし・CRLF', () => {
  assert.equal(detectDelim('a;b;c\nx;y;z'), ';')
  assert.equal(detectDelim('a,"x;y;z"\n'), ',')
  const tsv = 'k\tv\n1\tHello, world\n'
  assert.equal(TSV.scan(tsv)[1].text, 'Hello, world')
  assert.equal(
    planSegments('tsv', tsv, new Set())!.build(new Map([['Hello, world', 'こんにちは, 世界']])),
    'k\tv\n1\tこんにちは, 世界\n'
  )
  assert.deepEqual(
    CSV_NH.scan('a,b\nx,y\n').map((k) => k.key),
    ['1', '2', '1', '2']
  )
  const e = CSV.scan('a,b\r\nx,Hello\r\n')
  assert.deepEqual([e[1].line, e[1].startCol, e[1].endCol], [2, 3, 8])
})

test('csv: 未翻訳の判定・列名・補助関数', () => {
  const u = findUntranslatedFor('csv', 'k,v\n1,Hello\n2,Bye\n', 'k,v\n1,こんにちは\n2,Bye\n', 'structure', new Set())
  assert.equal(u.length, 1)
  assert.deepEqual([u[0].line, u[0].idx, u[0].startCol, u[0].endCol], [3, 3, 3, 6])
  assert.deepEqual(csvColumnNames('csv', 'id,text,id\n1,a,b\n'), ['id', 'text'])
  assert.deepEqual(csvColumnNames('csv-nh', 'a,b\nx,y,z\n'), ['1', '2', '3'])
  assert.equal(withHeader('tsv', false), 'tsv-nh')
  assert.equal(withHeader('json', false), 'json')
  assert.equal(extFor('csv-nh'), 'csv')
  assert.equal(extFor('arb'), 'arb')
  assert.equal(detectFormat('a.CSV', ''), 'csv')
  assert.equal(detectFormat('a.tsv', ''), 'tsv')
  assert.deepEqual(keyEntries('csv', csv), [])
  assert.equal(encodeFor('csv')('a,b'), '"a,b"')
  assert.equal(encodeFor('csv')('ab'), 'ab')
})
