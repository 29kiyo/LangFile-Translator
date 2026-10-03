import test from 'node:test'
import assert from 'node:assert/strict'
import { existsSync, mkdirSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { migrateUserData } from '../src/main/migrate.ts'

const tmp = (): string => mkdtempSync(join(tmpdir(), 'lft-'))

test('旧フォルダの設定と言語ファイルを、初回だけコピーする', () => {
  const root = tmp()
  const o = join(root, 'old')
  const n = join(root, 'new')
  mkdirSync(join(o, 'locales'), { recursive: true })
  writeFileSync(join(o, 'settings.json'), '{"theme":"light"}')
  writeFileSync(join(o, 'locales', 'fr.json'), '{}')
  assert.equal(migrateUserData(o, n), true)
  assert.equal(readFileSync(join(n, 'settings.json'), 'utf8'), '{"theme":"light"}')
  assert.ok(existsSync(join(n, 'locales', 'fr.json')))
  writeFileSync(join(n, 'settings.json'), '{"theme":"dark"}')
  assert.equal(migrateUserData(o, n), false)
  assert.equal(readFileSync(join(n, 'settings.json'), 'utf8'), '{"theme":"dark"}')
})

test('旧フォルダが無ければ何もしない', () => {
  const root = tmp()
  assert.equal(migrateUserData(join(root, 'old'), join(root, 'new')), false)
  assert.ok(!existsSync(join(root, 'new')))
})
