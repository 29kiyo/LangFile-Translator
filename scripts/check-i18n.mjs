// 使われている翻訳キー (t('...') と data-i18n) が、en.json / ja.json に揃っているかを調べる
import { readFileSync, readdirSync } from 'node:fs'
import { join } from 'node:path'

const walk = (d) =>
  readdirSync(d, { withFileTypes: true }).flatMap((e) => (e.isDirectory() ? walk(join(d, e.name)) : [join(d, e.name)]))
const files = walk('src/renderer').filter((f) => /\.(ts|html)$/.test(f))
const load = (n) => JSON.parse(readFileSync(`src/renderer/locales/${n}.json`, 'utf8'))
const en = load('en')
const ja = load('ja')

const used = new Map()
const prefixes = new Set()
const add = (k, f) => used.set(k, [...(used.get(k) ?? []), f])
for (const f of files) {
  const s = readFileSync(f, 'utf8')
  for (const m of s.matchAll(/data-i18n="([^"]+)"/g)) add(m[1], f)
  for (const m of s.matchAll(/\bt\('([^']+)'\)/g)) add(m[1], f)
  for (const m of s.matchAll(/\bt\(`([^`$]+)`\)/g)) add(m[1], f)
  for (const m of s.matchAll(/\bt\(`([^`$]*)\$\{/g)) prefixes.add(m[1])
  for (const m of s.matchAll(/\bt\([^()'`]*\?\s*'([^']+)'\s*:\s*'([^']+)'\s*\)/g)) {
    add(m[1], f)
    add(m[2], f)
  }
}
const keys = [...used.keys()]
const dynamic = (k) => [...prefixes].some((p) => k.startsWith(p))
let bad = 0
const report = (title, list, isError = true) => {
  console.log(`${title}: ${list.length ? '\n  ' + list.join('\n  ') : 'なし'}`)
  if (isError && list.length) bad++
}
report('使われているが en.json に無い', keys.filter((k) => !(k in en)).map((k) => `${k}  (${used.get(k)[0]})`))
report('使われているが ja.json に無い', keys.filter((k) => !(k in ja)).map((k) => `${k}  (${used.get(k)[0]})`))
report('en.json にあって ja.json に無い', Object.keys(en).filter((k) => !(k in ja)))
report('ja.json にあって en.json に無い', Object.keys(ja).filter((k) => !(k in en)))
report('使われていないキー (動的に組み立てるものを除く)', Object.keys(en).filter((k) => !used.has(k) && !dynamic(k)), false)
console.log(`動的に組み立てるキーの先頭: ${[...prefixes].join(', ') || 'なし'}`)

// 文言を直接書いている日本語の行 (コメントを除く)。言語名など、意図したものだけが並ぶこと
console.log('日本語を直接書いている行:')
for (const f of files.filter((x) => x.endsWith('.ts'))) {
  readFileSync(f, 'utf8')
    .split('\n')
    .forEach((line, i) => {
      const code = line.replace(/\s\/\/.*$/, '').trim()
      if (/[ぁ-んァ-ヶ一-龠]/.test(code) && !/^(\/\/|\/\*|\*)/.test(code)) console.log(`  ${f}:${i + 1}: ${code.slice(0, 100)}`)
    })
}
process.exitCode = bad ? 1 : 0
