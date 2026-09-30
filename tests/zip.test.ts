import { test } from 'node:test'
import assert from 'node:assert/strict'
import { strFromU8, unzipSync } from 'fflate'
import { makeZip } from '../src/main/zip.ts'

test('zip round trip keeps names and UTF-8 content', () => {
  const z = makeZip([
    { name: 'ja_jp.json', content: '{"a":"こんにちは"}' },
    { name: 'en_us.json', content: '{"a":"hi"}' }
  ])
  assert.equal(z[0], 0x50)
  assert.equal(z[1], 0x4b)
  const out = unzipSync(z)
  assert.deepEqual(Object.keys(out).sort(), ['en_us.json', 'ja_jp.json'])
  assert.equal(strFromU8(out['ja_jp.json']), '{"a":"こんにちは"}')
})
