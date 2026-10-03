import { cpSync, existsSync, mkdirSync } from 'fs'
import { join } from 'path'

/** 新しい保存先に settings.json が無く、旧保存先にあるときだけ、settings.json と locales をコピーする */
export function migrateUserData(oldDir: string, newDir: string): boolean {
  const oldSettings = join(oldDir, 'settings.json')
  if (!existsSync(oldSettings) || existsSync(join(newDir, 'settings.json'))) return false
  mkdirSync(newDir, { recursive: true })
  cpSync(oldSettings, join(newDir, 'settings.json'))
  const oldLocales = join(oldDir, 'locales')
  if (existsSync(oldLocales)) cpSync(oldLocales, join(newDir, 'locales'), { recursive: true })
  return true
}
